# Avalon — design handoff for the build

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
