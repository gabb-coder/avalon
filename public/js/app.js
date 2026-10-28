// The app shell: owns the connection, the session and which screen shows.
//
// Before you're in a room the client routes on its own (splash, home, join,
// waking, ended). Once you're in a room the server's phase decides the screen:
// every change arrives as a state:update with this player's view.

import { C2S } from '../shared/protocol.js';
import { GAME_TITLE } from '../config.js';
import { loadLocale, t } from './i18n.js';
import { prefs } from './prefs.js';
import { createNet, wakeServer } from './net.js';
import { h } from './dom.js';
import { mountToasts, toast, clearToasts } from './components/toast.js';
import { closeOverlay } from './components/overlay.js';
import * as splash from './screens/splash.js';
import * as home from './screens/home.js';
import * as join from './screens/join.js';
import * as waking from './screens/waking.js';
import * as ended from './screens/ended.js';
import * as lobby from './screens/lobby.js';
import * as night from './screens/night.js';
import * as board from './screens/board.js';
import * as propose from './screens/propose.js';
import * as vote from './screens/vote.js';
import * as reveal from './screens/reveal.js';
import * as quest from './screens/quest.js';
import * as result from './screens/result.js';
import * as gameover from './screens/gameover.js';
import { connectionBanner } from './screens/connection.js';
import { ringSize, isShort } from './components/board.js';

const SCREENS = { splash, home, join, waking, ended, lobby, night, board, propose, vote, reveal, quest, result, gameover };

// Server phase -> screen. Lady and assassination are still the temporary
// board until milestone 5.
const PHASE_SCREENS = {
  lobby: 'lobby',
  night: 'night',
  propose: 'propose',
  vote: 'vote',
  vote_reveal: 'reveal',
  quest: 'quest',
  quest_result: 'result',
  game_over: 'gameover',
};
const SPLASH_MIN_MS = 900;
const WAKING_DELAY_MS = 600; // a fast server never flashes the waking screen

const root = document.getElementById('app');

const app = {
  root,
  route: 'splash', // splash | home | join | waking | room | ended
  conn: 'connecting', // connecting | online | offline
  everOnline: false,
  awake: false, // /healthz has answered
  reached: false, // a /healthz request is pending at the host (it's waking)
  hello: null,
  clockOffset: 0, // server clock minus ours
  view: null, // latest state:update for this player
  pending: null, // { task: 'create' | 'join' | 'resume', code?, name?, startedAt }
  joinForm: { code: '', name: prefs.name, errors: {}, started: false },
  endedInfo: null, // { reason, name, code }
  hostBanner: null, // { prev, reason }: G4 "You're the host now"
  // Decision 4: when someone else presses Play again, the room goes back to
  // the lobby, but this player keeps reading the game-over summary (F4, from
  // view.lastGame) until they press Play again or Leave themselves.
  holdSummary: false,
  net: null,
  listeners: new Set(), // open sheets that redraw when the view changes
  t,

  get session() {
    return prefs.session;
  },
  get me() {
    return this.view?.you || prefs.session?.playerId || null;
  },
  serverNow() {
    return Date.now() + this.clockOffset;
  },

  request(event, payload) {
    return this.net.request(event, payload);
  },

  go(route) {
    this.route = route;
    render();
  },

  update() {
    render();
  },

  // Rebuild the current screen from scratch (e.g. to show a server's refusal
  // in a form that was already on screen).
  remount() {
    screenKey = null;
    render();
  },

  // ---------- entering and leaving rooms ----------

  createRoom(name) {
    prefs.name = name;
    this.start({ task: 'create', name });
  },

  joinRoom(code, name) {
    prefs.name = name;
    this.start({ task: 'join', code, name });
  },

  rejoin() {
    const s = prefs.session;
    if (s) this.start({ task: 'resume', code: s.code });
  },

  // Run a task now if we're connected; otherwise show the waking screen (A6)
  // after a short delay and run it as soon as the socket connects.
  start(pending) {
    this.pending = { ...pending, startedAt: Date.now() };
    if (this.net.connected) return runPending();
    setTimeout(() => {
      if (this.pending && !this.net.connected) this.go('waking');
    }, WAKING_DELAY_MS);
    render();
  },

  cancelPending() {
    this.pending = null;
    this.go('home');
  },

  retryWake() {
    if (this.pending) this.pending.startedAt = Date.now();
    this.net.retry();
    startWaking();
    render();
  },

  async leaveRoom() {
    await this.request(C2S.ROOM_LEAVE);
    this.forgetRoom();
    this.go('home');
  },

  // Leave mid-game: the seat stays held, so keep the session for "Back to room?".
  async stepAway() {
    await this.request(C2S.ROOM_LEAVE);
    const s = prefs.session;
    if (s) prefs.session = { ...s, active: false };
    this.view = null;
    this.go('home');
  },

  forgetRoom() {
    prefs.session = null;
    this.view = null;
    this.hostBanner = null;
    this.holdSummary = false;
  },

  // Sheets that show live data (History) subscribe while they're open.
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },
};

// ---------- tasks ----------

async function runPending() {
  const p = app.pending;
  if (!p) return;
  let ack;
  if (p.task === 'create') ack = await app.request(C2S.ROOM_CREATE, { name: p.name, token: prefs.token || undefined });
  else if (p.task === 'join') ack = await app.request(C2S.ROOM_JOIN, { code: p.code, name: p.name, token: prefs.token || undefined });
  else ack = await app.request(C2S.SESSION_RESUME, { code: p.code, token: prefs.token });
  if (app.pending !== p) return; // cancelled meanwhile
  app.pending = null;

  if (ack.ok) {
    if (ack.token) prefs.token = ack.token;
    prefs.session = { code: ack.code, playerId: ack.playerId, active: true };
    app.joinForm = { code: '', name: prefs.name, errors: {}, started: false };
    app.go('room');
    return;
  }

  // Failures: send the player somewhere that explains what happened.
  if (p.task === 'resume') {
    const reason = ack.code === 'code.notFound' ? 'gone' : 'seatGone';
    app.forgetRoom();
    app.endedInfo = { reason, code: p.code };
    app.go('ended');
  } else if (p.task === 'join') {
    app.joinForm = { ...app.joinForm, code: p.code, name: p.name, errors: joinErrors(ack), started: ack.code === 'code.started' };
    app.route = 'join';
    app.remount();
  } else {
    app.go('home');
    toast(t(ack.code, ack.params), { kind: 'err' });
  }
}

// Map a join failure onto the field it belongs to (A4: same slot, different message).
function joinErrors(ack) {
  const msg = t(ack.code, ack.params);
  if (ack.code.startsWith('name.')) return { name: msg };
  if (ack.code.startsWith('code.')) return { code: msg };
  return { form: msg };
}

// ---------- server events ----------

function onStatus(status) {
  const was = app.conn;
  app.conn = status;
  if (status === 'online') {
    app.everOnline = true;
    app.awake = true;
    if (app.pending) runPending();
    else if (app.route === 'room' && prefs.session?.active && was !== 'online') {
      // Back after a drop: reclaim the seat silently (G1 → board).
      app.request(C2S.SESSION_RESUME, { code: prefs.session.code, token: prefs.token }).then((ack) => {
        if (!ack.ok) {
          app.forgetRoom();
          app.endedInfo = { reason: ack.code === 'code.notFound' ? 'gone' : 'seatGone', code: prefs.session?.code };
          app.go('ended');
        }
      });
    }
  }
  render();
}

function onHello(hello) {
  app.hello = hello;
  app.clockOffset = hello.serverNow - Date.now();
}

function onState(view) {
  const prev = app.view;
  app.view = view;
  // G4: the crown just came to me (not because I created the room).
  if (prev && prev.hostId !== view.hostId && view.hostId === view.you && view.phase === 'lobby') {
    const prevHost = prev.players.find((p) => p.id === prev.hostId);
    app.hostBanner = { prev: prevHost ? prevHost.name : '', reason: app.lastHostReason || 'left' };
  }
  if (view.hostId !== view.you) app.hostBanner = null;
  if (view.phase === 'game_over') app.holdSummary = true;
  else if (view.phase !== 'lobby') app.holdSummary = false; // a new game started
  document.title = GAME_TITLE; // never encodes anything about the game
  if (app.route === 'room') render();
}

function onNotice({ key, params }) {
  const inGame = app.view && app.view.phase !== 'lobby';
  switch (key) {
    case 'notice.hostChanged':
      app.lastHostReason = params.reason;
      if (params.name !== myName()) toast(t('notice.hostChanged', params), { ic: 'crown' });
      break;
    case 'notice.left':
      toast(t('notice.left', params), { ic: 'leave' });
      break;
    case 'notice.kicked':
      if (params.name !== myName()) toast(t('notice.kicked', params), { ic: 'kick' });
      break;
    case 'notice.away':
      if (inGame) toast(t('notice.away', params), { kind: 'warn', ic: 'wifioff', persist: true });
      break;
    case 'notice.back':
      if (inGame) toast(t('notice.back', params), { kind: 'ok', ic: 'check' });
      break;
    default:
      break;
  }
}

function onClosed({ reason, name }) {
  const code = prefs.session?.code;
  app.forgetRoom();
  app.endedInfo = { reason, name, code };
  closeOverlay();
  clearToasts();
  app.go('ended');
}

function myName() {
  const v = app.view;
  return v?.players.find((p) => p.id === v.you)?.name;
}

// ---------- waking ----------

let stopWaking = null;
function startWaking() {
  stopWaking?.();
  stopWaking = wakeServer({
    onReached: () => {
      app.reached = true;
      render();
    },
    onAwake: () => {
      app.awake = true;
      render();
    },
  });
}

// ---------- rendering ----------

let screenKey = null;
let screen = null;
const screenHost = h('div', { class: 'screen' });

function currentKey() {
  if (app.route !== 'room') return app.route;
  const v = app.view;
  if (!v) return 'waking';
  if (v.phase === 'lobby' && app.holdSummary && v.lastGame) return 'gameover';
  return PHASE_SCREENS[v.phase] || 'board';
}

let booted = false; // nothing renders until the strings have loaded

function render() {
  if (!booted) return;
  const key = currentKey();
  if (key !== screenKey) {
    screen?.destroy?.();
    closeOverlay();
    screenKey = key;
    screen = SCREENS[key].mount(app);
    screenHost.replaceChildren(screen.el);
    root.querySelector('.content')?.scrollTo?.(0, 0);
  } else {
    screen.update?.(app);
  }
  connBanner.update(app);
  trackDock();
  for (const fn of app.listeners) fn(app);
}

// Keep --dock-h (toasts and Peek sit just above the dock) in step with the dock.
const dockObserver = new ResizeObserver(() => {
  const dock = root.querySelector('.screen .dock');
  root.style.setProperty('--dock-h', `${dock ? dock.offsetHeight + 8 : 24}px`);
});
let observedDock = null;
function trackDock() {
  const dock = root.querySelector('.screen .dock');
  if (dock === observedDock) return;
  if (observedDock) dockObserver.unobserve(observedDock);
  observedDock = dock;
  if (dock) dockObserver.observe(dock);
  else root.style.setProperty('--dock-h', '24px');
}

// Text size (100/115/130%) and Reduce motion, from the Menu or Home settings.
export function applyDisplayPrefs() {
  root.style.setProperty('--ts', String(prefs.textScale));
  const media = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.toggle('reduce-motion', prefs.reduceMotion || media);
}
app.applyDisplayPrefs = applyDisplayPrefs;

// The dock rides above the on-screen keyboard (HANDOFF §1).
function trackViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const set = () => root.style.setProperty('--vvh', `${vv.height}px`);
  vv.addEventListener('resize', set);
  set();
}

let connBanner;

async function boot() {
  applyDisplayPrefs();
  trackViewport();
  root.replaceChildren(screenHost);
  mountToasts(root);
  const started = Date.now();

  // Start waking the server before anything else (A6: the page itself is static
  // and always loads instantly; only the game server sleeps).
  startWaking();

  try {
    await loadLocale('en');
  } catch {
    root.replaceChildren(h('p', { class: 't-body center boot-error' }, 'Could not load the app. Check your connection and reload.'));
    return;
  }
  document.documentElement.lang = 'en';
  connBanner = connectionBanner(root);
  booted = true;
  render();
  // The board's ring and quest track have three sizes (S1, D1, S2). Rebuild
  // only when the size class changes: phones fire resize all the time
  // (address bar, keyboard), and a rebuild would interrupt a hold.
  let sizeClass = `${ringSize(root)}:${isShort()}`;
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const next = `${ringSize(root)}:${isShort()}`;
      if (next !== sizeClass && app.route === 'room') {
        sizeClass = next;
        app.remount();
      }
    }, 150);
  });

  app.net = createNet({ onStatus, onHello, onState, onNotice, onClosed });

  // A share link (?room=KQVX) fills in the join screen.
  const linkCode = new URLSearchParams(location.search).get('room');
  if (linkCode) {
    app.joinForm.code = linkCode.toUpperCase();
    history.replaceState(null, '', location.pathname);
  }

  setTimeout(() => {
    const s = prefs.session;
    // Mobile browsers reload sleeping tabs all the time: if we were in a room,
    // go straight back in.
    if (s?.active && (!linkCode || linkCode.toUpperCase() === s.code)) app.rejoin();
    else app.go(linkCode ? 'join' : 'home');
  }, Math.max(0, SPLASH_MIN_MS - (Date.now() - started)));
}

boot();
