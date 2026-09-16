'use strict';
const $ = id => document.getElementById(id);
let pictures = [], db = null, game = null, round = 0, importing = false;
let questionURL = null;
const galleryURLs = [];
// admin.html sets this flag before loading app.js, so the same script boots
// straight into the library there while index.html always opens on welcome.
const startScreen = window.PICTIONARAI_START === 'library' ? 'library' : 'home';
function show(id) {
  for (const section of document.querySelectorAll('.screen')) section.hidden = section.id !== id;
  // Ribbons belong to the result screen only: leaving it must clear any that
  // are still falling, otherwise they linger over the next screen.
  if (id !== 'result') for (const stage of document.querySelectorAll('.ribbon-stage')) stage.remove();
  // The header button is a way back out of the library only: it never shows
  // on the welcome, quiz or result screens, so participants cannot find it.
  // index.html has no library, and therefore no button either.
  const back = $('manage');
  if (back) back.hidden = id !== 'library';
  window.scrollTo(0, 0);
}
// index.html carries no library markup, so every element below is optional
// and must be guarded: the same script serves both pages.
function storageMessage(text) { const note = $('storage-note'); if (note) note.textContent = text; }
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
  // index.html carries the welcome markup, admin.html carries the library.
  // Each page only has the half it needs, so both are guarded.
  const startButton = $('start'), ready = $('ready');
  if (startButton) startButton.disabled = importing || pictures.length < Quiz.MIN_PICTURES;
  if (ready) {
    ready.hidden = pictures.length >= Quiz.MIN_PICTURES;
    ready.textContent = pictures.length >= Quiz.MIN_PICTURES ? '' : `Organizer: open Admin and add ${Quiz.MIN_PICTURES - pictures.length} more picture${Quiz.MIN_PICTURES - pictures.length === 1 ? '' : 's'} to begin.`;
  }
  const count = $('library-count'), gallery = $('gallery');
  if (!count || !gallery) return;
  const ai = pictures.filter(p => p.isAI).length;
  count.textContent = `${pictures.length} pictures · ${ai} AI · ${pictures.length - ai} real`;
  galleryURLs.forEach(url => URL.revokeObjectURL(url)); galleryURLs.length = 0;
  gallery.replaceChildren();
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
    bottom.append(label, remove); tile.append(img, bottom); gallery.append(tile);
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
  // The file inputs live on admin.html; on index.html there is nothing to lock.
  const inputs = [$('ai-files'), $('real-files')].filter(Boolean);
  importing = true; inputs.forEach(input => input.disabled = true); refresh();
  let added = 0, skipped = 0, failed = 0;
  for (const file of files) {
    storageMessage(`Importing picture ${added + skipped + failed + 1} of ${files.length}…`);
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type) || !await validImage(file)) { skipped++; continue; }
    const picture = { id: crypto.randomUUID(), isAI, blob: file };
    try { if (db) await databaseAction('readwrite', store => store.add(picture)); pictures.push(picture); added++; }
    catch { failed++; }
  }
  importing = false; inputs.forEach(input => { input.disabled = false; input.value = ''; }); refresh();
  storageMessage(`${added} picture${added === 1 ? '' : 's'} added.${skipped ? ` ${skipped} unsupported or unreadable file(s) skipped.` : ''}${failed ? ` ${failed} could not be saved; browser storage may be full.` : ''} ${db ? 'Stored locally in this browser. Keep the same browser profile and app location for the event; retain your original image files as a backup.' : 'Temporary session only: browser storage is unavailable. Keep this tab open; reload will clear the library.'}`);
}
function start() {
  if (importing || pictures.length < Quiz.MIN_PICTURES) return;
  game = Quiz.create(pictures); round = 0; show('game'); renderRound();
}
function renderStreak() {
  $('score').textContent = game.streak;
  $('progress').setAttribute('aria-label', `${game.streak} of ${Quiz.TARGET} consecutive correct answers`);
  // Segments are created once and only re-classed afterwards: rebuilding
  // them would skip the CSS transition and jump straight to the final state.
  while ($('progress').childElementCount < Quiz.TARGET) $('progress').append(document.createElement('span'));
  const items = [...$('progress').children];
  items.forEach((item, index) => {
    // The left transform-origin makes the fill grow rightwards when a
    // segment turns green and retract leftwards when the streak resets.
    item.classList.toggle('correct', index < game.streak);
  });
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
  $('result-title').textContent = 'Congratulations!';
  $('result-description').textContent = 'You got two pictures right in a row. Challenge passed!';
  $('result-rounds').textContent = `${game.answers.length} pictures answered`;
  show('result');
  celebrate();
}
// Real 3D ribbons: each piece is a DOM element animated with rotateX/rotateY
// inside a perspective container, so it flips through space instead of
// spinning as a flat rectangle. Pieces remove themselves when they land.
function celebrate() {
  const colors = ['#e5433f', '#f2a93b', '#f2e14c', '#5fb85f', '#3f8ee5'];
  for (const leftover of document.querySelectorAll('.ribbon-stage')) leftover.remove();
  const stage = document.createElement('div');
  stage.className = 'ribbon-stage';
  stage.setAttribute('aria-hidden', 'true');
  document.body.append(stage);
  for (let index = 0; index < 140; index++) {
    const piece = document.createElement('span');
    piece.className = 'ribbon';
    const width = 8 + Math.random() * 10;
    const height = width * (1.6 + Math.random() * 1.4);
    const duration = 2.6 + Math.random() * 2.2;
    piece.style.cssText =
      `left:${Math.random() * 100}%;` +
      `width:${width}px;height:${height}px;` +
      `background:${colors[index % colors.length]};` +
      `animation-duration:${duration}s;` +
      `animation-delay:${Math.random() * .9}s;` +
      `--drift:${(Math.random() * 2 - 1) * 240}px;` +
      `--spin:${(Math.random() * 2 - 1) * 1080}deg;` +
      `--tumble:${(Math.random() * 2 - 1) * 900}deg;`;
    stage.append(piece);
  }
  setTimeout(() => stage.remove(), 6500);
}
// Touch browsers can drop the :active state during a press, so the sunken
// look is driven by pointer events instead. pointercancel and pointerleave
// release the button if the finger slides away or the gesture is taken over.
const pressable = 'button:not(:disabled)';
document.addEventListener('pointerdown', event => {
  const button = event.target.closest(pressable);
  if (button) button.classList.add('pressing');
});
for (const release of ['pointerup', 'pointercancel', 'pointerleave']) {
  document.addEventListener(release, event => {
    const button = event.target.closest(pressable);
    if (button) button.classList.remove('pressing');
  });
}
const aiInput = $('ai-files'), realInput = $('real-files');
if (aiInput) aiInput.onchange = event => importPictures([...event.target.files], true);
if (realInput) realInput.onchange = event => importPictures([...event.target.files], false);
// The header button exists on admin.html only, where it leaves the page
// entirely so the URL never keeps /admin.html in the address bar. './'
// resolves to the site root rather than an explicit index.html.
const backButton = $('manage');
if (backButton) backButton.onclick = () => { location.href = './'; };
$('home-link').onclick = event => {
  event.preventDefault();
  if (startScreen === 'library') { location.href = './'; return; }
  const quiz = $('game');
  if (quiz && !quiz.hidden && !confirm('End this game and return to the welcome screen?')) return;
  show('home');
};
// Switch screens before the database work starts: opening IndexedDB and
// decoding the bundled photographs takes long enough to be visible, so the
// library must not wait for it. refresh() fills the grid in when it resolves.
if (startScreen === 'library') show('library');
// Everything below belongs to the quiz, which lives on index.html only.
// bind() skips any element the current page does not contain.
function bind(id, handler) { const element = $(id); if (element) element.onclick = handler; }
bind('start', start);
bind('abort', () => {
  game = null;
  round = 0;
  $('question-image').onload = $('question-image').onerror = null;
  $('question-image').removeAttribute('src');
  if (questionURL) { URL.revokeObjectURL(questionURL); questionURL = null; }
  $('yes').disabled = $('no').disabled = true;
  $('feedback').hidden = true;
  show('home');
  $('start').focus();
});
bind('back-home', () => show('home'));
bind('yes', () => submit(true)); bind('no', () => submit(false));
bind('next', () => { if (game.answers.length !== round + 1) return; if (Quiz.passed(game)) finish(); else { round = Quiz.next(game); renderRound(); } });
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
