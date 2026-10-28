// Error codes returned for rejected actions. Codes that a player can trigger
// through normal play use the copy-deck keys from docs/HANDOFF.md §8, so the
// client can show them directly through i18n. The `err.*` codes mean a client
// sent something it shouldn't have (wrong phase, wrong player, malformed).

export const ERR = {
  BAD_ACTION: 'err.badAction',
  PHASE: 'err.phase',
  NOT_HOST: 'err.notHost',
  NOT_PLAYER: 'err.notPlayer',
  NOT_LEADER: 'err.notLeader',
  BAD_PLAYER: 'err.badPlayer',
  LOCKED: 'err.locked', // already voted / played / acknowledged: locked means final
  NOT_ON_TEAM: 'err.notOnTeam',
  NOT_HOLDER: 'err.notHolder',
  NOT_ASSASSIN: 'err.notAssassin',
  BAD_TARGET: 'err.badTarget',
  KICK_SELF: 'err.kickSelf',
  STALE: 'err.stale',

  NAME_EMPTY: 'name.empty',
  NAME_TOO_LONG: 'name.tooLong',
  NAME_TAKEN: 'name.taken',
  ROOM_FULL: 'code.full',
  STARTED: 'code.started',
  PICK_TOO_FEW: 'pick.tooFew',
  PICK_TOO_MANY: 'pick.tooMany',
  FAIL_LOCKED: 'fail.locked',
  LADY_REPEAT: 'lady.disabled',
  LADY_SELF: 'lady.self',
};

export function error(code, params = {}) {
  return { code, params };
}
