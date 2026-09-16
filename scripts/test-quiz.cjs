const assert = require('node:assert/strict');
const Quiz = require('../quiz.js');
const pictures = [{ id: 'real', isAI: false }, { id: 'ai', isAI: true }];
function run(outcomes) {
  const game = Quiz.create(pictures, () => 0.4);
  for (const correct of outcomes) {
    const round = Quiz.next(game);
    assert.notEqual(round, null);
    const truth = game.pictures[round].isAI;
    assert.equal(Quiz.answer(game, round, correct ? truth : !truth), correct);
    assert.equal(Quiz.answer(game, round, truth), null, 'Duplicate answers must be ignored');
  }
  return game;
}
assert.equal(Quiz.passed(run([true, true])), true);
assert.equal(Quiz.passed(run([true, false, true])), false);
assert.equal(run([true, false]).streak, 0);
assert.equal(Quiz.passed(run([false, true, false, true, true])), true);
const longGame = run([...Array(20).fill(false), true, true]);
assert.equal(Quiz.passed(longGame), true, 'No five-round limit');
assert.equal(Quiz.next(longGame), null, 'Stop drawing after qualification');
for (let i = 1; i < longGame.pictures.length; i++) {
  assert.notEqual(longGame.pictures[i].id, longGame.pictures[i - 1].id);
}
assert.equal(Quiz.create(pictures).streak, 0);
assert.throws(() => Quiz.create(pictures.slice(0, 1)));
console.log('PASS: consecutive-answer qualification, reset on error, duplicate protection, unlimited rounds, reshuffling, and new-game reset.');
