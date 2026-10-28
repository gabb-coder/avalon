# Avalon

A real-time, mobile-first web version of a hidden-role game of Arthurian loyalty, for 5–10 friends in one room, each on their own phone. The server deals secret roles and shows each player only what they're allowed to know. The app replaces the board, cards and tokens. It doesn't replace the talking.

For personal use with friends. The game title lives in one constant (`GAME_TITLE` in `public/config.js`), so renaming is a one-line change.

## Status

Milestones 1–3 of 7 are done: the game engine, the real-time server, and the phone screens up to the role reveal (home, join, lobby, night). The game board comes in milestone 4. See `CLAUDE.md` → *Progress*.

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

Then open http://localhost:3000 in your browser.

### Try it on phones (same Wi-Fi)

1. Start the server on your computer with `npm run dev`.
2. Find your computer's local IP address:
   - **Mac:** System Settings → Wi-Fi → Details → IP address (looks like `192.168.1.23`).
   - **Windows:** run `ipconfig` in a terminal and look for "IPv4 Address".
3. On each phone, connected to the **same Wi-Fi**, open `http://192.168.1.23:3000` (your IP, port 3000).
4. One phone creates a room. The others tap **Join room** and type the code, or the host taps the share button and sends the link.
5. With 5 players, the host taps **Start game · deal roles**. Everyone holds their card to see their role.

Notes:
- The game board after the role reveal is a placeholder until milestone 4.
- Over plain `http://`, some phones can't open the share sheet, so the app copies the invite link instead.
- If a phone can't connect, check that your computer's firewall allows Node.js on port 3000.

## Docs

- `CLAUDE.md`: stack, commands, architecture, the rules as implemented, and the decisions made.
- `docs/HANDOFF.md` and `docs/SCREENS.md`: the design spec.
