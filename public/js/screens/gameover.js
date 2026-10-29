// F4 · Game over: who won and how, everyone's role, all votes, Play again / Leave.
//
// On arrival: after an assassination, the blade slashes across and the named
// player's card turns over (Merlin found, or missed); then gold sparks rise
// (Good) or crimson smoke rolls in (Evil), and everyone's role turns over,
// one seat at a time. Under 3 seconds, with Skip; played once per game.
//
// It renders from the live game (phase game_over) or, if someone else already
// pressed Play again, from view.lastGame, so this player can finish reading
// (decision 4). Roles are public at this point; quest cards stay anonymous.

import { C2S } from '../../shared/protocol.js';
import { h, icon, replace } from '../dom.js';
import { t } from '../i18n.js';
import { toast } from '../components/toast.js';
import { chip, seg, topbar, spacer } from '../components/ui.js';
import { questTrack } from '../components/board.js';
import { historyGrid, historyLegend } from '../components/history.js';
import { ROLE_TEAM } from '../components/roleCard.js';
import { calm, timeline, slash, burst, shake, riseSparks, smoke, cardBack } from '../fx.js';
import { sound } from '../sound.js';

const ROW_STEP_MS = 90;
const INTRO_MS = 1400; // the strike's card, before the ending itself

let celebrated = null; // the ending already played on this phone (a language switch doesn't replay it)

export function mount(app) {
  let tab = 'roles';
  const v = () => app.view;
  const live = () => v().phase === 'game_over';
  const sum = () => (live() ? v().game : v().lastGame);

  const body = h('div', { class: 'col gameover-body' });
  const tabs = h('div');

  function reasonText(s) {
    const merlin = s.seats.find((id) => s.roles[id] === 'merlin');
    const assassin = s.seats.find((id) => s.roles[id] === 'assassin');
    const params = { assassin: s.names[assassin], guess: s.names[s.guess], merlin: s.names[merlin] };
    return t(`over.reason.${s.winReason}`, params);
  }

  // Set for the first paint only when the ending plays: when the rows start turning over.
  let rowsAt = null;

  function rolesList(s) {
    const me = s.seats.indexOf(v().you);
    const order = s.seats.map((_, k) => s.seats[(Math.max(0, me) + k) % s.seats.length]);
    const assassinated = s.winReason === 'assassinHit' || s.winReason === 'assassinMiss';
    const bots = new Set(v().players.filter((p) => p.bot).map((p) => p.id));
    return h(
      'div',
      { class: 'plist' },
      order.map((id, i) => {
        const role = s.roles[id];
        const team = ROLE_TEAM[role];
        const you = id === v().you;
        const named = assassinated && id === s.guess;
        let noteKey = null;
        if (assassinated && role === 'merlin') noteKey = 'over.noteMerlin';
        if (named && role !== 'merlin') noteKey = 'over.noteNamed';
        const row = h(
          'div',
          { class: ['prow', named && 'prow-named', you && 'prow-you'] },
          h('span', { class: [`frame-${team}`, 'frame-36'] }, icon(role)),
          h(
            'span',
            { class: 'prow-name' },
            h('span', { text: you ? t('over.you', { name: s.names[id] }) : s.names[id] }),
            h('span', { class: 'prow-meta' }, t(`role.${role}.name`), bots.has(id) ? [t('common.sep'), t('lobby.bot')] : '', noteKey ? t(noteKey) : ''),
          ),
          h('span', { class: 'chip-end' }, chip(t(`team.${team}`), { kind: team, ic: team })),
        );
        if (rowsAt != null) {
          row.classList.add('anim-rise');
          row.style.animationDelay = `${rowsAt + i * ROW_STEP_MS}ms`;
          row.firstChild.classList.add('anim-flip');
          row.firstChild.style.animationDelay = `${rowsAt + i * ROW_STEP_MS + 60}ms`;
        }
        return row;
      }),
    );
  }

  function paint() {
    const s = sum();
    if (!s) return;
    replace(
      tabs,
      seg({
        role: 'tab',
        label: t('over.tabsLabel'),
        value: tab,
        options: [
          { value: 'roles', label: t('over.tabRoles') },
          { value: 'votes', label: t('over.tabVotes') },
        ],
        onChange: (val) => {
          tab = val;
          paint();
        },
      }),
    );
    replace(body, tab === 'roles' ? rolesList(s) : [historyGrid({ ...s, questIndex: undefined }, { you: v().you }), historyLegend()]);
  }

  async function playAgain() {
    if (live()) {
      const ack = await app.request(C2S.GAME_REMATCH);
      if (!ack.ok && ack.code !== 'err.phase') {
        toast(t(ack.code, ack.params), { kind: 'err' });
        return;
      }
    }
    app.holdSummary = false;
    app.update();
  }

  const s = sum();
  const good = s.winner === 'good';
  const banner = h(
    'div',
    { class: ['banner', good ? 'banner-good' : 'banner-evil', 'anim-stamp'], role: 'status' },
    h('span', { class: [good ? 'frame-good' : 'frame-evil', 'frame-56'] }, icon(good ? 'good' : 'evil', 'ic-32')),
    h('p', { class: 'd-l' }, t(good ? 'over.goodWins' : 'over.evilWins')),
    h('p', { class: 't-body muted pretty' }, reasonText(s)),
    questTrack({ ...s, questIndex: 5 }, { mini: true, compact: false, phase: 'game_over' }),
  );

  const right = h('div', { class: 'topbar-right' });
  const content = h('div', { class: 'content gameover' }, banner, tabs, body);
  const el = h(
    'div',
    { class: 'screen-body' },
    topbar(null, h('span', { class: 'room-tag' }, t('over.tag', { code: v().code })), right),
    content,
    h(
      'div',
      { class: 'dock dock-row' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-ring over-leave', on: { click: () => app.leaveRoom() } }, icon('leave'), t('over.leave')),
      h('button', { type: 'button', class: 'btn btn-primary over-again', on: { click: playAgain } }, icon('refresh'), t('over.again')),
    ),
  );
  // ---------- the ending, played once ----------

  const endKey = [v().code, s.winReason, s.guess, s.seats.map((id) => s.roles[id]).join()].join('|');
  const fresh = live() && celebrated !== endKey;
  const play = fresh && !calm(app);
  celebrated = endKey;
  const fx = timeline(app);
  let intro = null;

  function skip() {
    fx.stop();
    intro?.remove();
    intro = null;
    el.classList.remove('has-intro');
    for (const cls of ['anim-stamp', 'anim-rise', 'anim-flip']) content.querySelectorAll(`.${cls}`).forEach((x) => x.classList.remove(cls));
    replace(right, spacer());
  }

  if (play) {
    const struck = s.winReason === 'assassinHit' || s.winReason === 'assassinMiss';
    const at = struck ? INTRO_MS : 150;
    rowsAt = at + 200;
    banner.style.animationDelay = `${at}ms`;
    replace(right, h('button', { type: 'button', class: 'btn btn-ghost btn-md btn-skip', on: { click: skip } }, t('reveal.skip')));
    if (struck) {
      // The named player's card: face down, then turned over.
      const hit = s.winReason === 'assassinHit';
      const role = s.roles[s.guess];
      const card = h(
        'div',
        { class: 'si-card' },
        h(
          'div',
          { class: 'si-inner anim-si-flip' },
          h(
            'div',
            { class: ['si-front', hit ? 'is-hit' : 'is-miss'] },
            h('span', { class: [`frame-${ROLE_TEAM[role]}`, 'frame-76'] }, icon(role, 'ic-40')),
            h('p', { class: 'd-m', text: s.names[s.guess] }),
            h('p', { class: 't-label muted' }, t(`role.${role}.name`)),
          ),
          cardBack(),
        ),
      );
      // Decoration only: the banner says the same thing to screen readers.
      intro = h(
        'div',
        { class: 'strike-intro', 'aria-hidden': 'true', on: { click: skip } },
        card,
        h('p', { class: ['d-m', 'si-verdict', 'anim-si-verdict', hit ? 'evil' : 'gold-hi'] }, t(hit ? 'over.strikeHit' : 'over.strikeMiss')),
      );
      el.classList.add('has-intro');
      el.append(intro);
      fx.at(60, () => {
        slash(app);
        sound('slash');
      });
      fx.at(420, () => sound('flip'));
      fx.at(1040, () => {
        sound(hit ? 'merlinFound' : 'bladeMissed');
        burst(app, card, { kind: hit ? 'ember' : 'gold', count: 22, reach: 150 });
        shake(app, card, { px: hit ? 8 : 4 });
      });
      fx.at(INTRO_MS - 250, () => intro?.classList.add('is-leaving'));
      fx.at(INTRO_MS + 60, () => {
        intro?.remove();
        intro = null;
        el.classList.remove('has-intro');
      });
    }
    fx.at(at, () => {
      if (good) riseSparks(app);
      else smoke(app);
      sound(good ? 'goodWins' : 'evilWins');
    });
    fx.at(at + 220, () => burst(app, banner.firstChild, { kind: good ? 'gold' : 'ember', count: 18, reach: 120 }));
    fx.at(rowsAt + s.seats.length * ROW_STEP_MS + 500, () => replace(right, spacer()));
  }

  // Reduced motion: no ending to watch, but it still sounds once.
  if (fresh && !play) fx.at(150, () => sound(good ? 'goodWins' : 'evilWins'));

  paint();
  rowsAt = null; // later paints (tabs, updates) show the rows as they are
  return { el, update: paint, destroy: () => fx.stop() };
}
