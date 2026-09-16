(function (root) {
  'use strict';
  const TARGET = 2;
  const MIN_PICTURES = 2;
  function shuffle(items, random) {
    const pool = [...items];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  }
  function create(items, random = Math.random) {
    if (items.length < MIN_PICTURES) throw new Error('Add at least two pictures before starting.');
    return { pool: [...items], random, pictures: shuffle(items, random), answers: [], streak: 0 };
  }
  function answer(game, round, choice) {
    if (round !== game.answers.length || round >= game.pictures.length || passed(game)) return null;
    const correct = game.pictures[round].isAI === choice;
    game.answers.push(correct);
    game.streak = correct ? game.streak + 1 : 0;
    return correct;
  }
  function passed(game) { return game.streak >= TARGET; }
  function next(game) {
    if (passed(game)) return null;
    const index = game.answers.length;
    if (index === game.pictures.length) {
      const batch = shuffle(game.pool, game.random);
      // Avoid repeating the last picture immediately when a new shuffled batch begins.
      if (batch[0].id === game.pictures[index - 1].id) [batch[0], batch[1]] = [batch[1], batch[0]];
      game.pictures.push(...batch);
    }
    return index;
  }
  const api = { TARGET, MIN_PICTURES, create, answer, next, passed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Quiz = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
