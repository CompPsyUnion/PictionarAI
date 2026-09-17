const assert = require('node:assert/strict');
const Quiz = require('../quiz.js');

// Six pictures: enough for two groups with none repeated.
const pictures = [
  { id: 'r1', isAI: false }, { id: 'r2', isAI: false }, { id: 'r3', isAI: false },
  { id: 'a1', isAI: true }, { id: 'a2', isAI: true }, { id: 'a3', isAI: true }
];

/**
 * Plays a round. Each entry says how many pictures of that group are answered
 * correctly; 'all' means a clean group.
 */
function play(groupOutcomes) {
  const game = Quiz.create(pictures, () => 0.4);
  for (const outcome of groupOutcomes) {
    const group = Quiz.next(game);
    assert.notEqual(group, null, 'A new group must be available while the round continues');
    const choices = group.map((picture, index) => (outcome === 'all' || index < outcome) ? picture.isAI : !picture.isAI);
    const result = Quiz.answer(game, group, choices);
    assert.equal(result.correct, outcome === 'all' ? Quiz.GROUP_SIZE : outcome);
    assert.equal(Quiz.answer(game, group, choices), null, 'A group cannot be scored twice');
    if (result.solved && Quiz.passed(game)) break;
  }
  return game;
}

// Two clean groups pass the round.
assert.equal(Quiz.passed(play(['all', 'all'])), true, 'Two clean groups must pass');
assert.equal(play(['all', 'all']).streak, Quiz.GROUPS_TO_PASS);

// A single wrong picture in a group breaks the streak.
assert.equal(play(['all', 2]).streak, 0, 'A partly correct group resets the streak');
assert.equal(play(['all', 2, 'all', 'all']).streak, 2, 'A reset round can still be recovered');

// Two groups hold six distinct pictures, so nothing repeats while the
// library lasts. A longer round only reshuffles once it is exhausted.
const twoGroups = play(['all', 2, 'all', 'all']);
const seen = twoGroups.groups.slice(0, 2).flat().map(picture => picture.id);
assert.equal(new Set(seen).size, 6, 'The first two groups must use six distinct pictures');
assert.ok(twoGroups.groups.every(group => group.length === Quiz.GROUP_SIZE), 'Every group holds three pictures');

// A round survives many mistakes and still passes at the end.
const long = play(['all', 2, 'all', 2, 'all', 'all']);
assert.equal(Quiz.passed(long), true, 'A long round that ends clean still passes');

// Passing closes the round for further draws and submissions.
assert.equal(Quiz.next(long), null, 'No further group after passing');
assert.equal(Quiz.answer(long, long.groups[0], [true, true, true]), null, 'Answers are rejected after passing');

// Starting a new round clears the previous streak.
assert.equal(Quiz.create(pictures).streak, 0);
assert.throws(() => Quiz.create(pictures.slice(0, 5)), /at least/);

console.log('PASS: three-picture groups, two clean groups to pass, streak reset on any mistake, no repeats within a round.');
