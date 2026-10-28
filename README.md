# Avalon

A real-time, mobile-first web version of a hidden-role game of Arthurian loyalty, for 5–10 friends in one room, each on their own phone. The server deals secret roles and shows each player only what they're allowed to know. The app replaces the board, cards and tokens. It doesn't replace the talking.

For personal use with friends. The game title lives in one constant (`GAME_TITLE` in `public/config.js`), so renaming is a one-line change.

## Status

Milestones 1 and 2 of 7 are done: the game engine and the real-time server. The phone screens come in milestone 3. See `CLAUDE.md` → *Progress*.

## Try it

You need Node.js 20 or newer (`node -v` to check).

First time only, install the dependencies:

```bash
npm install
```

Run all the tests (about 20 seconds; it should end with `# fail 0`):

```bash
npm test
```

Watch bots play a full game over real network connections. Change the number for 5–10 players:

```bash
npm run demo -- 7
```

Start the server for development (stop it with Ctrl+C):

```bash
npm run dev
```

Then open http://localhost:3000/healthz in your browser. It should say `{"ok":true,...}`.

## Docs

- `CLAUDE.md`: stack, commands, architecture, the rules as implemented, and the decisions made.
- `docs/HANDOFF.md` and `docs/SCREENS.md`: the design spec.
