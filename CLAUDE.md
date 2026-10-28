# Avalon

This file has two parts: the **design handoff** that came with the repo (kept as is, below), then the **build notes**: stack, commands, architecture, rules as implemented, decisions and progress. Keep the build notes up to date as the code changes.

# Part 1 · Design handoff

This folder is the finished UI/UX design for **Avalon**, a mobile web version of the hidden-role board game *The Resistance: Avalon*. 5–10 friends sit in one room, and each one uses their own phone. Your job is to build the real app from this design.

- **Client:** vanilla HTML/CSS/JS, mobile-first, no framework (see `docs/HANDOFF.md` §1).
- **Server:** real-time game server (WebSocket), hosted on **Render**. The server is authoritative and holds every secret.

## What's here

| Path | What it is |
|---|---|
| `docs/HANDOFF.md` | **Read first.** Tokens, type scale, layout metrics, every component and its states, motion specs, interaction rules, privacy/a11y/i18n rules, the phase state machine mapped to screens, the copy deck, and the decisions that are expensive to change. |
| `docs/SCREENS.md` | Index of all 55 artboards by flow (entry, lobby, night, board and quests, history and endgame, system states, size and language checks). |
| `design/rt.css` | The production stylesheet: tokens, components and mask-based icons. **Ship it as-is.** Reuse its class names rather than restyling. |
| `design/screens/*.dc.html` | One file per screen, the source of truth for layout, copy and states. |
| `design/screens/canvas.json` | Canvas index: screen titles, sizes and which page each one is on. |

## How to read the `.dc.html` screen files

They are "Design Component" pages from the design tool. They are not meant to run as they are, because their runtime (`support.js`) is not included. Treat them as precise specs:

- The markup inside `<x-dc>` is the real DOM structure, built from `rt.css` classes. Copy the structure and class names into your templates.
- `{{name}}` is a value from the `renderVals()` method in the `<script type="text/x-dc">` block at the bottom. `<sc-for list="{{xs}}" as="x">` repeats its children, and `<sc-if value="{{flag}}">` shows them conditionally. `onClick="{{fn}}"` is an event handler.
- The `renderVals()` logic in interactive screens shows the intended behaviour. One example is B1-LobbyHost: role toggles, the Evil-seat validation, and the reasoned disabled Start button.
- Links between `.dc.html` files and `.proto-skip` links ("Server awake ›", "Host starts ›") are only for clicking through the prototype. Don't build them. In the real app, screen changes come from server phase changes.
- Sample names (Rowan, Ilse, Kofi…) and room code `KQVX` are placeholder data.
- The `<helmet>` block holds the Google Fonts link and the page background colour.

## Rules that must not be broken

1. **No secret in the DOM unless it is being shown.** Insert a role or private result only while it is held or visible, and remove it on release. Board markup carries no secret data.
2. **The server sends private payloads per player.** Each client gets only its own role and night info. The server reveals votes and quest cards only after everyone has locked in, and it shuffles quest cards before revealing them.
3. **One two-step confirm pattern** (select, then Lock in) for votes, quest cards, Lady of the Lake and team proposals. The Assassin's strike is the only hold-to-confirm action (1.5 seconds).
4. **Disconnects:** a player's seat is held for 5 minutes, and the game never votes for anyone automatically. After 2 minutes the host may end the game.
5. **Accessibility:** every interactive element is a real `<button>`, `<a>` or `<input>`. Teams and votes are never shown by colour alone. Respect reduced motion, and use the `--ts` text scale (100/115/130%).
6. **Every string comes from i18n JSON** (English and Simplified Chinese), with ICU plurals.

## Suggested build order

1. Server: rooms, 4-letter codes (A–Z without I and O), seats, reconnect tokens, and the phase state machine (`lobby → night → propose → vote → vote_reveal → quest → quest_result → lady → assassination → game_over`), following the standard Avalon rules for 5–10 players.
2. Client shell: the `.phone` layout (topbar, status, content, dock), the socket connection with reconnect, and render-by-phase.
3. Screens, in canvas order A → G, matching each `.dc.html` screen.
4. Motion, reduced motion, text scale, Chinese strings, then the size checks (S1–S5: 360 px, 430 px, tablet, 130% text).
5. Render deployment. The free tier sleeps, so build the "Lighting the candles…" waking screen (A6) and the 45-second "Try again" offer.

Ask before changing anything listed in `docs/HANDOFF.md` §10, "Expensive to change later".

# Part 2 · Build notes

## Stack

- **Node.js 20+**, ES modules everywhere (`"type": "module"`), so the server and the browser share `shared/protocol.js`.
- **Server:** Express 4 (health route; serves `public/` in local dev) + Socket.IO 4 + helmet (security headers, CSP).
- **Client:** vanilla JS ES modules, HTML, CSS. No framework, no build step. *(Milestone 3.)*
- **Tests:** Node's built-in runner (`node --test`). No test framework dependency.
- **Hosting:** Render, one `render.yaml` with a Static Site (`public/`) and a Web Service (game server). *(Milestone 7.)*
- Dependencies are kept to a minimum: `express`, `socket.io`, `helmet`; `socket.io-client` for tests only; `redis` only if milestone 7 adds it.

## Commands

| Command | What it does | Status |
|---|---|---|
| `npm test` | All tests: engine units, leak tests, ~1,800-game simulation, socket integration. About 18 s. Must pass before every hand-off. | works |
| `npm run dev` | Server + client on one origin at http://localhost:3000, restarting on file changes. | works (client is a placeholder until milestone 3) |
| `npm start` | Production server (Render): listens on `$PORT`, `0.0.0.0`. | works |
| `npm run demo` | Bots play one full game over real sockets and print it, private info labelled. `npm run demo -- 10` for 10 players. | works |

Run one file: `node --test test/stateMachine.test.js`. Run tests by name: `node --test --test-name-pattern="Lady" test/*.test.js`.

## Repo layout

```
design/            design bundle: rt.css + screens/*.dc.html + screens/canvas.json (reference, never served)
docs/              HANDOFF.md, SCREENS.md (design docs)
src/engine/        pure game engine, no I/O
  rules.js         tables (team sizes, quest sizes, Q4 two-fail), roles, default config, rulesConfig(), checkSetup()
  rng.js           seedable RNG (mulberry32); state is one number kept in the game state
  roles.js         assignRoles(), night info per player, what the Lady sees
  stateMachine.js  createRoom(), reduce(state, action) -> { state, effects, error? }
  views.js         viewFor(state, playerId): the only way state leaves the server
  errors.js        error codes (copy-deck keys where a player can trigger them)
  index.js         public entry point
server/
  index.js         starts the server; logs crashes instead of dying
  app.js           createServer(): Express (helmet CSP, /healthz, static in dev) + Socket.IO (origin check, payload cap)
  socketHandlers.js  per socket: rate limit -> validate -> RoomManager -> ack; crashes are caught per event
  validate.js      shape checks for every intent (types, lengths); strips unknown fields
  roomManager.js   rooms, codes, tokens, seats, connections, timers; intents -> engine actions -> per-player views
  roomStore.js     RoomStore interface + in-memory implementation
  rateLimit.js     token bucket per socket
  config.js        environment variables (all listed in .env.example)
  log.js           structured JSON logs (room code + event name only)
shared/protocol.js event names, payload shapes (JSDoc), code alphabet, error codes; used by server and client
public/            client (placeholder index.html + config.js until milestone 3)
scripts/demo.js    the bot demo
test/              *.test.js are tests; helpers.js, bots.js, leakCheck.js, leakSweep.js, socketClient.js are support
```

## Architecture notes

- **One reducer per room.** The whole room (lobby players, host, settings, game) is one plain-JSON state object, changed only by `reduce(state, action)`. Reduce never mutates its input. It returns the new state plus `effects` (`phase`, `notice`, `kicked`, `closed`, `empty`) for the server to act on, or the old state plus `error: { code, params }`.
- **No I/O, clocks or randomness in the engine.** Times arrive in actions (`now`); randomness comes from the seeded RNG whose state lives in the game state. Same seed + same actions = same game (tests rely on this). The server seeds each room from `crypto` and never sends the seed or RNG state anywhere.
- **Actions.** Player intents carry `actor` (set by the server from the socket's session, never from client input): `JOIN LEAVE KICK SET_CONFIG TRANSFER_HOST START NIGHT_ACK SELECT PROPOSE VOTE CONTINUE PLAY LADY_INSPECT LADY_PASS GUESS REMATCH END`. System actions come only from the server: `SET_CONNECTED HOST_AUTO ADVANCE`.
- **Hidden information (the most important rule).**
  - The raw state holds every secret: roles, night info, live votes, live quest cards, Lady results. It is never sent anywhere.
  - `viewFor()` builds each player's view field by field from a whitelist; nothing is spread from the state.
  - Your own vote and quest card are not echoed back (only *who* has voted or played).
  - Quest cards are shuffled at the reveal, and the per-player card map is wiped from the state at that moment.
  - Night info is `{ kind, seen: [ids] }` with neutral kinds (`evil`, `maybe`, `sure`, `none`), so payloads never name a role the player couldn't know. View keys never collide with role or team words (`assassinId`, `evilIds`), which keeps string-search leak tests exact.
  - The leak tests (`test/leakCheck.js`) check every player's serialized view after every accepted action in hundreds of random games, across every phase × role. A self-test plants seven kinds of leak and checks each one is caught.
- **Server flow.** socket event → rate limit (token bucket; 50 refusals in a row cuts the socket) → `validate.js` (shape) → `RoomManager` → engine `reduce` (rules) → every connection in the room gets its own `viewFor()` → ack `{ ok }` or `{ ok:false, code, params }`. The acting player is always taken from the connection's session, never from the payload.
- **Identity.** No accounts. A session token (32 random bytes) is issued on create/join and kept in localStorage. The server stores only its SHA-256, mapped to a player id per room. The same token rejoining a room it has a seat in is a resume, which makes refreshes, sleeping tabs and A5's "same phone" case work. Player ids are public and random; tokens are never sent to anyone but their owner.
- **Connections.** A player is connected while at least one socket is attached to their seat. When the last one goes, the server sends `SET_CONNECTED false` and starts the seat-hold timer.
  - Seat expiry in the lobby or at game over removes the player; mid-game it closes the room (`seatExpired`).
  - If the away player is the host, a grace timer sends `HOST_AUTO`.
- **Timers live in RoomManager, never in the engine:** seat hold, host grace, reveal fallback (`ADVANCE` with `revealSeq`, so stale timers are harmless), the live-picks throttle, and the idle sweep. All of them are configurable, and tests shrink them to milliseconds.
- **Room lifecycle.** Codes: 4 letters from `CODE_ALPHABET` (no I or O), with collision checks. A room is deleted when:
  - the host ends the game;
  - a seat expires mid-game;
  - nobody has played for `ROOM_IDLE_MINUTES`;
  - the last player leaves.
  
  Connected players get `room:closed { reason }` (`hostEnded`, `seatExpired`, `idle`, `kicked`, `empty`). A resume to a deleted room gets `code.notFound`, which the client shows as G3.
- **Robustness.**
  - Every handler and timer is wrapped, so a bug is logged and acked as `err.server` without touching other rooms. `uncaughtException` is logged, not fatal.
  - Payloads are capped (`maxHttpBufferSize`), and so is the number of open rooms (`MAX_ROOMS`).
  - Cross-origin sockets are refused unless the origin is in `ALLOWED_ORIGIN`. This is checked on the WebSocket upgrade too, because CORS doesn't cover WebSockets.
  - Logs carry room codes and event names only: no names, tokens, roles or votes.
- **Storage.** `MemoryRoomStore` keeps plain-JSON records: engine state, hashed tokens, block list, last activity. Timers and sockets are never stored. A Redis store would keep the same synchronous interface (in-memory reads, write-through, `loadAll()` at boot).
- **Error codes** are i18n keys: copy-deck keys (`name.taken`, `pick.tooMany`, `fail.locked`, `start.tooManyEvil`…) for things players can trigger, `err.*` for things a well-behaved client never sends.

## Game rules as implemented

- **Players and teams:** 5–10 players. Good/Evil seats: 5→3/2, 6→4/2, 7→4/3, 8→5/3, 9→6/3, 10→6/4.
- **Roles:** Merlin and the Assassin are always dealt. Percival, Morgana, Mordred and Oberon are host toggles. Empty seats are filled with Loyal Servants and Minions.
- **Setup check:** the host can't start with fewer than 5 players (`start.tooFew`) or more Evil special roles than Evil seats (`start.tooManyEvil`). Morgana without Percival is only a warning.
- **Night info:**
  - Merlin sees all Evil except Mordred, and sees Oberon only when the setting is "Merlin sees Oberon" (the default).
  - Percival sees Merlin and Morgana in random order (`maybe`), or Merlin alone if Morgana is out (`sure`).
  - Evil players except Oberon see each other, but not Oberon. Oberon sees no one.
  - Loyal Servants see no one.
- **Quests:** sizes per player count are in `rules.js`. With 7+ players, Quest 4 fails only on 2+ Fail cards; every other quest fails on 1.
- **Round flow:**
  - The first leader is random. Leadership moves one seat clockwise (to the next seat in join order) for each new proposal.
  - The leader's live picks are stored and can exceed the quest size. The proposal itself must match the size exactly.
  - Everyone votes once (final). A strict majority approves; a tie rejects.
  - The rejects-in-a-row counter goes up on every rejection, resets to 0 on an approval, and the 5th rejection in a row is an Evil win. It isn't reset between quests: only an approval resets it.
  - Team members play Success or Fail, once. Good players can't play Fail.
- **Reveals:** `vote_reveal` and `quest_result` move on when every **connected** player has pressed Continue, or when the server's fallback timer sends `ADVANCE` with the matching `revealSeq`.
- **Endings:**
  - 3 failed quests: Evil wins (`threeFails`).
  - 5 rejections in a row: Evil wins (`fiveRejects`).
  - 3 successful quests lead to the assassination. The Assassin names a non-Evil player: Merlin means Evil wins (`assassinHit`), anyone else means Good wins (`assassinMiss`).
  - During the assassination everyone sees who is Evil (Oberon included) and who the Assassin is.
  - Game over reveals every role and the full history.
- **Lady of the Lake** (off by default):
  - Used after Quests 2, 3 and 4, unless that quest decided the game.
  - The first holder is the seat before the first leader.
  - The holder inspects anyone who hasn't held the Lady and isn't themselves, privately learns their team, then passes it (`LADY_PASS`) to that player.
  - Mordred shows as Evil. Oberon shows as Evil only in "Merlin sees Oberon" mode; otherwise as Good.
  - Results stay in the holder's own view for Peek.
- **Disconnects:** the game never acts for a disconnected player; the phase simply waits on them.
- **Play again:** anyone may press it at game over. The room returns to the lobby with the same players and settings, and the finished game is kept as `lastGame` so others can keep reading F4.
- **Host:** the first player to join. The host can hand the role on. If the host disconnects, the server (after a grace period) sends `HOST_AUTO`, which gives it to the longest-seated connected player. If the host leaves the lobby, it passes immediately.
- **Leaving and kicking:** leaving removes you only in the lobby or at game over; mid-game, leaving is treated as a disconnect. Kicking is for the host, in the lobby only.

## Socket protocol (summary; the source of truth is `shared/protocol.js`)

- **Client → server, entry:** `room:create {name, token?}`, `room:join {code, name, token?}`, `room:check {code, token?}`, `session:resume {code, token}`, `room:leave`.
- **Client → server, game:**
  - Lobby: `lobby:setConfig {config}`, `lobby:kick {playerId, block?}`, `host:transfer {playerId}`, `game:start`.
  - Night and quests: `night:ack`, `team:select {team}`, `team:propose {team}`, `vote:cast {approve}`, `reveal:continue`, `quest:play {card}`.
  - Lady and endgame: `lady:inspect {playerId}`, `lady:pass`, `assassin:guess {playerId}`, `game:rematch`, `game:end`.
- **Server → client:**
  - `server:hello`: timings plus `serverNow`.
  - `state:update`: this player's `viewFor()`.
  - `notice {key, params}`: toasts.
  - `room:closed {reason, name?}`.
- **Server-only error codes:** `code.notFound {code}`, `code.blocked`, `err.noSession`, `err.seatGone`, `err.badPayload`, `err.rateLimited`, `err.busy`, `err.server`.

## Decisions agreed with the owner (where the brief and the design differed)

1. **Reveals:** each player taps Continue or Skip. The server advances when every connected player has continued, with a 20-second fallback timer.
2. **Seat expiry:** a held seat expiring mid-game closes the room (G3, "X didn't come back"), as G5 says. In the lobby the player is simply removed.
3. **Ending the game:** the host can always end it from the Menu (with a confirm). After 2 minutes waiting on an offline player, it is also offered in the status bar.
4. **Play again:** the first tap moves the room to the lobby. Anyone still on F4 keeps reading the summary (`lastGame`).
5. **The Lady and Oberon:** one setting drives both `merlinSeesOberon` and `ladySeesOberonAsEvil`, kept as two flags so they can be split later.
6. **The Lady after a deciding quest:** skipped if that quest decided the game. The first holder is the seat before the first leader.
7. **Assassination:** reveals all Evil (Oberon included) by team, and names the Assassin. Evil players can't be targeted.
8. **Kick:** the G6 "block from rejoining" option blocks that session token and name for that room (`code.blocked`; needs an en.json string in milestone 3).
9. **Rejoining:** seats are reclaimed only with the session token (same phone), never by retyping a name.
10. **Timings** (all environment variables):
    - Rooms close after 120 minutes idle.
    - "Connection lost" (G2) shows after 30 seconds.
    - Host disconnect grace: 60 seconds.
    - Seat hold: 5 minutes.
    - Host may end the game after 2 minutes of waiting.
11. **Copy:** en.json uses "them" where design copy says "him" for an arbitrary player.
12. **Shared protocol file:** `shared/protocol.js` is the single source. The Render static site build copies it into `public/shared/`; local dev serves `/shared` directly.
13. **Security headers:** the static site's CSP is set through `headers` in render.yaml; helmet covers what Express serves.

## Progress

- [x] **Milestone 1: engine and tests.** rules, roles, night info, state machine, viewFor, leak tests, simulation.
- [x] **Milestone 2: server and rooms.** Express + Socket.IO, protocol, create/join/check/resume, tokens, reconnect, host transfer, kick + block, timers, rate limit, payload cap, origin check, /healthz, socket integration tests, bot demo.
- [ ] Milestone 3: design foundation, home, join, lobby, role reveal.
- [ ] Milestone 4: core game loop.
- [ ] Milestone 5: assassination, Lady, Play again, Menu, How to play.
- [ ] Milestone 6: polish and system states.
- [ ] Milestone 7: deploy.

### Additions to the design (screens or states the bundle didn't have)

None yet.
