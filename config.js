(function (root) {
  'use strict';

  /* The game rules live in config.yaml so an organiser can change the shape of
   * a round without touching any code. Only the flat "key: value" form is
   * understood: no nesting, lists or anchors. That keeps the parser to a few
   * lines instead of pulling in a YAML library. */

  const DEFAULTS = {
    groupSize: 3,
    roundSeconds: 60,
    consecutive: true,
    groupsToPass: 2,
    totalGroups: 5,
    earlyPass: true,
    autoNext: true,
    autoNextDelay: 5,
    pauseOnWrong: true
  };

  function stripComment(line) {
    const hash = line.indexOf('#');
    const cut = hash === -1 ? line : line.slice(0, hash);
    return cut.trim();
  }

  function parseValue(raw) {
    const text = raw.trim().replace(/^["']|["']$/g, '');
    if (text === 'true') return true;
    if (text === 'false') return false;
    const number = Number(text);
    if (text !== '' && Number.isFinite(number)) return number;
    return text;
  }

  /** Turns the flat YAML body into a plain object. Lines that are not
   *  "key: value" pairs are skipped rather than throwing, so a stray blank
   *  line or comment can never break the app. */
  function parse(text) {
    const parsed = {};
    for (const line of text.split(/\r?\n/)) {
      const content = stripComment(line);
      if (!content) continue;
      const separator = content.indexOf(':');
      if (separator === -1) continue;
      const key = content.slice(0, separator).trim();
      if (key) parsed[key] = parseValue(content.slice(separator + 1));
    }
    return parsed;
  }

  /** Converts the raw keys into the shape the app uses, dropping anything
   *  unusable so a typo falls back to the default instead of breaking a
   *  round. Sizes are clamped to at least 1: a group of zero pictures would
   *  otherwise make the quiz impossible to finish. */
  function normalise(raw) {
    const positive = (value, fallback) => {
      const number = Math.floor(Number(value));
      return Number.isFinite(number) && number >= 1 ? number : fallback;
    };
    // groups-required was a separate key before both modes shared one target.
    // Reading it keeps an older config.yaml working instead of silently
    // falling back to the default.
    const target = raw['groups-to-pass'] !== undefined ? raw['groups-to-pass'] : raw['groups-required'];
    const rules = {
      groupSize: positive(raw['group-size'], DEFAULTS.groupSize),
      roundSeconds: positive(raw['round-seconds'], DEFAULTS.roundSeconds),
      consecutive: typeof raw.consecutive === 'boolean' ? raw.consecutive : DEFAULTS.consecutive,
      groupsToPass: positive(target, DEFAULTS.groupsToPass),
      totalGroups: positive(raw['total-groups'], DEFAULTS.totalGroups),
      earlyPass: typeof raw['early-pass'] === 'boolean' ? raw['early-pass'] : DEFAULTS.earlyPass,
      autoNext: typeof raw['auto-next'] === 'boolean' ? raw['auto-next'] : DEFAULTS.autoNext,
      autoNextDelay: positive(raw['auto-next-delay'], DEFAULTS.autoNextDelay),
      pauseOnWrong: typeof raw['pause-on-wrong'] === 'boolean' ? raw['pause-on-wrong'] : DEFAULTS.pauseOnWrong
    };
    // A fixed round cannot ask for more clean groups than it schedules.
    if (!rules.consecutive && rules.groupsToPass > rules.totalGroups) rules.groupsToPass = rules.totalGroups;
    return rules;
  }

  /* Read at startup. A missing or broken file falls back to the defaults so
   * the event can still run. */
  async function load(url = 'config.yaml') {
    try {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return normalise(parse(await response.text()));
    } catch {
      return { ...DEFAULTS };
    }
  }

  const api = { DEFAULTS, parse, normalise, load };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Rules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
