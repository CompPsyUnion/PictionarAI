const assert = require('node:assert/strict');
const Quiz = require('../quiz.js');
const Rules = require('../config.js');

// Eighteen pictures: enough for several groups without any repeats.
const pictures = [
  { id: 'r1', isAI: false }, { id: 'r2', isAI: false }, { id: 'r3', isAI: false },
  { id: 'r4', isAI: false }, { id: 'r5', isAI: false }, { id: 'r6', isAI: false },
  { id: 'r7', isAI: false }, { id: 'r8', isAI: false }, { id: 'r9', isAI: false },
  { id: 'a1', isAI: true }, { id: 'a2', isAI: true }, { id: 'a3', isAI: true },
  { id: 'a4', isAI: true }, { id: 'a5', isAI: true }, { id: 'a6', isAI: true },
  { id: 'a7', isAI: true }, { id: 'a8', isAI: true }, { id: 'a9', isAI: true }
];

// The rules shipped in config.yaml, so the tests fail if the two drift apart.
const CONSECUTIVE = { groupSize: 3, roundSeconds: 60, consecutive: true, groupsToPass: 2, totalGroups: 5, earlyPass: true };
const FIXED = { ...CONSECUTIVE, consecutive: false };

/**
 * Plays a round. Each entry says how many pictures of that group are answered
 * correctly; 'all' means a clean group.
 */
function play(outcomes, rules = CONSECUTIVE, items = pictures) {
  const game = Quiz.create(items, rules, () => 0.4);
  for (const outcome of outcomes) {
    const group = Quiz.next(game);
    assert.notEqual(group, null, 'A new group must be available while the round continues');
    const choices = group.map((picture, index) => (outcome === 'all' || index < outcome) ? picture.isAI : !picture.isAI);
    const result = Quiz.answer(game, group, choices);
    assert.equal(result.correct, outcome === 'all' ? rules.groupSize : outcome);
    assert.equal(Quiz.answer(game, group, choices), null, 'A group cannot be scored twice');
  }
  return game;
}

// The YAML parser reads a flat key: value file and ignores comments and blanks.
const sample = Rules.parse(`
# a comment
group-size: 4
consecutive: false
round-seconds: 90
total-groups: 6
groups-required: 2
`);
assert.deepEqual(sample, { 'group-size': 4, consecutive: false, 'round-seconds': 90, 'total-groups': 6, 'groups-required': 2 });

// Both modes now read one target. An older file that still says
// "groups-required" is translated instead of silently ignored.
assert.equal(Rules.normalise({ 'group-size': 3, consecutive: true, 'groups-to-pass': 4 }).groupsToPass, 4, 'groups-to-pass sets the target');
assert.equal(Rules.normalise({ 'group-size': 3, consecutive: false, 'groups-required': 4 }).groupsToPass, 4, 'A legacy groups-required key still sets the target');
assert.equal(Rules.normalise({ 'group-size': 3, 'groups-to-pass': 4, 'groups-required': 9 }).groupsToPass, 4, 'groups-to-pass wins when both keys are present');
assert.deepEqual(Rules.parse('group-size: 3 # trailing'), { 'group-size': 3 });

// A missing or unusable value falls back to the default instead of breaking.
const fallback = Rules.normalise({ 'group-size': 'wide', 'round-seconds': -5, consecutive: true, 'groups-to-pass': 2 });
assert.equal(fallback.groupSize, Rules.DEFAULTS.groupSize, 'Unusable numbers fall back to the default');
assert.equal(fallback.roundSeconds, Rules.DEFAULTS.roundSeconds, 'A negative duration falls back to the default');
assert.equal(Rules.normalise({ consecutive: 'yes' }).consecutive, Rules.DEFAULTS.consecutive, 'A non-boolean falls back to the default');

// Requiring more clean groups than a fixed round schedules is clamped,
// otherwise the round could never be won.
assert.equal(Rules.normalise({ consecutive: false, 'total-groups': 3, 'groups-to-pass': 9 }).groupsToPass, 3, 'A fixed round cannot ask for more clean groups than it schedules');
assert.equal(Rules.normalise({ consecutive: true, 'total-groups': 3, 'groups-to-pass': 9 }).groupsToPass, 9, 'A consecutive round is not clamped by total-groups, which it ignores');

// --- Consecutive mode ------------------------------------------------------

assert.equal(Quiz.passed(play(['all', 'all'])), true, 'Two clean groups pass a consecutive round');
assert.equal(play(['all', 'all']).streak, CONSECUTIVE.groupsToPass);
assert.equal(play(['all', 2]).streak, 0, 'A partly correct group resets the streak');
assert.equal(play(['all', 2, 'all', 'all']).streak, 2, 'A reset round can still be recovered');
assert.equal(Quiz.doomed(play(['all', 2])), false, 'A consecutive round is never unwinnable');

// Pictures do not repeat while the library lasts.
const twoGroups = play(['all', 2, 'all', 'all']);
const seen = twoGroups.groups.slice(0, 2).flat().map(picture => picture.id);
assert.equal(new Set(seen).size, 6, 'The first two groups must use six distinct pictures');
assert.ok(twoGroups.groups.every(group => group.length === CONSECUTIVE.groupSize), 'Every group holds three pictures');

// Passing closes the round for further draws and submissions.
const long = play(['all', 2, 'all', 2, 'all', 'all']);
assert.equal(Quiz.passed(long), true, 'A long round that ends clean still passes');
assert.equal(Quiz.next(long), null, 'No further group after passing');
assert.equal(Quiz.answer(long, long.groups[0], [true, true, true]), null, 'Answers are rejected after passing');

// The group size and the pass target follow the rules.
assert.equal(play(['all', 'all'], { ...CONSECUTIVE, groupSize: 4 }).groups[0].length, 4, 'group-size decides how many pictures a group holds');
assert.equal(Quiz.passed(play(['all', 'all', 'all'], { ...CONSECUTIVE, groupsToPass: 3 })), true, 'groups-to-pass decides how many clean groups are needed');

// --- Fixed mode ------------------------------------------------------------

// A round of five groups that needs three clean ones to pass.
const SCHEDULE = { ...FIXED, groupsToPass: 3, totalGroups: 5 };

// Enough clean groups passes as soon as the target is reached, even with
// groups still left on the schedule.
const early = play(['all', 'all', 'all'], SCHEDULE);
assert.equal(Quiz.passed(early), true, 'Three clean groups pass a round that requires three');
assert.equal(early.results.length, 3, 'The round stops as soon as the target is reached');
assert.equal(Quiz.solved, undefined, 'The engine keeps its state on the game object, not the module');

// A round that runs out of groups without the target fails.
const short = play(['all', 'all', 1, 1, 1], SCHEDULE);
assert.equal(short.results.length, SCHEDULE.totalGroups, 'A fixed round plays its whole schedule when the target is not met');
assert.equal(Quiz.passed(short), false, 'Falling short of groups-to-pass does not pass');
assert.equal(Quiz.finished(short), true, 'An exhausted fixed round is finished');

// Once the groups left cannot reach the target, the round is unwinnable.
const lost = play(['all', 1, 1, 1], SCHEDULE);
assert.equal(Quiz.doomed(lost), true, 'One clean group with one group left cannot reach three');
assert.equal(Quiz.finished(lost), true, 'An unwinnable fixed round is over');

// A round still winnable is not cut short.
const alive = play(['all', 1, 'all'], SCHEDULE);
assert.equal(Quiz.doomed(alive), false, 'Two clean groups with two groups left is still winnable');
assert.equal(Quiz.finished(alive), false, 'A winnable fixed round keeps going');

// --- early-pass ------------------------------------------------------------

// With early-pass off, reaching the target does not end a fixed round: the
// whole schedule still has to be played.
const SCHEDULE_FULL = { ...SCHEDULE, earlyPass: false };
const playedOut = play(['all', 'all', 'all', 1, 1], SCHEDULE_FULL);
assert.equal(playedOut.results.length, SCHEDULE_FULL.totalGroups, 'early-pass off plays every scheduled group');
assert.equal(Quiz.passed(playedOut), true, 'A played-out round that met the target still passes');
assert.equal(Quiz.finished(playedOut), true, 'A played-out round is finished');
assert.equal(Quiz.finished(play(['all', 'all', 'all'], SCHEDULE_FULL)), false, 'A round that met the target early is not finished when early-pass is off');
assert.equal(Quiz.passed(play(['all', 'all', 'all'], SCHEDULE_FULL)), true, 'The target is still met, it just does not stop the round');

// An unwinnable round still stops early even with early-pass off, because the
// remaining groups could not change the outcome.
const hopeless = play(['all', 1, 1, 1], SCHEDULE_FULL);
assert.equal(Quiz.doomed(hopeless), true, 'An unwinnable round is doomed regardless of early-pass');
assert.equal(Quiz.finished(hopeless), true, 'An unwinnable round ends even with early-pass off');

// A played-out round that fell short fails.
const fellShort = play(['all', 'all', 1, 1, 1], SCHEDULE_FULL);
assert.equal(Quiz.passed(fellShort), false, 'A played-out round short of the target does not pass');
assert.equal(fellShort.results.length, SCHEDULE_FULL.totalGroups, 'Every scheduled group was played');

// early-pass only affects fixed mode. A consecutive round always ends the
// moment the run is long enough.
const streakRun = play(['all', 'all'], { ...CONSECUTIVE, earlyPass: false });
assert.equal(Quiz.finished(streakRun), true, 'A consecutive round ends on reaching the run, whatever early-pass says');
assert.equal(streakRun.results.length, 2, 'The consecutive round stopped as soon as the run was met');

// A non-boolean early-pass falls back to the default.
assert.equal(Rules.normalise({ 'early-pass': 'maybe' }).earlyPass, Rules.DEFAULTS.earlyPass, 'A non-boolean early-pass falls back to the default');
assert.equal(Rules.normalise({ 'early-pass': false }).earlyPass, false, 'A false early-pass is honoured');
assert.equal(Rules.parse('early-pass: false')['early-pass'], false, 'The parser reads early-pass as a boolean');

// --- auto-next -------------------------------------------------------------

// auto-next decides whether a wrong verdict moves on by itself, and
// auto-next-delay how long it waits. The delay is also how long the wash
// across the button takes, so a nonsense value must not reach the stylesheet.
assert.equal(Rules.DEFAULTS.autoNext, true, 'A wrong verdict continues by itself unless told otherwise');
assert.equal(Rules.normalise({ 'auto-next': false }).autoNext, false, 'A false auto-next is honoured');
assert.equal(Rules.normalise({ 'auto-next': 'no' }).autoNext, Rules.DEFAULTS.autoNext, 'A non-boolean auto-next falls back to the default');
assert.equal(Rules.parse('auto-next: false')['auto-next'], false, 'The parser reads auto-next as a boolean');
assert.equal(Rules.normalise({ 'auto-next-delay': 7 }).autoNextDelay, 7, 'auto-next-delay sets the wait');
assert.equal(Rules.normalise({ 'auto-next-delay': 0 }).autoNextDelay, Rules.DEFAULTS.autoNextDelay, 'A zero delay falls back, because it would leave no verdict to read');
assert.equal(Rules.normalise({ 'auto-next-delay': 'soon' }).autoNextDelay, Rules.DEFAULTS.autoNextDelay, 'An unusable delay falls back to the default');

// pause-on-wrong is independent of auto-next: it can pause a verdict that
// continues by itself, and it can leave the clock running on one that waits.
assert.equal(Rules.DEFAULTS.pauseOnWrong, true, 'The clock stops on a wrong verdict unless told otherwise');
assert.equal(Rules.normalise({ 'pause-on-wrong': false }).pauseOnWrong, false, 'A false pause-on-wrong is honoured');
assert.equal(Rules.normalise({ 'pause-on-wrong': 'nah' }).pauseOnWrong, Rules.DEFAULTS.pauseOnWrong, 'A non-boolean pause-on-wrong falls back to the default');
assert.equal(Rules.parse('pause-on-wrong: false')['pause-on-wrong'], false, 'The parser reads pause-on-wrong as a boolean');
const timing = Rules.normalise({ 'auto-next': false, 'pause-on-wrong': false });
assert.equal(timing.autoNext, false, 'The two timing settings do not affect each other');
assert.equal(timing.pauseOnWrong, false, 'A verdict can wait for Next while the clock keeps running');

// The progress bar reports clean groups in a row, or clean groups overall.
assert.equal(Quiz.targetGroups(play([], CONSECUTIVE)), CONSECUTIVE.groupsToPass, 'The target is the streak length in consecutive mode');
assert.equal(Quiz.targetGroups(play([], FIXED)), FIXED.totalGroups, 'The bar shows one segment per scheduled group in fixed mode');
assert.equal(Quiz.targetGroups(play([], { ...FIXED, totalGroups: 7 })), 7, 'The bar follows total-groups in fixed mode');
assert.equal(Quiz.progress(play(['all', 1, 'all'], FIXED)), 2, 'Fixed mode counts clean groups overall');

// A miss in fixed mode must not erase the clean groups already banked.
const mixed = play(['all', 1, 'all'], FIXED);
assert.equal(mixed.solved, 2, 'A missed group leaves the clean count alone in fixed mode');
assert.equal(Quiz.progress(mixed), 2, 'Fixed mode progress keeps the banked clean groups after a miss');
assert.equal(Quiz.progress(play(['all', 1], FIXED)), 1, 'A miss after a clean group still leaves that group banked');
assert.equal(play(['all', 1], CONSECUTIVE).streak, 0, 'The same sequence resets the streak in consecutive mode');

// Every played group is recorded, so the bar can colour each segment.
assert.deepEqual(mixed.results.map(r => r.solved), [true, false, true], 'Each group keeps its own result for the progress bar');
assert.equal(mixed.results.length, 3, 'The bar has one recorded result per played group');

console.log('PASS: config parsing and fallbacks, consecutive and fixed modes, streak resets, early wins, unwinnable rounds, no repeats.');
