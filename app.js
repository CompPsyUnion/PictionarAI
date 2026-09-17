'use strict';
const $ = id => document.getElementById(id);
const MANIFEST = 'pictures.json';
let pictures = [], game = null, choices = [], currentGroup = [],
    roundTimer = null, revealTimer = null, rules = { ...Quiz.DEFAULTS },
    secondsLeft = 0;

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

/** How many pictures a round needs before it can start. A group is drawn
 *  without repeats, so the pool has to cover every group the round will play.
 *  Consecutive mode can play on indefinitely, so only the target it must
 *  reach is counted. */
function requiredPictures() {
  const groups = rules.consecutive ? rules.groupsToPass : rules.totalGroups;
  return rules.groupSize * groups;
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Writes the rule lines that used to be hard-coded in the markup, so the
 *  welcome text, the score pill and the footer always agree with config.yaml.
 *  Called once the rules are loaded, before the welcome screen appears. */
function applyRulesToMarkup() {
  const { groupSize, roundSeconds, consecutive, groupsToPass, totalGroups } = rules;
  // The grid is sized from the rules instead of a fixed column count, so a
  // larger group wraps into rows instead of overflowing its container.
  document.documentElement.style.setProperty('--group-columns', groupSize);
  const rulesText = $('game-rules');
  if (rulesText) {
    const target = consecutive
      ? `<strong>${plural(groupsToPass, 'clean group')} in a row</strong>`
      : `<strong>${plural(groupsToPass, 'clean group')} out of ${totalGroups}</strong>`;
    rulesText.innerHTML = `Each group shows <strong>${plural(groupSize, 'picture')}</strong>. <br>Choose <strong>AI</strong> or <strong>Real</strong> for every picture. <br>Get ${target} within <strong>${plural(roundSeconds, 'second')}</strong> to pass.${consecutive ? ' A wrong picture resets your streak.' : ''}`;
  }
  const scoreLabel = $('score-label'), scoreTarget = $('score-target'), timer = $('timer');
  if (scoreLabel) scoreLabel.textContent = consecutive ? 'STREAK' : 'CLEAN';
  if (scoreTarget) scoreTarget.textContent = groupsToPass;
  if (timer) timer.textContent = roundSeconds;
  const footer = $('footer-rules');
  if (footer) {
    footer.textContent = `${plural(groupSize, 'picture').toUpperCase()} PER GROUP · ${consecutive
      ? `${plural(groupsToPass, 'clean group').toUpperCase()} IN A ROW`
      : `${groupsToPass} OF ${totalGroups} GROUPS CLEAN`} · ${plural(roundSeconds, 'second').toUpperCase()}`;
  }
}

/** Builds the round the start button will hand over and decodes its first
 *  group, then unlocks the button. The round is kept in `game`, so pressing
 *  start opens exactly the group that was decoded instead of reshuffling into
 *  a different one. */
async function armStart() {
  const startButton = $('start'), ready = $('ready');
  if (!startButton) return;
  if (pictures.length < requiredPictures()) return;
  startButton.disabled = true;
  if (ready) { ready.hidden = false; ready.textContent = 'Loading the first pictures…'; }
  game = Quiz.create(pictures, rules);
  const first = Quiz.next(game);
  await decodeGroup(first);
  if (!game) return;
  startButton.disabled = false;
  if (ready) { ready.hidden = true; ready.textContent = ''; }
}

function refresh() {
  const startButton = $('start'), ready = $('ready');
  const needed = requiredPictures();
  const missing = needed - pictures.length;
  if (startButton) startButton.disabled = pictures.length < needed;
  if (ready) {
    ready.hidden = pictures.length >= needed;
    ready.textContent = pictures.length >= needed ? '' : `Organizer: add ${missing} more picture${missing === 1 ? '' : 's'} to ${MANIFEST} to begin.`;
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
  if (pictures.length < requiredPictures()) return;
  if (!game) return;
  choices = []; revealTimer = null;
  resetJudgeButton();
  const first = game.pending;
  warmUpcoming(game.remaining.slice(-rules.groupSize));
  show('game');
  renderGroup(first, 0);
  startTimer(rules.roundSeconds);
}

function renderTimer() {
  const timer = $('timer');
  if (!timer) return;
  timer.textContent = secondsLeft;
  timer.classList.toggle('urgent', secondsLeft <= 5);
}

function startTimer(seconds) {
  stopTimer();
  secondsLeft = seconds;
  renderTimer();
  roundTimer = setInterval(() => {
    secondsLeft--;
    // Running out of time is not an automatic loss: the target may already
    // have been reached, which is exactly how a round with early-pass off can
    // end. The verdict follows the round state, not the clock.
    if (secondsLeft <= 0) { stopTimer(); finish(Boolean(game) && Quiz.passed(game), true); return; }
    renderTimer();
  }, 1000);
}

function stopTimer() { clearInterval(roundTimer); roundTimer = null; }

/** Stops the clock without ending the round, and restarts it from the same
 *  second. A wrong answer pauses it so the verdict costs no time. */
function pauseTimer() { clearInterval(roundTimer); roundTimer = null; }

function resumeTimer() {
  if (roundTimer || !game) return;
  roundTimer = setInterval(() => {
    secondsLeft--;
    if (secondsLeft <= 0) { stopTimer(); finish(Quiz.passed(game), true); return; }
    renderTimer();
  }, 1000);
}

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

/* A picture narrower than this is too small to judge, so the grid drops a
   column rather than shrinking any further. A phone is held closer and shows
   two cards side by side, so its floor is lower than a desk screen's, and its
   narrower page margin leaves more room for them. */
const MIN_CARD_WIDTH = 260;
const MIN_CARD_WIDTH_PHONE = 140;
const PHONE_WIDTH = 650;
const PAGE_GUTTER = 64;
const PAGE_GUTTER_PHONE = 32;
const CARD_GAP = 16;
const CARD_GAP_PHONE = 10;

/** How many cards fit side by side at the current width. The configured group
 *  size is the ceiling; the screen lowers it whenever a row of that many
 *  would squeeze a picture below the floor for that screen. Working from the
 *  available width instead of fixed breakpoints keeps the layout right on any
 *  device, including the iPad sizes that sit between the usual breakpoints.
 *
 *  The count is written into --group-columns rather than expressed in CSS
 *  because repeat() needs a plain integer, and an expression inside it is
 *  not reliably supported. */
function columnsFor(size) {
  const width = window.innerWidth;
  const phone = width <= PHONE_WIDTH;
  const floor = phone ? MIN_CARD_WIDTH_PHONE : MIN_CARD_WIDTH;
  const gap = phone ? CARD_GAP_PHONE : CARD_GAP;
  const available = width - (phone ? PAGE_GUTTER_PHONE : PAGE_GUTTER);
  const fits = Math.floor((available + gap) / (floor + gap));
  return Math.max(1, Math.min(size, fits));
}

/** Applies the layout to the current group: how many columns to use, which
 *  card ends up alone on the last row so it can be centred, and whether the
 *  group holds a single picture and should take the full width.
 *
 *  A lone card is only possible when the columns do not divide the group
 *  evenly, and never for a group of one, which has no row to share. */
function layoutGroup(cards) {
  const stage = $('group');
  if (!stage) return;
  const columns = cards.length ? columnsFor(cards.length) : rules.groupSize;
  stage.style.setProperty('--group-columns', columns);
  // The lone-card width in the stylesheet is derived from the gap, so the gap
  // is written here too. It has to match what columnsFor() assumed, otherwise
  // the measured width would not line up with the grid it sits in.
  const phone = window.innerWidth <= PHONE_WIDTH;
  stage.style.setProperty('--group-gap', `${phone ? CARD_GAP_PHONE : CARD_GAP}px`);
  const lonely = cards.length > 1 && cards.length % columns === 1;
  cards.forEach((card, index) => {
    card.classList.toggle('lone', lonely && index === cards.length - 1);
  });
  stage.classList.toggle('single', cards.length === 1);
}

// Rotating a tablet or resizing the window changes how many cards fit on a
// row, which changes whether one is left alone on the last row.
window.addEventListener('resize', () => {
  const cards = $('group') ? [...$('group').children] : [];
  if (cards.length) layoutGroup(cards);
});

function renderGroup(group, groupIndex) {
  currentGroup = group;
  choices = new Array(group.length).fill(null);
  $('round').textContent = `GROUP ${String(groupIndex + 1).padStart(2, '0')}`;
  renderStreak();
  const container = $('group');
  container.replaceChildren();
  const cards = group.map((picture, index) => {
    const card = document.createElement('div'); card.className = 'group-card';
    const inner = document.createElement('div'); inner.className = 'card-inner';
    inner.append(buildFace(picture, index, 'front'));
    card.append(inner);
    return card;
  });
  container.append(...cards);
  layoutGroup(cards);
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
    layoutGroup(cards);
    currentGroup = group;
    choices = new Array(group.length).fill(null);
    $('round').textContent = `GROUP ${String(groupIndex + 1).padStart(2, '0')}`;
    $('judge').disabled = true;
    updateJudge();
    warmUpcoming(game ? game.remaining.slice(-rules.groupSize) : []);
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

/** How long a clean group stays up before the round continues. A clean group
 *  needs no reading time, so this is a short beat and is not configurable. */
const CLEAN_REVEAL_MS = 1000;

/** Advances the round after a verdict: either closes it or shows the next
 *  group. Shared by the automatic timer and the Next button, and guarded so
 *  the two cannot both fire. */
function advance(cards) {
  if (!game) return;
  if (Quiz.finished(game)) { finish(Quiz.passed(game)); return; }
  const next = Quiz.next(game);
  flipToGroup(cards, next, game.results.length);
}

function judge() {
  if (revealTimer || !game) return;
  const result = Quiz.answer(game, currentGroup, choices);
  if (!result) return;
  renderStreak();
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
  warmUpcoming(game.remaining.slice(-rules.groupSize));

  // The same button now leads to the next group rather than submitting.
  const judgeButton = $('judge');
  judgeButton.disabled = false;
  judgeButton.textContent = 'Next';
  judgeButton.classList.add('next');
  judgeButton.classList.toggle('wrong', !result.solved);
  const leave = () => {
    clearTimeout(revealTimer); revealTimer = null;
    // Hand the button back to judge(): the next group needs it to submit.
    judgeButton.onclick = judge;
    judgeButton.classList.remove('next', 'wrong', 'running');
    judgeButton.disabled = true;
    judgeButton.textContent = 'Submit';
    // resumeTimer() ignores the call when the clock never stopped, so a
    // round that keeps running on a wrong answer is not double-started.
    resumeTimer();
    advance(cards);
  };
  judgeButton.onclick = leave;

  if (result.solved) {
    // A clean group needs no reading time: it moves on after a short beat.
    revealTimer = setTimeout(leave, CLEAN_REVEAL_MS);
    return;
  }
  // Whether reading the verdict costs time is a setting of its own: pausing
  // gives the mistake a fair look, while letting the clock run keeps the
  // pressure on.
  if (rules.pauseOnWrong) pauseTimer();
  if (!rules.autoNext) {
    // The round waits on the verdict until the participant presses Next.
    return;
  }
  // The wash fills the button over exactly the wait before the automatic
  // Next, so its length always matches what is about to happen.
  judgeButton.style.setProperty('--auto-next', `${rules.autoNextDelay}s`);
  // Reading offsetWidth makes the browser lay the wash out at zero width
  // first. Adding the animated class in the same frame as the base class
  // would collapse both values into one recalculation, and the wash would
  // snap to full instead of stretching across.
  void judgeButton.offsetWidth;
  judgeButton.classList.add('running');
  revealTimer = setTimeout(leave, rules.autoNextDelay * 1000);
}

/** Draws the score pill and the progress bar.
 *
 *  Consecutive mode shows the current streak, with one segment per clean
 *  group still needed in a row: a mistake empties them again.
 *
 *  Fixed mode shows how many clean groups have been banked, with one segment
 *  per scheduled group. Each played group keeps its own colour, green when it
 *  was clean and red when it was not, so a miss is recorded rather than
 *  resetting the bar. */
function renderStreak() {
  const score = $('score'), progress = $('progress');
  if (!score || !progress) return;
  const { consecutive, totalGroups } = rules;
  if (consecutive) {
    const target = Quiz.targetGroups(game);
    const filled = game.streak;
    score.textContent = filled;
    progress.setAttribute('aria-label', `${filled} of ${target} consecutive clean groups`);
    while (progress.childElementCount < target) progress.append(document.createElement('span'));
    while (progress.childElementCount > target) progress.lastElementChild.remove();
    [...progress.children].forEach((item, index) => {
      item.classList.toggle('correct', index < filled);
      item.classList.remove('missed');
    });
    return;
  }
  score.textContent = game.solved;
  progress.setAttribute('aria-label', `${game.solved} clean groups out of ${totalGroups}, ${game.results.length} played`);
  while (progress.childElementCount < totalGroups) progress.append(document.createElement('span'));
  while (progress.childElementCount > totalGroups) progress.lastElementChild.remove();
  [...progress.children].forEach((item, index) => {
    const played = game.results[index];
    item.classList.toggle('correct', Boolean(played && played.solved));
    item.classList.toggle('missed', Boolean(played && !played.solved));
  });
}

/** Ends the round. `won` says whether the participant passed and `timedOut`
 *  whether the clock is what stopped it, so the description can name the
 *  actual reason instead of guessing from the screen. */
function finish(won, timedOut = false) {
  stopTimer();
  clearTimeout(revealTimer); revealTimer = null;
  const played = game.results.length;
  const clean = game.results.filter(r => r.solved).length;
  $('result-title').textContent = won ? 'Congratulations!' : 'Challenge failed';
  if (won) {
    $('result-description').textContent = rules.consecutive
      ? `You judged ${rules.groupsToPass} groups in a row without a mistake. Challenge passed!`
      : `You banked ${clean} of the ${rules.groupsToPass} clean groups needed. Challenge passed!`;
  } else if (timedOut) {
    $('result-description').textContent = `The clock ran out on ${clean} of the ${rules.groupsToPass} clean groups needed. Try again!`;
  } else {
    $('result-description').textContent = rules.consecutive
      ? 'Too many mistakes in a row: the remaining groups cannot reach the target. Try again!'
      : `You finished ${clean} of the ${rules.groupsToPass} clean groups needed. Try again!`;
  }
  $('result-rounds').textContent = `${played} group${played === 1 ? '' : 's'} played · ${clean} correct`;
  show('result');
  if (won) celebrate();
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

/** Puts the action button back to its submitting state, so a round left while
 *  a verdict was showing does not reopen with a stale Next button. */
function resetJudgeButton() {
  const button = $('judge');
  if (!button) return;
  button.onclick = judge;
  button.classList.remove('next', 'wrong', 'running');
  button.disabled = true;
  button.textContent = 'Submit';
}

bind('start', start);
bind('judge', judge);
bind('abort', () => {
  stopTimer(); clearTimeout(revealTimer); revealTimer = null;
  resetJudgeButton();
  game = null; currentGroup = []; choices = [];
  show('home');
  $('start').disabled = true;
  $('start').focus();
  armStart();
});
bind('back-home', () => {
  resetJudgeButton();
  game = null; currentGroup = []; choices = [];
  show('home');
  $('start').disabled = true;
  armStart();
});

if (startScreen === 'library') show('library');

(async () => {
  rules = await Rules.load();
  applyRulesToMarkup();
  pictures = await loadPictures();
  refresh();
  if (startScreen === 'library') {
    if (pictures.length) storageMessage(`${pictures.length} pictures listed in ${MANIFEST}.`);
    return;
  }
  show('home');
  armStart();
})();
