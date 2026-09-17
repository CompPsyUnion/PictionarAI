(function (root) {
  'use strict';
  const GROUP_SIZE = 3;      // Pictures shown per group
  const GROUPS_TO_PASS = 2;  // Consecutive fully-correct groups needed to pass
  const MIN_PICTURES = 6;    // Two groups are drawn from distinct pictures

  function shuffle(items, random) {
    const pool = [...items];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  }

  /**
   * A round draws groups of three pictures. Pictures never repeat within a
   * round: each draw takes from the unused remainder and only reshuffles the
   * whole library once that remainder runs out.
   */
  function create(items, random = Math.random) {
    if (items.length < MIN_PICTURES) throw new Error(`Add at least ${MIN_PICTURES} pictures before starting.`);
    return { pool: [...items], random, remaining: shuffle(items, random), groups: [], results: [], pending: null, streak: 0 };
  }

  /**
   * Hands out the next group and marks it pending. Returns null once the round
   * is passed, so a caller can never draw past the finishing line.
   */
  function next(game) {
    if (passed(game)) return null;
    const group = [];
    while (group.length < GROUP_SIZE) {
      if (game.remaining.length === 0) game.remaining = shuffle(game.pool, game.random);
      group.push(game.remaining.pop());
    }
    game.pending = group;
    return group;
  }

  /**
   * Scores the pending group and returns how many pictures were right.
   * Only the group handed out by next() is accepted, so a group can never be
   * scored twice no matter how often the caller submits it.
   */
  function answer(game, group, choices) {
    if (!group || group !== game.pending || group.length !== GROUP_SIZE) return null;
    const correct = group.filter((picture, index) => picture.isAI === choices[index]).length;
    const solved = correct === GROUP_SIZE;
    game.groups.push(group);
    game.results.push({ correct, solved });
    game.pending = null;
    game.streak = solved ? game.streak + 1 : 0;
    return { correct, solved };
  }

  function passed(game) { return game.streak >= GROUPS_TO_PASS; }

  const api = { GROUP_SIZE, GROUPS_TO_PASS, MIN_PICTURES, create, answer, next, passed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Quiz = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
