# Avalon

A real-time, mobile-first web version of a hidden-role game of Arthurian loyalty, for 5–10 friends in one room, each on their own phone. The server deals secret roles and shows each player only what they're allowed to know. The app replaces the board, cards and tokens. It doesn't replace the talking.

For personal use with friends. The game title lives in one constant (`GAME_TITLE` in `public/config.js`), so renaming is a one-line change.

## Status

All 7 milestones are done: the game engine, the real-time server, every screen a game needs on phones and tablets, and everything needed to put it online for free on Render (below). The game is in English and Simplified Chinese (简体中文): each player picks a language under **Settings** (the sliders button on the home screen) or **Menu → Display**. Phones set to Chinese start in Chinese. See `CLAUDE.md` → *Progress*, and `docs/PLAYTEST.md` for a 5-phone playtest checklist.

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
- The Lady of the Lake is off by default. The host turns it on in the lobby under **Roles & rules** (best with 7 or more players).
- If a phone drops out mid-game, the game waits for it when that player is needed. After 2 minutes the host can end the game from the status bar, or at any time from the Menu.
- Over plain `http://`, some phones can't open the share sheet, so the app copies the invite link instead.
- If a phone can't connect, check that your computer's firewall allows Node.js on port 3000.
- Keeping the screen awake only works over `https://`, so phones will still dim and lock during Wi-Fi testing. It works once the game is online on Render.
- "Vibrate on my turn" works on Android phones. iPhones don't allow websites to vibrate, so there it does nothing.

## Deploy to Render

Render hosts the game for free. `render.yaml` describes two pieces, and Render builds both from this GitHub repository:

| Piece | Render name | What it is |
|---|---|---|
| Static Site | `avalon` | The page itself. Always awake and loads instantly. **This is the address you share with friends.** |
| Web Service | `avalon-server` | The game server. On the free plan it sleeps after 15 minutes without players. The page wakes it ("Lighting the candles…"), which takes up to a minute. |

You'll need a GitHub account (you have one) and about 15 minutes.

### 1. Put the finished code on the `main` branch

Render deploys one branch. The work so far is on the branch `claude/cool-mccarthy-peyhjq`.
1. On GitHub, open the repository page: https://github.com/gabb-coder/avalon.
2. Click **Pull requests** → **New pull request**.
3. Set **base: main** and **compare: claude/cool-mccarthy-peyhjq**.
4. Click **Create pull request**, then **Merge pull request** → **Confirm merge**.

(Or ask me to open the pull request, and you only press Merge.)

### 2. Create a Render account

1. Go to https://render.com and click **Get Started**.
2. Choose **Sign up with GitHub**.
3. When GitHub asks which repositories Render may see, allow `gabb-coder/avalon` (or all repositories).

### 3. Create both services from the Blueprint

1. In the Render dashboard, click **New** → **Blueprint**.
2. Pick the `gabb-coder/avalon` repository and the `main` branch. Render reads `render.yaml` and lists `avalon-server` and `avalon`.
3. Give the Blueprint a name (for example `avalon`).
4. Render asks for two values:
   - **ALLOWED_ORIGIN** (on avalon-server): type `https://avalon.onrender.com`
   - **SERVER_URL** (on avalon): type `https://avalon-server.onrender.com`
5. Click **Deploy Blueprint** (or **Apply**). Both services build; wait until both say **Live** (a few minutes).

### 4. Check the two addresses

Render gives each service an address. If a name is already taken by someone else, Render adds a few random letters, for example `https://avalon-x7k2.onrender.com`.
1. Open the **avalon** service. Its address is shown near the top. This is the game's address.
2. Open the **avalon-server** service and note its address too.
3. If both match what you typed in step 3, skip to step 5. If not, fix them:
   - In **avalon-server** → **Environment**: set `ALLOWED_ORIGIN` to the **avalon** address (no `/` at the end). Click **Save and deploy**.
   - In **avalon** → **Environment**: set `SERVER_URL` to the **avalon-server** address. Click **Save, rebuild, and deploy**. The page has the server address built in, so this one needs the rebuild.

### 5. Check that it works

1. Open the avalon-server address followed by `/healthz`, for example `https://avalon-server.onrender.com/healthz`. After at most a minute it shows `{"ok":true,…}`.
2. Open the **avalon** address on your phone and create a room. Join from a second phone with the code.
3. Run through the playtest checklist in `docs/PLAYTEST.md` with 5 phones.

### 6. Updating the game later

Every time new code lands on `main`, Render rebuilds and redeploys both services by itself.

A redeploy restarts the game server. Without step 7, rooms live only in the server's memory, so **update between games**: a restart ends any game in progress. The page then tells everyone the room has closed.

### 7. Optional: keep games through restarts

Without this, a game ends if the server restarts: an update, a crash, or the free plan's sleep between games. To keep games through restarts, add a free Redis-compatible store:
1. In Render, click **New** → **Key Value**.
2. Name it `avalon-rooms`, pick the **Free** plan, and choose the **same region** as avalon-server. Click **Create**.
3. When it's ready, copy its **Internal Key Value URL** (it starts with `redis://`). Use the internal one: it's reachable only by your Render services.
4. In **avalon-server** → **Environment**, set `REDIS_URL` to that URL and click **Save and deploy**.
5. Open avalon-server → **Logs**. The start-up line should include `"rooms":"redis"`. If Redis can't be reached, the server still starts, keeps rooms in memory, and logs `redis.unavailable`.

Limits to know:
- Free Key Value instances keep data in memory. Games survive the game server restarting, but not the Key Value instance itself restarting.
- During an update, Render briefly runs the old and new servers side by side. Something tapped in those few seconds can be lost: everyone's phone reconnects, and a vote or card may need to be made again. Updating between games is still best.

### If something isn't working

- **"Lighting the candles…" never finishes:** `SERVER_URL` on avalon is wrong, or the site wasn't rebuilt after changing it. Open the avalon address followed by `/config.js`: the address on the `SERVER_URL` line must be your avalon-server address.
- **"Reconnecting…" straight away, or rooms can't be created:** `ALLOWED_ORIGIN` on avalon-server doesn't match the avalon address exactly. The server's **Logs** show `socket.refusedOrigin` with the address it refused.
- **Everything was fine, then rooms vanished:** the server restarted (an update, or it slept after 15 minutes without players). See step 7.
- **Logs:** each service has a **Logs** tab. The game server logs only room codes and event names, never names, roles or votes.
- **Your own domain:** this works, but the page's security settings in `render.yaml` only allow servers on `onrender.com`. Ask me to update them when you add a domain.

## Docs

- `CLAUDE.md`: stack, commands, architecture, the rules as implemented, and the decisions made.
- `docs/PLAYTEST.md`: the 5-phone playtest checklist.
- `.env.example`: every setting, with its default.
- `docs/HANDOFF.md` and `docs/SCREENS.md`: the design spec.
