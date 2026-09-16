(function (root) {
  'use strict';
  const TOTAL = 5;
  function create(items, random = Math.random) {
    if (items.length < TOTAL) throw new Error('Add at least five pictures before starting.');
    const pool = [...items];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return { pictures: pool.slice(0, TOTAL), answers: [], score: 0 };
  }
  function answer(game, round, choice) {
    if (round !== game.answers.length || round >= TOTAL) return null;
    const correct = game.pictures[round].isAI === choice;
    game.answers.push(correct);
    if (correct) game.score++;
    return correct;
  }
  const api = { TOTAL, create, answer, passed: game => game.answers.length === TOTAL && game.score >= 3 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Quiz = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
