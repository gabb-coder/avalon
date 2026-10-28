# Avalon

A real-time, mobile-first web version of a hidden-role game of Arthurian loyalty, for 5–10 friends in one room, each on their own phone. The server deals secret roles and shows each player only what they're allowed to know. The app replaces the board, cards and tokens. It doesn't replace the talking.

For personal use with friends. The game title lives in one constant (`GAME_TITLE` in `public/config.js`), so renaming is a one-line change.

## Status

Milestone 1 of 7 is done: the game engine and its tests. There is no server or UI yet. See `CLAUDE.md` → *Progress*.

## Try it

You need Node.js 20 or newer (`node -v` to check).

```bash
npm test
```

This runs every engine test: the rules tables, role dealing and night info, the state machine, the information-leak tests, and a simulation of about 1,800 random games. It takes about 20 seconds and should end with `# fail 0`.

## Docs

- `CLAUDE.md`: stack, commands, architecture, the rules as implemented, and the decisions made.
- `docs/HANDOFF.md` and `docs/SCREENS.md`: the design spec.
