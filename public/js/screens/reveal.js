// D7 · Votes revealed, approved. D8 · rejected (the new reject pip stamps in).
// Votes rise in seat order, 120 + n×90 ms, then the verdict stamps at ~750 ms.

import { h, icon, avatar } from '../dom.js';
import { t, list } from '../i18n.js';
import { panel, statusBar } from '../components/ui.js';
import { rejectCounter } from '../components/board.js';
import { revealTopbar, continueDock } from '../components/reveal.js';
import { historyLegend } from '../components/history.js';
import { openMenu, openHistory } from './sheets.js';

export function mount(app) {
  const v = app.view;
  const g = v.game;
  const p = g.proposals[g.proposals.length - 1]; // the proposal being revealed
  const q = p.quest + 1;
  const yes = g.seats.filter((id) => p.votes[id] === 'approve');
  const no = g.seats.filter((id) => p.votes[id] === 'reject');
  const leaderName = g.names[p.leader];
  const nextLeader = g.seats[(g.seats.indexOf(p.leader) + 1) % g.seats.length];
  const lost = !p.approved && g.rejects >= 5;
  const onTeam = p.team.includes(v.you);

  // Seat order, starting from you, like the ring.
  const me = g.seats.indexOf(v.you);
  const order = g.seats.map((_, k) => g.seats[(me + k) % g.seats.length]);

  const banner = h(
    'div',
    { class: ['banner', 'banner-row', p.approved ? 'banner-approve' : 'banner-reject', 'anim-stamp'] },
    h('span', { class: ['vm', p.approved ? 'vm-a' : 'vm-r', 'vm-44'] }, icon(p.approved ? 'check' : 'cross')),
    h(
      'div',
      { class: 'text-left' },
      h('p', { class: 'd-m lh-1' }, t(p.approved ? 'reveal.approved' : 'reveal.rejected')),
      h('p', { class: 't-label muted tnum' }, h('b', { class: 'approve-ink' }, t('reveal.approveN', { n: yes.length })), ' · ', h('b', { class: 'reject-ink' }, t('reveal.rejectN', { n: no.length }))),
    ),
  );
  banner.style.animationDelay = '750ms';

  const grid = h(
    'div',
    { class: 'vote-grid', role: 'list', 'aria-label': t('reveal.byPlayer') },
    order.map((id, k) => {
      const vote = p.votes[id];
      const team = p.team.includes(id);
      const cell = h(
        'div',
        {
          class: ['wcell', 'anim-rise', team && 'on-team-ring'],
          role: 'listitem',
          'aria-label': t(vote === 'approve' ? 'reveal.cellApprove' : 'reveal.cellReject', { name: g.names[id], team: team ? 'yes' : 'no' }),
        },
        avatar(g.names[id], { size: 32, you: id === v.you }),
        h('span', { class: 'nm', text: g.names[id] }),
        h('span', { class: ['vm', vote === 'approve' ? 'vm-a' : 'vm-r', 'ml-auto'] }, icon(vote === 'approve' ? 'check' : 'cross')),
      );
      cell.style.animationDelay = `${120 + k * 90}ms`;
      return cell;
    }),
  );

  const content = h(
    'div',
    { class: 'content reveal' },
    banner,
    grid,
    historyLegend({ leader: false }),
    p.approved
      ? h('p', { class: 't-label faint center' }, t('reveal.resets'))
      : panel([rejectCounter(g.rejects, { stampLast: true }), h('p', { class: ['t-label', lost ? 'evil b' : 'faint'] }, t(lost ? 'reveal.fiveRejects' : 'reveal.fiveWarning'))], { extra: ['col', 'reject-panel'] }),
  );

  let wait;
  if (p.approved) wait = t('reveal.goesOnQuest', { names: list(p.team.map((id) => (id === v.you ? t('board.you') : g.names[id]))), q });
  else if (lost) wait = t('reveal.evilWinsRejects');
  else wait = t('reveal.passesTo', { name: nextLeader === v.you ? t('board.youCap') : g.names[nextLeader] });

  const status = statusBar({
    phase: t('reveal.phase', { q }),
    phaseIcon: p.approved ? 'check' : 'cross',
    tone: lost ? 'tense' : null,
    main: t(p.approved ? 'reveal.mainApproved' : 'reveal.mainRejected', { name: leaderName, yes: yes.length, no: no.length }),
    wait,
  });

  const dock = h('div', { class: 'dock' });
  let label;
  let ic = 'arrow';
  let hint;
  if (lost) {
    label = t('reveal.seeEnding');
  } else if (p.approved) {
    label = onTeam ? t('reveal.goOnQuest') : t('reveal.continue');
    hint = onTeam ? t('reveal.onTeamSaved') : t('reveal.saved');
  } else {
    label = t('reveal.backToTable', { name: nextLeader === v.you ? t('board.youLeadShort') : t('reveal.leads', { name: g.names[nextLeader] }) });
    ic = 'standard';
  }
  const cont = continueDock(app, dock, { label, ic, hint });
  const top = revealTopbar(app, { container: content, totalMs: 1600, onMenu: () => openMenu(app), onHistory: () => openHistory(app) });

  const el = h('div', { class: 'screen-body' }, top.el, h('div', { class: 'status-slot' }, status), content, dock);
  return { el, update: () => cont.paint(), destroy: () => top.destroy() };
}

