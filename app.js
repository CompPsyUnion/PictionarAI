'use strict';
const $ = id => document.getElementById(id);
let pictures = [], db = null, game = null, round = 0, importing = false;
let questionURL = null;
const galleryURLs = [];
function show(id) {
  for (const section of document.querySelectorAll('.screen')) section.hidden = section.id !== id;
  $('manage').hidden = id === 'game';
  window.scrollTo(0, 0);
}
function storageMessage(text) { $('storage-note').textContent = text; }
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('picture-this-event', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pictures', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Storage is blocked by another window.'));
  });
}
function databaseAction(mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pictures', mode);
    const request = action(tx.objectStore('pictures'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function refresh() {
  $('start').disabled = importing || pictures.length < Quiz.MIN_PICTURES;
  $('ready').hidden = pictures.length >= Quiz.MIN_PICTURES;
  $('ready').textContent = pictures.length >= Quiz.MIN_PICTURES ? '' : `Organizer: open Admin and add ${Quiz.MIN_PICTURES - pictures.length} more picture${Quiz.MIN_PICTURES - pictures.length === 1 ? '' : 's'} to begin.`;
  const ai = pictures.filter(p => p.isAI).length;
  $('library-count').textContent = `${pictures.length} pictures · ${ai} AI · ${pictures.length - ai} real`;
  galleryURLs.forEach(url => URL.revokeObjectURL(url)); galleryURLs.length = 0;
  $('gallery').replaceChildren();
  for (const picture of pictures) {
    const tile = document.createElement('div'); tile.className = 'tile';
    const img = document.createElement('img'); img.src = URL.createObjectURL(picture.blob); galleryURLs.push(img.src); img.alt = picture.isAI ? 'AI-generated library picture' : 'Real library photograph'; img.loading = 'lazy';
    const bottom = document.createElement('div'); bottom.className = 'tile-bottom';
    const label = document.createElement('span'); label.textContent = picture.isAI ? '✳ AI-generated' : '◎ Real photo';
    const remove = document.createElement('button'); remove.textContent = 'Remove'; remove.disabled = importing;
    remove.onclick = async () => {
      if (!confirm('Remove this picture from the event library?')) return;
      try { if (db) await databaseAction('readwrite', store => picture.id.startsWith('bundled-') ? store.put({ id: picture.id, removed: true }) : store.delete(picture.id)); pictures = pictures.filter(p => p.id !== picture.id); refresh(); }
      catch { storageMessage('Could not remove this picture. Please try again.'); }
    };
    bottom.append(label, remove); tile.append(img, bottom); $('gallery').append(tile);
  }
}
async function validImage(file) {
  const url = URL.createObjectURL(file);
  try { const img = new Image(); img.src = url; await img.decode(); return img.naturalWidth > 0; }
  catch { return false; }
  finally { URL.revokeObjectURL(url); }
}
async function importPictures(files, isAI) {
  if (importing) return;
  importing = true; $('ai-files').disabled = $('real-files').disabled = $('done').disabled = true; refresh();
  let added = 0, skipped = 0, failed = 0;
  for (const file of files) {
    storageMessage(`Importing picture ${added + skipped + failed + 1} of ${files.length}…`);
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type) || !await validImage(file)) { skipped++; continue; }
    const picture = { id: crypto.randomUUID(), isAI, blob: file };
    try { if (db) await databaseAction('readwrite', store => store.add(picture)); pictures.push(picture); added++; }
    catch { failed++; }
  }
  importing = false; $('ai-files').disabled = $('real-files').disabled = $('done').disabled = false;
  $('ai-files').value = $('real-files').value = ''; refresh();
  storageMessage(`${added} picture${added === 1 ? '' : 's'} added.${skipped ? ` ${skipped} unsupported or unreadable file(s) skipped.` : ''}${failed ? ` ${failed} could not be saved; browser storage may be full.` : ''} ${db ? 'Stored locally in this browser. Keep the same browser profile and app location for the event; retain your original image files as a backup.' : 'Temporary session only: browser storage is unavailable. Keep this tab open; reload will clear the library.'}`);
}
function start() {
  if (importing || pictures.length < Quiz.MIN_PICTURES) return;
  game = Quiz.create(pictures); round = 0; show('game'); renderRound();
}
function renderStreak() {
  $('score').textContent = game.streak;
  $('progress').setAttribute('aria-label', `${game.streak} of ${Quiz.TARGET} consecutive correct answers`);
  $('progress').replaceChildren(...Array.from({ length: Quiz.TARGET }, (_, index) => {
    const item = document.createElement('span'); item.className = index < game.streak ? 'correct' : ''; return item;
  }));
}
function renderRound() {
  $('round').textContent = `PICTURE ${String(round + 1).padStart(2, '0')}`;
  renderStreak();
  $('yes').disabled = $('no').disabled = true;
  $('feedback').hidden = true; $('answer-hint').textContent = 'Loading picture…';
  if (questionURL) URL.revokeObjectURL(questionURL);
  questionURL = URL.createObjectURL(game.pictures[round].blob);
  $('question-image').onload = () => { $('yes').disabled = $('no').disabled = false; $('answer-hint').textContent = 'Look closely. Trust your instinct.'; };
  $('question-image').onerror = () => { $('answer-hint').textContent = 'Picture could not load. Return to welcome and check the library.'; };
  $('question-image').src = questionURL;
}
function submit(choice) {
  if ($('yes').disabled || !game) return;
  const correct = Quiz.answer(game, round, choice);
  if (correct === null) return;
  $('yes').disabled = $('no').disabled = true;
  renderStreak();
  $('feedback').className = correct ? 'feedback' : 'feedback wrong';
  $('feedback-text').textContent = `${correct ? (Quiz.passed(game) ? 'Two correct in a row! You passed!' : 'Correct! One more in a row to pass.') : 'Not quite. Your streak resets to zero. Keep trying!'} This picture is ${game.pictures[round].isAI ? 'AI-generated.' : 'a real photograph.'}`;
  $('feedback').hidden = false; $('answer-hint').textContent = 'Answer locked in.';
  $('next').textContent = Quiz.passed(game) ? 'See my result →' : 'Next picture →'; $('next').focus();
}
function finish() {
  if (!Quiz.passed(game)) return;
  $('result-title').textContent = 'You’ve got the eye.';
  $('result-description').textContent = 'You got two pictures right in a row. Challenge passed!';
  $('final-score').textContent = game.streak;
  $('result-rounds').textContent = `${game.answers.length} pictures answered`;
  show('result');
}
$('ai-files').onchange = event => importPictures([...event.target.files], true);
$('real-files').onchange = event => importPictures([...event.target.files], false);
$('manage').onclick = () => show('library');
$('done').onclick = () => show('home');
$('home-link').onclick = event => { event.preventDefault(); if (!$('game').hidden && !confirm('End this game and return to the welcome screen?')) return; show('home'); };
$('start').onclick = start;
$('abort').onclick = () => {
  game = null;
  round = 0;
  $('question-image').onload = $('question-image').onerror = null;
  $('question-image').removeAttribute('src');
  if (questionURL) { URL.revokeObjectURL(questionURL); questionURL = null; }
  $('yes').disabled = $('no').disabled = true;
  $('feedback').hidden = true;
  show('home');
  $('start').focus();
};
$('back-home').onclick = () => show('home');
$('yes').onclick = () => submit(true); $('no').onclick = () => submit(false);
$('next').onclick = () => { if (game.answers.length !== round + 1) return; if (Quiz.passed(game)) finish(); else { round = Quiz.next(game); renderRound(); } };
(async () => {
  try { db = await openDatabase(); pictures = await databaseAction('readonly', store => store.getAll()); storageMessage('Pictures are stored locally in this browser. Keep the same browser profile and app location, and retain your original files as a backup.'); }
  catch { db = null; storageMessage('Browser storage is unavailable. Pictures will work for this session only. Keep this tab open during the event.'); }
  const existing = new Set(pictures.map(p => p.id));
  pictures = pictures.filter(p => !p.removed);
  for (const entry of window.BUNDLED_PICTURES || []) {
    if (existing.has(entry.id)) continue;
    const bytes = Uint8Array.from(atob(entry.base64), character => character.charCodeAt(0));
    const picture = { id: entry.id, isAI: entry.isAI, blob: new Blob([bytes], { type: 'image/jpeg' }) };
    pictures.push(picture);
    if (db) {
      try { await databaseAction('readwrite', store => store.put(picture)); }
      catch { storageMessage('Bundled photographs are ready for this session, but could not be saved to browser storage. They will load again when you reopen the app.'); }
    }
  }
  refresh();
})();
