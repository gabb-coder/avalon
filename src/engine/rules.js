// Game rules as plain data, plus the few pure helpers that read it.
// Everything here is public information: it may be imported anywhere.

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;
export const QUEST_COUNT = 5;
export const WINS_NEEDED = 3; // quests either side needs
export const MAX_REJECTS = 5; // rejected proposals in a row before Evil wins

// How many seats each team gets, by player count.
export const TEAM_SIZES = {
  5: { good: 3, evil: 2 },
  6: { good: 4, evil: 2 },
  7: { good: 4, evil: 3 },
  8: { good: 5, evil: 3 },
  9: { good: 6, evil: 3 },
  10: { good: 6, evil: 4 },
};

// Knights on each of the five quests, by player count.
export const QUEST_SIZES = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
};

// With this many players or more, Quest 4 needs two Fail cards to fail.
export const TWO_FAIL_MIN_PLAYERS = 7;
export const TWO_FAIL_QUEST_INDEX = 3; // zero-based: Quest 4

// The Lady of the Lake is used after these quests (zero-based: after Quests 2, 3 and 4).
export const LADY_AFTER_QUEST_INDEXES = [1, 2, 3];

export const GOOD = 'good';
export const EVIL = 'evil';

// Role ids. Core roles are always dealt; optional ones are host toggles.
export const ROLES = {
  merlin: { team: GOOD, core: true },
  percival: { team: GOOD, optional: true },
  servant: { team: GOOD, filler: true },
  assassin: { team: EVIL, core: true },
  morgana: { team: EVIL, optional: true },
  mordred: { team: EVIL, optional: true },
  oberon: { team: EVIL, optional: true },
  minion: { team: EVIL, filler: true },
};
export const ROLE_IDS = Object.keys(ROLES);
export const OPTIONAL_ROLES = ['percival', 'morgana', 'mordred', 'oberon'];

export function teamOf(role) {
  return ROLES[role].team;
}

// The host's lobby settings. Lady is off by default; Merlin sees Oberon by default.
export const DEFAULT_CONFIG = {
  percival: false,
  morgana: false,
  mordred: false,
  oberon: false,
  lady: false,
  oberonSeenByMerlin: true,
};

// The rules config derived from the host's one Oberon setting. It is split into
// two flags so the Lady's behaviour could become its own setting later without
// touching game logic.
export function rulesConfig(config) {
  return {
    merlinSeesOberon: config.oberonSeenByMerlin,
    // When Oberon is hidden from Merlin, the Lady also reports him as Good.
    ladySeesOberonAsEvil: config.oberonSeenByMerlin,
  };
}

export function questSize(playerCount, questIndex) {
  return QUEST_SIZES[playerCount][questIndex];
}

export function failsNeeded(playerCount, questIndex) {
  return playerCount >= TWO_FAIL_MIN_PLAYERS && questIndex === TWO_FAIL_QUEST_INDEX ? 2 : 1;
}

// The roles that will be dealt for this config and player count, before shuffling.
// Assumes the config is valid (see checkSetup).
export function roleList(config, playerCount) {
  const { good, evil } = TEAM_SIZES[playerCount];
  const goodRoles = ['merlin', ...(config.percival ? ['percival'] : [])];
  const evilRoles = ['assassin', ...['morgana', 'mordred', 'oberon'].filter((r) => config[r])];
  while (goodRoles.length < good) goodRoles.push('servant');
  while (evilRoles.length < evil) evilRoles.push('minion');
  return [...goodRoles, ...evilRoles];
}

// A summary of the setup for the lobby (B1/B3), plus anything that blocks Start.
// Problems and warnings use the copy-deck keys from docs/HANDOFF.md §8.
export function checkSetup(config, playerCount) {
  const problems = [];
  const warnings = [];
  const n = Math.min(Math.max(playerCount, MIN_PLAYERS), MAX_PLAYERS);
  const { good, evil } = TEAM_SIZES[n];
  const goodSpecial = ['merlin', ...(config.percival ? ['percival'] : [])];
  const evilSpecial = ['assassin', ...['morgana', 'mordred', 'oberon'].filter((r) => config[r])];

  if (playerCount < MIN_PLAYERS) {
    problems.push({ code: 'start.tooFew', params: { n: MIN_PLAYERS - playerCount } });
  }
  if (evilSpecial.length > evil) {
    problems.push({ code: 'start.tooManyEvil', params: { p: n, e: evil, r: evilSpecial.length } });
  }
  if (config.morgana && !config.percival) {
    warnings.push({ code: 'start.morganaNoPercival', params: {} });
  }
  return {
    players: n,
    good,
    evil,
    goodRoles: goodSpecial,
    servants: Math.max(0, good - goodSpecial.length),
    evilRoles: evilSpecial,
    minions: Math.max(0, evil - evilSpecial.length),
    lady: !!config.lady,
    problems,
    warnings,
    canStart: problems.length === 0,
  };
}
