// D5 · Vote: tap Approve or Reject (changeable), then "Lock in …".
// D6 · Locked: "Your vote is locked" (never which way), and who we wait on.
//
// The choice lives only in this screen's memory until it is locked; the
// server never echoes it back, and once locked it isn't shown again, so a
// neighbour can't glance at it.

import { C2S } from '../../shared/protocol.js';
import { h, icon, avatar, replace } from '../dom.js';
import { t } from '../i18n.js';
import { toast } from '../components/toast.js';
import { peekButton } from '../components/peek.js';
import { button, note, panel, progress, statusBar, waitGrid, chip } from '../components/ui.js';
import { gameTopbar, awayStatus, namesWithYou } from '../components/board.js';
import { openMenu, openHistory } from './sheets.js';

export function mount(app) {
  let choice = null; // 'approve' | 'reject' before locking
  let locking = false;
  let peek = null;
  let dockKey = null;
  let alive = true; // the last vote moves the phase on before our ack returns

  const status = h('div', { class: 'status-slot' });
  const content = h('div', { class: 'content vote-content' });
  const dock = h('div', { class: 'dock dock-vote' });

  const v = () => app.view;
  const g = () => app.view.game;
  const p = () => app.view.game.proposal;
  const q = () => g().questIndex + 1;
  const locked = () => p().voted.includes(v().you);

  async function lock() {
    if (!choice || locking) return;
    locking = true;
    const ack = await app.request(C2S.VOTE_CAST, { approve: choice === 'approve' });
    locking = false;
    if (!ack.ok && ack.code !== 'err.locked') toast(t(ack.code, ack.params), { kind: 'err' });
    choice = null; // forget it: the lock is final and the choice isn't shown again
    if (alive) paint();
  }

  function paintStatus() {
    const game = g();
    const total = game.seats.length;
    const inCount = p().voted.length;
    const away = awayStatus(v(), app);
    const right = away ? away.chip : h('span', { class: 't-label faint tnum' }, t('vote.inCount', { n: inCount, total }));
    const leaderName = game.names[p().leader];
    if (!locked()) {
      replace(
        status,
        statusBar({
          phase: t('vote.phase', { q: q() }),
          phaseIcon: 'check',
          tone: away ? 'alert' : 'you',
          right,
          main: p().leader === v().you ? t('vote.askOwn') : t('vote.ask', { name: leaderName }),
          wait: away ? away.wait : t('vote.secret'),
        }),
      );
      return;
    }
    const waiting = game.waitingOn;
    replace(
      status,
      statusBar({
        phase: t('vote.phase', { q: q() }),
        phaseIcon: 'check',
        tone: away?.needed ? 'alert' : null,
        right,
        main: t('vote.waitingOn', { n: waiting.length }),
        wait: away?.needed
          ? away.wait
          : [h('span', { class: 'stack' }, waiting.slice(0, 4).map((id) => avatar(game.names[id], { size: 32 }))), namesWithYou(v(), waiting)],
      }),
    );
  }

  function teamPanel() {
    const game = g();
    const leaderName = game.names[p().leader];
    return panel(
      [
        h('div', { class: 'row between' }, h('p', { class: 'eyebrow eyebrow-12' }, t('vote.teamEyebrow', { q: q() })), chip(t('vote.ledBy', { name: leaderName }), { ic: 'standard' })),
        h(
          'div',
          { class: 'row wrap vote-team' },
          p().team.map((id) => h('div', { class: 'row vote-member' }, avatar(game.names[id], { size: 48, you: id === v().you }), h('span', { class: 't-title', text: game.names[id] }))),
        ),
      ],
      { gold: true, extra: ['col'] },
    );
  }

  function explainPanel() {
    const game = g();
    const next = game.seats[(game.seats.indexOf(p().leader) + 1) % game.seats.length];
    const rejectText = game.rejects >= 4 ? t('vote.rejectExplainLast') : t('vote.rejectExplain', { name: game.names[next], n: game.rejects });
    return panel(
      [
        h('div', { class: 'row row-top' }, icon('check', 'ic-20', 'approve-ink'), h('p', { class: 't-label muted' }, h('b', { class: 'text-1' }, t('vote.approve')), ': ', t('vote.approveExplain', { q: q() }))),
        h('div', { class: 'row row-top' }, icon('cross', 'ic-20', 'reject-ink'), h('p', { class: ['t-label', game.rejects >= 4 ? 'evil' : 'muted'] }, h('b', { class: 'text-1' }, t('vote.reject')), ': ', rejectText)),
      ],
      { extra: ['col', 'vote-explain'] },
    );
  }

  function lockedContent() {
    const game = g();
    return [
      panel(
        [
          h('span', { class: 'modal-icon modal-icon-52' }, icon('lock', 'ic-28')),
          h('div', { class: 'grow' }, h('p', { class: 't-title' }, t('vote.locked')), h('p', { class: 't-label muted' }, t('vote.lockedHint'))),
        ],
        { gold: true, extra: ['row', 'locked-panel'] },
      ),
      progress(p().voted.length / game.seats.length),
      waitGrid(
        game.seats.map((id) => ({
          name: game.names[id],
          you: id === v().you,
          off: !v().players.find((x) => x.id === id)?.connected,
          done: p().voted.includes(id),
          doneIcon: 'lock',
          doneText: t('vote.in'),
          pendingText: t('vote.voting'),
        })),
      ),
      h('p', { class: 't-label faint center' }, t('vote.final')),
    ];
  }

  function voteButton(kind) {
    const picked = choice === kind;
    const dim = choice && !picked;
    return h(
      'button',
      {
        type: 'button',
        class: ['vote', `vote-${kind}`, picked && 'is-picked', dim && 'is-dim'],
        role: 'radio',
        key: `vote-${kind}`,
        'aria-checked': String(picked),
        on: { click: () => { choice = kind; paintDock(true); } },
      },
      h('span', { class: 'ic-ring' }, icon(kind === 'approve' ? 'check' : 'cross')),
      t(`vote.${kind}`),
      picked ? h('span', { class: 'vote-sub' }, t('vote.selected')) : null,
    );
  }

  function paintDock(force = false) {
    const key = locked() ? 'locked' : `open:${choice}`;
    if (key === dockKey && !force) return;
    dockKey = key;
    if (locked()) {
      peek?.destroy();
      peek = peekButton(app);
      replace(dock, peek.el);
      return;
    }
    replace(
      dock,
      h('div', { class: 'vote-pair', role: 'radiogroup', 'aria-label': t('vote.yourVote') }, voteButton('approve'), voteButton('reject')),
      choice
        ? button({ label: t('vote.lockIn', { choice: t(`vote.${choice}`) }), ic: 'lock', key: 'lock', extra: ['anim-rise'], onClick: lock })
        : note(t('vote.tapHint'), { extra: ['note-box'] }),
    );
  }

  function paint() {
    paintStatus();
    replace(content, locked() ? lockedContent() : [teamPanel(), explainPanel()]);
    paintDock();
  }

  const el = h(
    'div',
    { class: 'screen-body' },
    gameTopbar(app, { onMenu: () => openMenu(app), onHistory: () => openHistory(app) }),
    status,
    content,
    dock,
  );
  paint();
  return {
    el,
    update: paint,
    destroy: () => {
      alive = false;
      peek?.destroy();
    },
  };
}

