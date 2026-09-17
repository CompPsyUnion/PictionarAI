(function (root) {
  'use strict';

  /* The rules come from config.yaml. These are the fallbacks used when the
   * file cannot be read, so the values here should match the shipped file. */
  const DEFAULTS = {
    groupSize: 3,
    roundSeconds: 60,
    consecutive: true,
    groupsToPass: 2,
    totalGroups: 5,
    earlyPass: true
  };

  function shuffle(items, random) {
    const pool = [...items];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  }

  /**
   * Opens a round with the given pictures and rules.
   *
   * `remaining` holds the pictures not yet handed out, so nothing repeats
   * until the library is exhausted. `streak` counts clean groups in a row and
   * `solved` counts clean groups overall: consecutive mode reads the first,
   * fixed mode the second.
   */
  function create(items, rules = DEFAULTS, random = Math.random) {
    const config = { ...DEFAULTS, ...rules };
    return {
      pool: [...items],
      config,
      random,
      remaining: shuffle(items, random),
      groups: [],
      results: [],
      pending: null,
      streak: 0,
      solved: 0
    };
  }

  /** Hands out the next group and marks it pending. Returns null when the
   *  round is over, so a caller can never draw past the finishing line. */
  function next(game) {
    if (finished(game)) return null;
    const size = game.config.groupSize;
    const group = [];
    while (group.length < size) {
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
    if (!group || group !== game.pending || group.length !== game.config.groupSize) return null;
    const correct = group.filter((picture, index) => picture.isAI === choices[index]).length;
    const clean = correct === game.config.groupSize;
    game.groups.push(group);
    game.results.push({ correct, solved: clean });
    game.pending = null;
    game.streak = clean ? game.streak + 1 : 0;
    if (clean) game.solved++;
    return { correct, solved: clean };
  }

  /** True once the participant has already done enough to pass. Both modes
   *  aim at the same number of clean groups: consecutive mode needs them in a
   *  row, fixed mode only needs them to add up. */
  function passed(game) {
    const config = game.config;
    return config.consecutive ? game.streak >= config.groupsToPass : game.solved >= config.groupsToPass;
  }

  /** True once the round cannot be won, so the caller can end it early rather
   *  than making the participant play groups that no longer matter. With no
   *  groups played yet, a round is never unwinnable. */
  function doomed(game) {
    const config = game.config;
    if (config.consecutive) return false;
    const left = config.totalGroups - game.results.length;
    return game.solved + left < config.groupsToPass;
  }

  /** True when the round is over for any reason: passed, out of groups, or no
   *  longer winnable.
   *
   *  In fixed mode reaching the target only ends the round when early-pass is
   *  on. With it off the schedule plays out in full, so the participant keeps
   *  going even after banking enough clean groups. A round that can no longer
   *  reach the target always stops, because the remaining groups would decide
   *  nothing. */
  function finished(game) {
    const config = game.config;
    if (doomed(game)) return true;
    if (config.consecutive) return passed(game);
    if (config.earlyPass && passed(game)) return true;
    return game.results.length >= config.totalGroups;
  }

  /** How many segments the progress bar needs: one per clean group still
   *  needed in consecutive mode, or one per scheduled group in fixed mode,
   *  where every group is recorded whether it was clean or not. */
  function targetGroups(game) {
    const config = game.config;
    return config.consecutive ? config.groupsToPass : config.totalGroups;
  }

  /** The value the progress bar fills towards: clean groups in a row, or
   *  clean groups overall. */
  function progress(game) {
    return game.config.consecutive ? game.streak : game.solved;
  }

  const api = { DEFAULTS, create, answer, next, passed, doomed, finished, targetGroups, progress };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Quiz = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
