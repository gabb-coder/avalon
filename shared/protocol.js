// The socket protocol shared by the server and the browser client.
//
// Client → server events are "intents": the client asks, the server decides.
// Every intent is answered through the Socket.IO acknowledgement callback with
// either { ok: true, ...extra } or { ok: false, code, params }. `code` is an
// i18n key (copy-deck keys like 'name.taken', or 'err.*' for things a
// well-behaved client never sends).
//
// Server → client events carry per-player data only: every state message is
// built by viewFor(state, playerId) for that one player.

// ---------- room codes and limits ----------

// 24 letters: A–Z without I and O, so codes survive being read aloud.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;
export const CODE_PATTERN = /^[A-HJ-NP-Z]{4}$/;
export const NAME_MAX = 16;
// Session tokens are 32 random bytes, base64url-encoded.
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// ---------- client → server ----------

export const C2S = {
  /** { name: string, token?: string } → ack { ok, code, playerId, token } */
  ROOM_CREATE: 'room:create',
  /** { code: string, name: string, token?: string } → ack { ok, code, playerId, token, resumed } */
  ROOM_JOIN: 'room:join',
  /**
   * Look a room up without joining (A3 "Found Rowan's room", A2 "Back to room?").
   * { code: string, token?: string } → ack { ok, exists, hostName, players, started, full, seated }
   */
  ROOM_CHECK: 'room:check',
  /** Reclaim a seat after a refresh or dropped connection. { code, token } → ack { ok, code, playerId } */
  SESSION_RESUME: 'session:resume',
  /** Leave the room. In the lobby or at game over this frees the seat; mid-game the seat is held. {} */
  ROOM_LEAVE: 'room:leave',

  /** Host only, lobby only. { config: { percival?, morgana?, mordred?, oberon?, lady?, oberonSeenByMerlin? } } */
  LOBBY_SET_CONFIG: 'lobby:setConfig',
  /** Host only, lobby only. { playerId: string, block?: boolean } */
  LOBBY_KICK: 'lobby:kick',
  /** Host only. { playerId: string } */
  HOST_TRANSFER: 'host:transfer',
  /** Host only. {} */
  GAME_START: 'game:start',

  /** "I've seen my role". {} */
  NIGHT_ACK: 'night:ack',
  /** Leader's live picks, broadcast to the table (throttled ~150 ms). { team: string[] } */
  TEAM_SELECT: 'team:select',
  /** Leader sends the team to the vote. { team: string[] } */
  TEAM_PROPOSE: 'team:propose',
  /** Locked in, final. { approve: boolean } */
  VOTE_CAST: 'vote:cast',
  /** Done looking at a vote reveal or quest result (also sent by Skip). {} */
  REVEAL_CONTINUE: 'reveal:continue',
  /** Team members only. { card: 'success' | 'fail' } */
  QUEST_PLAY: 'quest:play',
  /** Lady holder only. { playerId: string } */
  LADY_INSPECT: 'lady:inspect',
  /** Lady holder, after seeing the result: hide it and pass the Lady on. {} */
  LADY_PASS: 'lady:pass',
  /** Assassin only. { playerId: string } */
  ASSASSIN_GUESS: 'assassin:guess',
  /** Play again (anyone, at game over). {} */
  GAME_REMATCH: 'game:rematch',
  /** Host only: end the game for everyone and close the room. {} */
  GAME_END: 'game:end',
};

// ---------- server → client ----------

export const S2C = {
  /**
   * Sent on connect. Timings the client needs for its own UI, plus the server's
   * clock so the client can turn server times (e.g. disconnectedAt) into
   * "how long ago" without trusting the phone's clock:
   * { serverNow, seatHoldMs, hostEndAfterMs, revealFallbackMs, connectionLostMs }
   */
  HELLO: 'server:hello',
  /** This player's view of the room: the output of viewFor(). See src/engine/views.js. */
  STATE: 'state:update',
  /** A toast: { key: string, params: object }, e.g. 'notice.away' { name } */
  NOTICE: 'notice',
  /**
   * The room is gone for this player.
   * { reason: 'hostEnded' | 'seatExpired' | 'idle' | 'kicked' | 'empty', name?: string }
   */
  ROOM_CLOSED: 'room:closed',
};

// ---------- error codes the server adds on top of the engine's ----------

export const SERVER_ERRORS = {
  NOT_FOUND: 'code.notFound', // { code }
  BLOCKED: 'code.blocked', // the host removed you from this room
  BUSY: 'err.busy', // the server has too many open rooms right now
  NO_SESSION: 'err.noSession', // intent sent before creating, joining or resuming
  SEAT_GONE: 'err.seatGone', // resume with a token that no longer has a seat
  BAD_PAYLOAD: 'err.badPayload',
  RATE_LIMITED: 'err.rateLimited',
  SERVER: 'err.server',
};
