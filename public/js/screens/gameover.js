// F4 · Game over: who won and how, everyone's role, all votes, Play again / Leave.
//
// It renders from the live game (phase game_over) or, if someone else already
// pressed Play again, from view.lastGame, so this player can finish reading
// (decision 4). Roles are public at this point; quest cards stay anonymous.

import { C2S } from '../../shared/protocol.js';
import { h, icon, replace } from '../dom.js';
import { t } from '../i18n.js';
import { toast } from '../components/toast.js';
import { chip, seg, topbar } from '../components/ui.js';
import { questTrack } from '../components/board.js';
import { historyGrid, historyLegend } from '../components/history.js';
import { ROLE_TEAM } from '../components/roleCard.js';

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

  function rolesList(s) {
    const me = s.seats.indexOf(v().you);
    const order = s.seats.map((_, k) => s.seats[(Math.max(0, me) + k) % s.seats.length]);
    const assassinated = s.winReason === 'assassinHit' || s.winReason === 'assassinMiss';
    return h(
      'div',
      { class: 'plist' },
      order.map((id) => {
        const role = s.roles[id];
        const team = ROLE_TEAM[role];
        const you = id === v().you;
        const named = assassinated && id === s.guess;
        let noteKey = null;
        if (assassinated && role === 'merlin') noteKey = 'over.noteMerlin';
        if (named && role !== 'merlin') noteKey = 'over.noteNamed';
        return h(
          'div',
          { class: ['prow', named && 'prow-named', you && 'prow-you'] },
          h('span', { class: [`frame-${team}`, 'frame-36'] }, icon(role)),
          h(
            'span',
            { class: 'prow-name' },
            h('span', { text: you ? t('over.you', { name: s.names[id] }) : s.names[id] }),
            h('span', { class: 'prow-meta' }, t(`role.${role}.name`), noteKey ? t(noteKey) : ''),
          ),
          h('span', { class: 'chip-end' }, chip(t(`team.${team}`), { kind: team, ic: team })),
        );
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

  const el = h(
    'div',
    { class: 'screen-body' },
    topbar(null, h('span', { class: 'room-tag' }, t('over.tag', { code: v().code }))),
    h('div', { class: 'content gameover' }, banner, tabs, body),
    h(
      'div',
      { class: 'dock dock-row' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-ring over-leave', on: { click: () => app.leaveRoom() } }, icon('leave'), t('over.leave')),
      h('button', { type: 'button', class: 'btn btn-primary over-again', on: { click: playAgain } }, icon('refresh'), t('over.again')),
    ),
  );
  paint();
  return { el, update: paint };
}
