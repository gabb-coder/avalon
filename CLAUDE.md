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
- **Client:** vanilla JS ES modules, HTML, CSS. No framework, no bundler. `npm run build:static` only copies two files into `public/` (the shared protocol and the Socket.IO browser client).
- **Tests:** Node's built-in runner (`node --test`). No test framework dependency.
- **Hosting:** Render, one `render.yaml` with a Static Site (`public/`) and a Web Service (game server). *(Milestone 7.)*
- Dependencies are kept to a minimum: `express`, `socket.io`, `helmet`; `socket.io-client` for tests only; `redis` only if milestone 7 adds it.

## Commands

| Command | What it does | Status |
|---|---|---|
| `npm test` | All tests: engine units, leak tests, ~1,800-game simulation, socket integration, client checks. About 20 s. Must pass before every hand-off. | works |
| `npm run dev` | Server + client on one origin at http://localhost:3000 (and http://<your-computer's-IP>:3000 for phones on the same Wi-Fi), restarting on server changes. Client files need only a browser reload. | works |
| `npm start` | Production server (Render): listens on `$PORT`, `0.0.0.0`. | works |
| `npm run demo` | Bots play one full game over real sockets and print it, private info labelled. `npm run demo -- 10` for 10 players. | works |
| `npm run build:static` | Copies `shared/protocol.js` and the Socket.IO browser client into `public/` (gitignored). The Render static site runs it; local dev doesn't need it. | works |

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
public/            the client (served as a static site in production)
  index.html       one page: fonts, rt.css, app.css, js/app.js; no inline scripts or styles (CSP)
  config.js        GAME_TITLE and SERVER_URL (the one place to rename the game or point at the server)
  css/rt.css       design/rt.css, unchanged (a test checks it)
  css/app.css      production shell, the design's inline styles as classes (tokens only), button-typography fix
  i18n/en.json     every string; copy-deck keys where they exist
  js/app.js        shell: connection, session, routing, render loop, display prefs
  js/net.js        Socket.IO connection + request() with acks; /healthz waking ping
  js/i18n.js       t(key, params), ICU subset (plural/select/#) via Intl.PluralRules
  js/dom.js        h() builder (textContent only), icon(), avatar(), replace() with focus restore
  js/prefs.js      localStorage (name, token, session, text size, motion, vibration), failure-safe
  js/share.js      copy code / share invite link (with an http fallback)
  js/device.js     screen wake lock during a game; one fixed buzz when it becomes your turn
  js/components/   ui (buttons, status, chips, rows, fields, toggles, seg), hold, peek, roleCard,
                   codeInput, overlay (sheet/modal + focus trap), toast,
                   board (quest track, reject counter, seat ring in 3 sizes, game top bar, offline status),
                   history (vote grid, legend, follow-a-player), reveal (Skip + Continue dock)
  js/screens/      splash A1, home A2, join A3–A5, waking A6, lobby B1–B3+G4, night C1–C3,
                   propose D1–D4+D17, vote D5–D6, reveal D7–D8, quest D9–D11, result D12–D13,
                   lady D14–D16, assassin F1–F3, gameover F4, ended G3, connection (G1 overlay),
                   lost G2, sheets (B4, E1/E2 history, E3, E4 + End game, G5, G6)
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
- **Client rendering.** No framework. `app.js` picks a screen key (`splash`, `home`, `join`, `waking`, `ended`, or, in a room, from the server phase via `PHASE_SCREENS`: `lobby`, `night`, `propose`, `vote`, `reveal`, `quest`, `result`, `lady`, `assassin`, `gameover`). Each screen module exports `mount(app) → { el, update(), destroy() }`. A new key mounts a fresh screen; otherwise `update()` repaints its dynamic regions with `replace()`, which keeps keyboard focus on the element with the same `data-key`. Sheets and modals mount on top (one at a time, focus trapped). Toasts sit above the dock (`--dock-h` follows the dock's real height); while a sheet or dialog is open they move to the top of the screen, still in front, so they never cover its buttons.
- **Client privacy.**
  - Role and night info exist in JS memory only, as the latest view.
  - The DOM gets the card front (`roleFront`) or Peek sheet (`peekSheet`) only inside a hold's `onShow`, and they are removed in `onHide`. Hold hides on pointerup, cancel, leave, lost capture, blur, window blur and visibilitychange.
  - The card's aria-label names the role only while held.
  - `document.title` is always just the game title.
  - Tests check that `roleFront`/`peekSheet` are only called from hold handlers. A browser check confirmed the front is absent from the DOM after release.
- **Game screens.**
  - Each phase screen repaints its status and content on every update. The dock is rebuilt only when its shape changes, so a held Peek is never cut off by a live update (picks, votes coming in).
  - Screens that send a final action (vote, quest card) check they're still mounted before repainting, because the last vote or card moves the phase on before the ack returns.
  - Reveal screens build their animated content once and only refresh the Continue dock.
- **Board geometry.** The ring has three sizes, from the design:
  - `sm`: S1 and any screen under 780 px tall, or narrower than 380 px.
  - `md`: D1.
  - `lg`: S2, at least 430×900.
  
  Seats go clockwise from you at the bottom (D1 maths), so the leader token moves to the next seat each proposal. Short screens also get `.qtrack.compact` and Peek in the dock row. The board rebuilds only when its size class changes, not on every resize (phones resize constantly).
- **Play again (decision 4) on the client.** `app.holdSummary` is set when the view shows `game_over`. If the room goes back to the lobby before this player presses Play again, F4 keeps rendering from `view.lastGame`. It clears on their own Play again or Leave, or when a new game starts.
- **Lady of the Lake (D14–D16).** The holder picks (themselves and past holders locked), then sees the answer on a parchment card. The answer is in the holder's own view only (`me.ladyResults`).
  - The card is put on screen face-up right after "Look into" returns, as the design shows.
  - It leaves the DOM the moment the page is hidden (app switch, screen lock). After that, or after a reload, it is only shown while "Hold to see the answer again" is held.
  - "Hide & pass" removes it before sending `lady:pass`. Afterwards it lives in Peek.
  - A test checks that only `screens/lady.js` builds the card, and only in its shown or held branch.
- **Assassination (F1–F3).** The phone turns crimson (`.phone-tense`) while this screen is mounted. The Assassin picks a non-Evil player (allies locked and marked Evil), then F2's dialog needs one unbroken 1.5 s hold (`bindHoldToConfirm` in `hold.js`, built on `bindHold`, so any way of letting go cancels; keyboard Space/Enter works too). Everyone else sees the Evil team (Oberon included) and who is choosing.
- **Ending a game (decision 3).** The host's Menu has "End game for everyone" during a game, with a confirm. The status bar also offers it once the table has waited `hostEndAfterMs` on an offline player it needs (`endOfferDue()` in `board.js`; `app.js` sets a timer to repaint at that moment, because no update arrives then). The host's own G3 says "You ended the game".
- **Connection (G1, G2).** `app.offlineSince` is set when a room's socket drops.
  - **G1** (`screens/connection.js`): for the first `connectionLostMs` (30 s) the game screen dims and becomes `inert` (no taps, out of the tab order), open sheets close, a banner counts the attempts ("Attempt 2 · your seat, role and vote are held") and "Hang tight" sits over the middle.
  - **G2** (`screens/lost.js`): after that, the "Connection lost" screen with Try again, Back to home, and the seat-hold countdown. The countdown starts when this phone lost the connection, which is no later than when the server noticed, so it can only err on the short side.
  - The socket keeps retrying the whole time. When it gets through, the app resumes the seat and the game screen comes back by itself. "Back to home" keeps the seat (Home offers "Back to room?").
- **Wake lock and vibration (`device.js`).** The screen wake lock is held while a game is on (not in the lobby or at game over) and taken again when the page comes back to the front. A short buzz (one fixed pattern) fires when a new turn of yours starts: leader, voter, team member, Lady holder, Assassin. These are all turns the table can already see are yours, so a buzz never carries a secret. Off via Menu → Vibrate on my turn.
- **Tablet (S3).** At ≥ 768×700 the team-building board becomes two columns: the `xl` ring beside a panel with the quest track, rejects, leader and Lady lines, and the vote history always open underneath (follow-a-player works there too). The top bar has text buttons (Menu, Rules, Roles). Other screens, and the leader's picker, stay a centred phone column, which suits one-handed choices.
- **Text size 130% (S5).** The status bar's top line wraps, the top bar grows instead of overlapping, and the vote-reveal grid becomes one column (`.ts-lg`), because names only ellipsize in the ring and history header (HANDOFF §6).
- **Reduced motion** follows Menu → Reduce motion or the phone's setting, live (a media-query listener). The `.reduce-motion` mirror in app.css covers the app's own animations too. Hold to strike keeps its 1.5 s fill, because it is a timer, not decoration.
- **Toasts with an id.** "X lost connection" is brief (the status bar already shows who is offline), and "X is back" withdraws it.
- **Accessibility checks.** Besides the tests, each milestone's browser run audits every screen and dialog. It checks:
  - every control has an accessible name, and radios, tabs and switches carry state;
  - label and description ids exist, and no id is duplicated;
  - there is no positive tabindex, and targets are at least 40 px;
  - keyboard focus is visible;
  - nothing sticks out sideways at 360 px with 130% text.
- **History sheet.** It subscribes to view updates while open (`app.subscribe`), so votes appear live. Columns start with you, like the ring. Tapping a name follows that column.
- **Session on the phone.** `prefs.token` (one per phone) and `prefs.session = { code, playerId, active }`. On load, an active session goes straight back into the room (sleeping tabs reload all the time). Leaving mid-game (G5) keeps the session inactive, so Home offers "Back to room?" after a `room:check`. A failed resume shows G3 (`gone`/`seatGone`).
- **Waking (A6).** The page pings `/healthz` on open. Create, join or resume while the socket is down shows A6 after 600 ms, runs the task as soon as the socket connects, and offers "Try again" after 45 s.
- **Strings.** Every string goes through `t()`. A test scans the client for `t('…')` keys and checks them, plus every runtime-built key and every server error code, against en.json.
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
- [x] **Milestone 3: design foundation, home, join, lobby, role reveal.** rt.css shipped as-is, app.css, en.json, components (buttons, inputs, code input, player rows, chips, status bar, role card, hold-to-reveal, peek, sheet, modal, toast), screens A1–A6, B1–B4, C1–C3, plus G3, G4, G5, G6, a first G1 banner, E3 and part of E4. Checked in Chromium against the design files.
- [x] **Milestone 4: core game loop.** Board with ring (3 sizes), quest track and reject counter (D1, D4, D17, S1, S2), leader picker with live picks (D2, D3), vote with two-step lock (D5, D6), staggered vote reveal with Skip (D7, D8), quest cards for Good/Evil/not-on-team (D9–D11), coin-flip quest result with the Q4 rule (D12, D13), live history sheet with follow-a-player (E1, E2), game over with roles and all votes, Play again and Leave (F4). Checked in Chromium with full 7-player games at 390×844 and 360×740.
- [x] **Milestone 5: assassination, Lady, Menu.** Lady of the Lake for holder and watchers (D14–D16), with the answer hidden on app switch and kept in Peek; assassination pick, hold-to-strike and the tense wait with Evil revealed (F1–F3); the full Menu with "End game for everyone" and its confirm, plus the host's status-bar offer after 2 minutes (E4, decision 3). Play again (F4) and How to play (E3) were already built in M4 and M3. Checked in Chromium with 7 browser phones at 390×844 and 360×740.
- [x] **Milestone 6: polish and system states.**
  - The full G1 overlay and G2 with its seat countdown; G3–G6 were already built in M3/M5.
  - Wake lock, and vibrate on your turn.
  - Reduced motion follows the phone's setting live.
  - The S3 tablet board; S5 fixes at 130% text; S1/S2 rechecked.
  - Accessibility audit of every screen and dialog.
  - Checked in Chromium:
    - G1/G2 through a relay that cuts the connection;
    - wake lock and vibration with recorded calls;
    - full games at 390×844, 360×740 with 130% text, and 834×1194.
- [ ] Milestone 7: deploy.

### Additions to the design (screens or states the bundle didn't have)

- **A2 name entry.** A2 only shows a remembered name ("Playing as Rowan · Change"). On a first visit, or after "Change", the A3 name field (label, n/16 counter, message) appears in that panel's place, with "Save name" when editing.
- **A3 messages.** These are new:
  - "Looking for that room…" while the code is checked.
  - "You have a seat in room X. Join to take it back." when this phone is already seated.
  - The disabled reason "Enter the 4-letter code and your name" before anything is typed.
- **A5 copy.** "Room X is already playing" replaces the design's quest number, which `room:check` doesn't expose.
- **Host hand-over picker** (G4 "Hand it on", E4 "Hand host to another player"). A sheet with a radio list of players, then "Make X host": the same select-then-confirm pattern.
- **Home settings** (A2's sliders button). A "Settings" sheet with E4's Display section: text size, reduce motion, vibrate.
- **G3 variants.**
  - "You were removed" (kicked).
  - "Your seat in room X was given up while you were away" (`seatGone`).
  - The server-restart sentence for a resume that finds no room.
  - Separate sentences for `hostEnded`, `seatExpired`, `idle` and `empty`.
- **Night-info notes for every role and config.** The design shows one example per role. The new notes:
  - Merlin, when nothing is hidden: "You see every Evil player at the table."
  - Percival without Morgana gets the heading "Merlin is".
  - Morgana without Percival: "Percival isn't in this game…".
  - Any Evil player, when Oberon is in the game: "Oberon is in this game, but hidden from you."
- **Lady results in Peek.** "The Lady showed you: Sana · Evil" (HANDOFF §9: the Lady result is kept in Peek).
- **Lady, while the holder is still choosing.** D16 only shows "Rowan is looking into Sana". Before the holder picks, watchers see "Rowan holds the Lady and is choosing", with an empty "?" seat in place of the target.
- **Lady, hidden again.** "Hold to see the answer again" (see Architecture notes), and the line "This was the last look of the game" when the Lady was used after Quest 4.
- **End game confirm.** The design has the Menu button but no dialog. It uses the G5/G6 danger-dialog pattern: "End the game for everyone?", with the danger action first and "Keep playing" under it. The status-bar offer is a small red link under the waiting line.
- **G3 for the host who ended the game:** "You ended the game. Room X has closed for everyone."
- **Menu subtitle** adds "· Quest N" during a game, as in E4.
- **Reveals after Continue.** Decision 1 needs this state: "Waiting for N more players to finish reading" with dots, in the dock.
- **Endings from a reveal.**
  - After a 5th rejection: the status bar turns tense, says "Five teams in a row were rejected. Evil wins.", and the button reads "See how it ended".
  - After a third failed quest, the result screen's button also reads "See how it ended".
- **Vote, last chance.** At 4 rejections the Reject explanation reads: "this would be the 5th rejected team in a row, and Evil wins."
- **Leader picker.** For teams of 4–5, the button says "Send these N knights to the vote", since naming everyone would overflow.
- **Table centre (third line).**
  - Before the first result: "1 Fail sinks it".
  - On a two-fail quest: "Needs 2 Fails to sink".
  - Otherwise, once results exist, the score: "Good 1 · Evil 1" (D17).
- **History.**
  - An empty state: "No votes yet…".
  - Your column comes first (like the ring).
  - A quest header for a quest still under way.
- **Game-over reasons** for all four endings (F4 shows only the assassination miss).
- **G1 attempt count** and **G2 after the hold runs out:** "Your seat may have been given up. Try again to find out."
- **Tablet info lines** (S3 shows two examples): "You lead · next: Jude", "Kofi holds the Lady · use after Quest 3" (the "use after" part is left out after Quest 4).

### Deviations from the design (and why)

- **Button typography.** rt.css's `.phone button { font: inherit; color: inherit; }` outranks single-class rules like `.btn-primary`. The design's screens mostly use `<a class="btn">`, but the build uses real `<button>`s (accessibility rule). app.css restores each component's own type and colour for buttons, exactly as rt.css defines them; otherwise primary buttons would show light text on gold and fail contrast. rt.css itself is untouched.
- **Lobby back button** leaves right away. The design links it to G5, whose copy is about mid-game ("The table can't finish without you"); in the lobby leaving costs nothing, and the code lets you back in. G5 is used mid-game (Menu → Leave game).
- **Copy.** "him" becomes "them" for arbitrary players (decision 11), e.g. Morgana's ability "pull them off course".
- **G1 dims the whole screen, dock included.** The design keeps the dock bright with a disabled "Vote · Waiting for connection" button. Here the whole screen is `inert` and dimmed, which disables every button in every phase in one place; the banner and "Hang tight" say why.
- **Tablet layout only for team building.** S3 is the only tablet artboard. Votes, quests, reveals and the rest keep the phone column, centred.
- **Chinese (S4)** is not built: the milestones above don't include it. Every string already goes through `t()` and en.json, so it is a matter of adding `zh-Hans.json`, a language switch and the CJK type rules from HANDOFF §6.
