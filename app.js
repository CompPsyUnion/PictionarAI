'use strict';
const $ = id => document.getElementById(id);
const ROUND_SECONDS = 60;
const REVEAL_MS = 1000;
const MANIFEST = 'pictures.json';
let pictures = [], game = null, choices = [], currentGroup = [],
    roundTimer = null, revealTimer = null;

const startScreen = window.PICTIONARAI_START === 'library' ? 'library' : 'home';

function show(id) {
  for (const section of document.querySelectorAll('.screen')) section.hidden = section.id !== id;
  if (id !== 'result') for (const stage of document.querySelectorAll('.ribbon-stage')) stage.remove();
  const back = $('manage');
  if (back) back.hidden = id !== 'library';
  window.scrollTo(0, 0);
}

function storageMessage(text) { const note = $('storage-note'); if (note) note.textContent = text; }

/** Loads the picture manifest and turns it into { route, isAI } entries.
 *  A missing or malformed manifest leaves the library empty rather than
 *  starting a round with pictures the page cannot display. */
async function loadPictures() {
  let manifest;
  try {
    const response = await fetch(MANIFEST, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    manifest = await response.json();
  } catch {
    storageMessage(`Could not read ${MANIFEST}. Check that the file sits next to index.html and holds a { "path": true|false } map.`);
    return [];
  }
  const entries = Object.entries(manifest).filter(([route, isAI]) => typeof route === 'string' && typeof isAI === 'boolean');
  return entries.map(([route, isAI]) => ({ id: route, route, isAI }));
}

/** Warms the browser cache for the pictures the participant is about to see,
 *  so the next group is already decoded by the time the cards flip. The
 *  current group is never passed in: it is on screen and would be decoded
 *  twice. Nothing is awaited, so a slow picture cannot delay the round. */
function warmUpcoming(upcoming) {
  for (const picture of upcoming) {
    if (!picture) continue;
    const img = new Image();
    img.src = picture.route;
  }
}

/** Decodes a group up front and resolves once every picture has settled,
 *  whether it loaded or not. Used to gate the start button, because a round
 *  that begins before the first group is readable shows empty cards. */
function decodeGroup(group) {
  return Promise.all(group.map(picture => new Promise(resolve => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = picture.route;
  })));
}

/** Builds the round the start button will hand over and decodes its first
 *  group, then unlocks the button. The round is kept in `game`, so pressing
 *  start opens exactly the group that was decoded instead of reshuffling into
 *  a different one. */
async function armStart() {
  const startButton = $('start'), ready = $('ready');
  if (!startButton) return;
  if (pictures.length < Quiz.MIN_PICTURES) return;
  startButton.disabled = true;
  if (ready) { ready.hidden = false; ready.textContent = 'Loading the first pictures…'; }
  game = Quiz.create(pictures);
  const first = Quiz.next(game);
  await decodeGroup(first);
  if (!game) return;
  startButton.disabled = false;
  if (ready) { ready.hidden = true; ready.textContent = ''; }
}

function refresh() {
  const startButton = $('start'), ready = $('ready');
  if (startButton) startButton.disabled = pictures.length < Quiz.MIN_PICTURES;
  if (ready) {
    ready.hidden = pictures.length >= Quiz.MIN_PICTURES;
    ready.textContent = pictures.length >= Quiz.MIN_PICTURES ? '' : `Organizer: add ${Quiz.MIN_PICTURES - pictures.length} more picture${Quiz.MIN_PICTURES - pictures.length === 1 ? '' : 's'} to ${MANIFEST} to begin.`;
  }
  const count = $('library-count'), gallery = $('gallery');
  if (!count || !gallery) return;
  const ai = pictures.filter(p => p.isAI).length;
  count.textContent = `${pictures.length} pictures · ${ai} AI · ${pictures.length - ai} real`;
  gallery.replaceChildren();
  for (const picture of pictures) {
    const tile = document.createElement('div'); tile.className = 'tile';
    const img = document.createElement('img');
    img.src = picture.route;
    img.alt = picture.isAI ? 'AI-generated library picture' : 'Real library photograph';
    img.loading = 'lazy';
    const bottom = document.createElement('div'); bottom.className = 'tile-bottom';
    const label = document.createElement('span'); label.textContent = picture.isAI ? '✳ AI-generated' : '◎ Real photo';
    const file = document.createElement('span'); file.className = 'tile-file';
    file.textContent = picture.route.split('/').pop();
    bottom.append(label, file); tile.append(img, bottom); gallery.append(tile);
  }
}

function start() {
  if (pictures.length < Quiz.MIN_PICTURES) return;
  if (!game) return;
  choices = []; revealTimer = null;
  const first = game.pending;
  warmUpcoming(game.remaining.slice(-Quiz.GROUP_SIZE));
  show('game');
  renderGroup(first, 0);
  startTimer(ROUND_SECONDS);
}

function startTimer(seconds) {
  stopTimer();
  let left = seconds;
  const render = () => {
    const timer = $('timer');
    timer.textContent = left;
    timer.classList.toggle('urgent', left <= 5);
  };
  render();
  roundTimer = setInterval(() => {
    left--;
    if (left <= 0) { stopTimer(); finish(false); return; }
    render();
  }, 1000);
}

function stopTimer() { clearInterval(roundTimer); roundTimer = null; }

/** Builds one side of a card: its picture plus the AI / Real buttons. */
function buildFace(picture, index, side) {
  const face = document.createElement('div'); face.className = `card-face card-${side}`;
  const frame = document.createElement('div'); frame.className = 'group-frame';
  const img = document.createElement('img');
  img.src = picture.route;
  img.alt = 'Challenge picture — decide whether it was generated by AI';
  const pick = document.createElement('div'); pick.className = 'verdict';
  const ai = document.createElement('button'); ai.type = 'button'; ai.className = 'verdict-button ai'; ai.textContent = 'AI';
  const real = document.createElement('button'); real.type = 'button'; real.className = 'verdict-button real'; real.textContent = 'Real';
  ai.onpointerdown = () => choose(index, true);
  real.onpointerdown = () => choose(index, false);
  ai.onclick = event => { if (event.detail === 0) choose(index, true); };
  real.onclick = event => { if (event.detail === 0) choose(index, false); };
  pick.append(ai, real);
  frame.append(img);
  face.append(frame, pick);
  return face;
}

function renderGroup(group, groupIndex) {
  currentGroup = group;
  choices = new Array(group.length).fill(null);
  $('round').textContent = `GROUP ${String(groupIndex + 1).padStart(2, '0')}`;
  renderStreak();
  const container = $('group');
  container.replaceChildren();
  group.forEach((picture, index) => {
    const card = document.createElement('div'); card.className = 'group-card';
    const inner = document.createElement('div'); inner.className = 'card-inner';
    inner.append(buildFace(picture, index, 'front'));
    card.append(inner);
    container.append(card);
  });
  $('feedback').hidden = true;
  $('feedback').className = 'feedback';
  $('judge').disabled = true;
  updateJudge();
}

/** Reveals the next group on the reverse of each card, then swaps it to the
 *  front so the round can continue without a visible reset. */
function flipToGroup(cards, group, groupIndex) {
  cards.forEach((card, index) => {
    const back = buildFace(group[index], index, 'back');
    back.querySelectorAll('.verdict-button').forEach(button => { button.disabled = true; });
    card.querySelector('.card-inner').append(back);
    card.classList.add('flipped');
  });
  setTimeout(() => {
    cards.forEach(card => {
      const inner = card.querySelector('.card-inner');
      // The reverse is promoted in place instead of being rebuilt, so the
      // picture is never decoded twice and no object URL leaks. The reset
      // must not animate: un-rotating with the transition still active would
      // play a second flip as the card springs back to zero.
      inner.classList.add('no-flip');
      const shown = inner.querySelector('.card-back');
      shown.className = 'card-face card-front';
      inner.replaceChildren(shown);
      shown.querySelectorAll('.verdict-button').forEach(button => { button.disabled = false; });
      card.classList.remove('flipped', 'right', 'wrong');
      void inner.offsetWidth;
      inner.classList.remove('no-flip');
    });
    currentGroup = group;
    choices = new Array(group.length).fill(null);
    $('round').textContent = `GROUP ${String(groupIndex + 1).padStart(2, '0')}`;
    $('judge').disabled = true;
    updateJudge();
    warmUpcoming(game ? game.remaining.slice(-Quiz.GROUP_SIZE) : []);
  }, 620);
}

function choose(index, isAI) {
  if (revealTimer || !currentGroup.length) return;
  choices[index] = isAI;
  const card = $('group').children[index];
  const picked = card.querySelector(isAI ? '.verdict-button.ai' : '.verdict-button.real');
  const other = card.querySelector(isAI ? '.verdict-button.real' : '.verdict-button.ai');
  picked.classList.add('selected');
  other.classList.remove('selected');
  updateJudge();
}

function updateJudge() {
  const ready = choices.length === currentGroup.length && choices.every(choice => choice !== null);
  $('judge').disabled = !ready;
}

function judge() {
  if (revealTimer || !game) return;
  const result = Quiz.answer(game, currentGroup, choices);
  if (!result) return;
  renderStreak();
  const best = game.results.length === 1 ? 'Best possible score.' : 'Keep it up.';
  $('feedback').className = result.solved ? 'feedback' : 'feedback wrong';
  $('feedback-text').textContent = `${result.correct} of ${Quiz.GROUP_SIZE} correct. ${result.solved ? (Quiz.passed(game) ? 'Two clean groups! You passed!' : `${best} One more clean group to pass.`) : 'A single mistake resets your streak.'}`;
  $('feedback').hidden = false;
  $('judge').disabled = true;
  const cards = [...$('group').children];
  cards.forEach((card, index) => {
    const truth = currentGroup[index].isAI;
    const right = truth === choices[index];
    card.classList.add(right ? 'right' : 'wrong');
    const truthButton = card.querySelector(truth ? '.verdict-button.ai' : '.verdict-button.real');
    const buttons = [...card.querySelectorAll('.verdict-button')];
    truthButton.classList.add('answer');
    if (!right) buttons.find(button => button !== truthButton).classList.add('missed');
    buttons.forEach(button => { button.disabled = true; });
  });
  warmUpcoming(game.remaining.slice(-Quiz.GROUP_SIZE));
  revealTimer = setTimeout(() => {
    revealTimer = null;
    if (Quiz.passed(game)) { finish(true); return; }
    const next = Quiz.next(game);
    flipToGroup(cards, next, game.results.length);
  }, REVEAL_MS);
}

function renderStreak() {
  const score = $('score'), progress = $('progress');
  if (!score || !progress) return;
  score.textContent = game.streak;
  progress.setAttribute('aria-label', `${game.streak} of ${Quiz.GROUPS_TO_PASS} consecutive correct groups`);
  while (progress.childElementCount < Quiz.GROUPS_TO_PASS) progress.append(document.createElement('span'));
  [...progress.children].forEach((item, index) => item.classList.toggle('correct', index < game.streak));
}

function finish(passed) {
  stopTimer();
  clearTimeout(revealTimer); revealTimer = null;
  $('result-title').textContent = passed ? 'Congratulations!' : 'Time is up';
  $('result-description').textContent = passed
    ? `You judged ${Quiz.GROUPS_TO_PASS} groups in a row without a mistake. Challenge passed!`
    : 'The clock ran out before you cleared two groups. Try again!';
  $('result-rounds').textContent = `${game.results.length} group${game.results.length === 1 ? '' : 's'} played · ${game.results.filter(r => r.solved).length} correct`;
  show('result');
  if (passed) celebrate();
}

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
    piece.style.cssText =
      `left:${Math.random() * 100}%;` +
      `width:${width}px;height:${height}px;` +
      `background:${colors[index % colors.length]};` +
      `animation-duration:${2.6 + Math.random() * 2.2}s;` +
      `animation-delay:${Math.random() * .9}s;` +
      `--drift:${(Math.random() * 2 - 1) * 240}px;` +
      `--spin:${(Math.random() * 2 - 1) * 1080}deg;` +
      `--tumble:${(Math.random() * 2 - 1) * 900}deg;`;
    stage.append(piece);
  }
  setTimeout(() => stage.remove(), 6500);
}

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

const backButton = $('manage');
if (backButton) backButton.onclick = () => { location.href = './'; };
$('home-link').onclick = event => {
  event.preventDefault();
  if (startScreen === 'library') { location.href = './'; return; }
  const quiz = $('game');
  if (quiz && !quiz.hidden && !confirm('End this round and return to the welcome screen? Your progress will be lost.')) return;
  stopTimer(); clearTimeout(revealTimer); revealTimer = null;
  game = null; currentGroup = []; choices = [];
  show('home');
  $('start').disabled = true;
  armStart();
};

function bind(id, handler) { const element = $(id); if (element) element.onclick = handler; }
bind('start', start);
bind('judge', judge);
bind('abort', () => {
  stopTimer(); clearTimeout(revealTimer); revealTimer = null;
  game = null; currentGroup = []; choices = [];
  show('home');
  $('start').disabled = true;
  $('start').focus();
  armStart();
});
bind('back-home', () => {
  game = null; currentGroup = []; choices = [];
  show('home');
  $('start').disabled = true;
  armStart();
});

if (startScreen === 'library') show('library');

(async () => {
  pictures = await loadPictures();
  refresh();
  if (startScreen === 'library') {
    if (pictures.length) storageMessage(`${pictures.length} pictures listed in ${MANIFEST}.`);
    return;
  }
  show('home');
  armStart();
})();
