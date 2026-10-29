// The board's building blocks (D1, D17, S1–S3): quest track, reject counter,
// the seat ring, the game top bar, and the "someone is offline" status bits.
//
// Board markup carries no secret data: everything here comes from the public
// parts of the view (seats, names, leader, Lady holder, live picks, results).

import { h, icon, avatar } from '../dom.js';
import { t, list } from '../i18n.js';
import { iconButton, roomTag, topbar, chip } from './ui.js';
import { calm } from '../fx.js';
import { sound } from '../sound.js';

// ---------- sizes ----------

// Three ring geometries from the design: S1 (360×740 and other short
// screens), D1 (390×844), S2 (430×932).
const RINGS = {
  sm: { w: 320, h: 254, cx: 160, cy: 124, rx: 124, ry: 98, seat: 68, av: null, table: 124 },
  md: { w: 340, h: 300, cx: 170, cy: 146, rx: 132, ry: 120, seat: 76, av: 48, table: 160 },
  lg: { w: 390, h: 360, cx: 195, cy: 176, rx: 152, ry: 140, seat: 84, av: 48, table: 184 },
  xl: { w: 460, h: 420, cx: 230, cy: 210, rx: 178, ry: 164, seat: 96, av: 56, table: 220 }, // S3 tablet
};

// "Short screens < 780px tall: .qtrack.compact, Peek joins primary row" (HANDOFF §2).
export function isShort() {
  return window.innerHeight < 780;
}

// S3: tablets (≥ 768 wide) get the two-column board with history always open.
export function isTablet() {
  return window.innerWidth >= 768 && window.innerHeight >= 700;
}

export function ringSize(root) {
  const width = root.clientWidth || window.innerWidth;
  if (isShort() || width < 380) return 'sm';
  if (width >= 430 && window.innerHeight >= 900) return 'lg';
  return 'md';
}

// ---------- quest track ----------

export function questTrack(game, { compact = isShort(), stamp = -1, mini = false, phase } = {}) {
  const wins = game.quests.filter((q) => q.result === 'success').length;
  const fails = game.quests.filter((q) => q.result === 'fail').length;
  const decided = wins >= 3 || fails >= 3;
  return h(
    'div',
    { class: ['qtrack', compact && 'compact', mini && 'qtrack-mini'], role: 'list', 'aria-label': t('board.quests') },
    game.quests.map((q, i) => {
      const current = !q.result && !decided && i === game.questIndex && phase !== 'game_over';
      const unneeded = !q.result && decided;
      const label = q.result
        ? t(q.result === 'success' ? 'board.qSuccess' : 'board.qFail', { q: i + 1, fails: q.fails })
        : unneeded
          ? t('board.qUnneeded', { q: i + 1 })
          : t(q.failsNeeded === 2 ? 'board.qTwoFails' : 'board.qPlain', { q: i + 1, n: q.size, current: current ? 'yes' : 'no' });
      return h(
        'div',
        {
          class: ['qnode', q.result === 'success' && 'is-success', q.result === 'fail' && 'is-fail', current && 'is-current', unneeded && 'is-unneeded', stamp === i && 'anim-stamp'],
          role: 'listitem',
          'aria-label': label,
        },
        h('div', { class: 'qnode-disc' }, q.result ? icon(q.result === 'success' ? 'success' : 'fail', mini ? 'ic-20' : compact ? null : 'ic-28') : String(i + 1)),
        mini ? null : h('span', { class: 'qnode-size' }, unneeded ? '—' : String(q.size)),
        !mini && q.failsNeeded === 2 && !q.result && !unneeded ? h('span', { class: 'qnode-tag' }, t('board.twoFailsTag')) : null,
      );
    }),
  );
}

// ---------- reject counter ----------

export function rejectCounter(rejects, { stampLast = false, short = false } = {}) {
  const lvl = Math.min(5, rejects);
  const label = t(short ? 'board.rejectsShort' : 'board.rejects', { n: rejects });
  return h(
    'div',
    { class: ['rejects', `lvl-${lvl}`], role: 'img', 'aria-label': t('board.rejectsAria', { n: rejects }) },
    h('span', { class: 'rejects-label' }, label, rejects === 4 ? h('span', { class: 'rejects-warn' }, ' · ', t('board.nextRejectLoses')) : null),
    h(
      'span',
      { class: 'pips', 'aria-hidden': 'true' },
      [1, 2, 3, 4, 5].map((i) => h('span', { class: ['pip', i <= rejects && 'on', i <= rejects && `l${i}`, stampLast && i === rejects && 'anim-stamp stamp-late'] }, h('span', {}, String(i)))),
    ),
  );
}

// The panel with both (D1, D4, D17).
export function trackPanel(game, opts = {}) {
  return h(
    'div',
    { class: ['panel', 'track-panel', isShort() && 'track-panel-sm'] },
    questTrack(game, opts),
    isShort() ? null : h('hr', { class: 'rule rule-flat' }),
    rejectCounter(game.rejects, { short: isShort() }),
  );
}

// ---------- the seat ring ----------

// What the last ring showed, so the next one can animate the changes: the
// leader token gliding on to the next seat, the Lady crossing the table to
// her new holder, a newly picked knight's ring rippling out. All public.
let lastRing = null; // { code, leader, lady, team }

// Seats go clockwise starting from you at the bottom (the D1 maths), so the
// leader token visibly moves to the next seat after each proposal.
export function seatRing(app, { team = [], center, size = ringSize(app.root) }) {
  const v = app.view;
  const g = v.game;
  const geo = RINGS[size];
  const me = g.seats.indexOf(v.you);
  const order = g.seats.map((_, k) => g.seats[(Math.max(0, me) + k) % g.seats.length]);
  const n = order.length;
  const conn = Object.fromEntries(v.players.map((p) => [p.id, p.connected]));
  const botIds = new Set(v.players.filter((p) => p.bot).map((p) => p.id));
  const ladyHolder = g.lady?.holder;
  const leader = g.proposal?.leader || (v.phase === 'propose' || v.phase === 'vote' ? g.leader : null);

  // A new game (Play again keeps the room code) starts from a clean slate.
  const newGame = g.questIndex === 0 && g.proposals.length === 0 && lastRing?.leader !== leader;
  const prev = lastRing?.code === v.code && !newGame ? lastRing : null;
  lastRing = { code: v.code, leader, lady: ladyHolder, team: team.slice() };
  const moving = prev && !calm(app);
  const angle = (id) => Math.PI / 2 + (order.indexOf(id) * 2 * Math.PI) / n;
  // A seat's offset from another, in px (seats sit on the ellipse, so the
  // badges on their avatars are offset by the same amount).
  const offset = (a, b) => [geo.rx * (Math.cos(a) - Math.cos(b)), geo.ry * (Math.sin(a) - Math.sin(b))];

  let newPick = false;
  const ring = h('div', { class: ['ring', `ring-${size}`], role: 'list', 'aria-label': t('board.seats') });
  ring.append(h('div', { class: 'ring-table', 'aria-hidden': 'true' }, center));
  order.forEach((id, k) => {
    const a = Math.PI / 2 + (k * 2 * Math.PI) / n;
    const you = id === v.you;
    const off = conn[id] === false;
    const isLead = id === leader;
    const lady = id === ladyHolder;
    const onTeam = team.includes(id);
    const name = g.names[id];
    const bot = botIds.has(id);
    const tags = [you && t('board.tagYou'), bot && t('board.tagBot'), isLead && t('board.tagLeader'), lady && t('board.tagLady'), off && t('board.tagOffline'), onTeam && t('board.tagTeam')].filter(Boolean);
    const picked = moving && onTeam && prev.leader === leader && !prev.team.includes(id);
    const landing = moving && lady && prev.lady && prev.lady !== id;
    const seat = h(
      'div',
      { class: ['seat', onTeam && 'is-team', off && 'is-off', picked && 'is-picked-now', landing && 'is-lady-landing'], role: 'listitem', 'aria-label': [name, ...tags].join(t('common.sep')) },
      avatar(name, {
        size: geo.av,
        you,
        off,
        extra: [],
      }),
      h('span', { class: 'seat-name', text: off ? t('board.away', { name }) : name }),
    );
    const av = seat.firstChild;
    if (isLead) {
      const badge = h('span', { class: 'av-badge lead' }, icon('standard'));
      av.append(badge);
      // Glide clockwise round the ring from the last leader's seat.
      if (moving && prev.leader && prev.leader !== id && order.includes(prev.leader)) {
        const from = angle(prev.leader);
        let to = a;
        while (to <= from) to += 2 * Math.PI;
        const steps = 12;
        const frames = [];
        for (let s = 0; s <= steps; s++) {
          const [dx, dy] = offset(from + ((to - from) * s) / steps, a);
          const lift = 1 + 0.4 * Math.sin((Math.PI * s) / steps);
          frames.push({ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${lift.toFixed(2)})` });
        }
        flyBadge(seat, badge, frames, 750);
        later(250, 'glide');
      }
    }
    if (lady) {
      const badge = h('span', { class: 'av-badge lady' }, icon('lady'));
      av.append(badge);
      // Straight across the table to her new holder, then a ripple.
      if (landing && order.includes(prev.lady)) {
        const [dx, dy] = offset(angle(prev.lady), a);
        flyBadge(seat, badge, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: `translate(${dx / 2}px, ${dy / 2}px) scale(1.4)` }, { transform: 'none' }], 900);
        seat.style.setProperty('--land-at', '1050ms');
        later(1050, 'drop');
      }
    }
    if (off) av.append(h('span', { class: 'av-badge off' }, icon('wifioff')));
    if (bot) av.append(botBadge());
    seat.style.left = `${Math.round(geo.cx + geo.rx * Math.cos(a))}px`;
    seat.style.top = `${Math.round(geo.cy + geo.ry * Math.sin(a))}px`;
    ring.append(seat);
    if (picked) newPick = true;
  });
  if (newPick) sound('tick');
  return ring;
}

// A sound timed with the tokens' flight.
function later(ms, name) {
  setTimeout(() => sound(name), ms);
}

// The token waits a moment (the screen is still rising in), then flies, above
// the other seats.
function flyBadge(seat, badge, frames, ms) {
  seat.style.zIndex = '2';
  badge.classList.add('is-flying');
  const anim = badge.animate(frames, { duration: ms, delay: 250, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'backwards' });
  anim.onfinish = () => {
    seat.style.zIndex = '';
    badge.classList.remove('is-flying');
  };
}

// A bot's mark: a small robot at the top right of its avatar. Decorative:
// the row or seat's own label says "bot".
export function botBadge() {
  return h('span', { class: 'av-badge bot', 'aria-hidden': 'true' }, icon('bot'));
}

// ---------- top bar and status helpers ----------

// Menu · ROOM KQVX · History (or Skip during a reveal).
export function gameTopbar(app, { onMenu, onHistory, right } = {}) {
  return topbar(
    iconButton({ ic: 'menu', label: t('menu.openFull'), onClick: onMenu }),
    roomTag(app.view.code),
    right || iconButton({ ic: 'history', label: t('board.history'), onClick: onHistory }),
  );
}

// Who is offline right now, and who of them the table is waiting on (D17).
export function awayInfo(view) {
  const g = view.game;
  const off = view.players.filter((p) => !p.connected && g.seats.includes(p.id)).map((p) => p.id);
  return { off, needed: off.filter((id) => g.waitingOn.includes(id)), names: off.map((id) => g.names[id]) };
}

// The chip and wait line the status bar shows while someone is offline.
// Once the table has waited `hostEndAfterMs` (2 minutes) on a player it
// needs, the host also gets "End game for everyone" right there (decision 3).
export function awayStatus(view, app) {
  const info = awayInfo(view);
  if (!info.off.length) return null;
  const g = view.game;
  const chipEl = chip(info.off.length === 1 ? t('board.offlineChip', { name: info.names[0] }) : t('board.offlineChipMany', { n: info.off.length }), { kind: 'warn', ic: 'wifioff' });
  chipEl.classList.add('chip-sm');
  let wait = info.needed.length
    ? t('board.waitingForAway', { names: list(info.needed.map((id) => g.names[id])), n: info.needed.length })
    : t('board.playContinues', { names: list(info.names), n: info.off.length });
  if (app && endOfferDue(view, app) <= 0) {
    wait = [
      h('span', {}, wait),
      h('button', { type: 'button', class: 'link-btn status-end', key: 'status-end', on: { click: () => app.confirmEndGame() } }, icon('cross', 'ic-16'), t('board.hostMayEnd')),
    ];
  }
  return { chip: chipEl, wait, needed: info.needed.length > 0 };
}

// Milliseconds until the host may end the game from the status bar (<= 0:
// now), or Infinity when it doesn't apply (not the host, nobody needed away).
export function endOfferDue(view, app) {
  if (!view.game || view.hostId !== view.you || !app.hello) return Infinity;
  const info = awayInfo(view);
  const since = view.players.filter((p) => info.needed.includes(p.id) && p.disconnectedAt != null).map((p) => p.disconnectedAt);
  if (!since.length) return Infinity;
  return Math.min(...since) + app.hello.hostEndAfterMs - app.serverNow();
}

// Names of the players in `ids`, with "you" for the viewer (status lines).
export function namesWithYou(view, ids) {
  return list(ids.map((id) => (id === view.you ? t('board.you') : view.game.names[id])));
}

