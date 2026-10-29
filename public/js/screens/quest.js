// D9 · On the quest, Good: Success, and Fail locked with its reason.
// D10 · On the quest, Evil: either card.
// D11 · Not on the team: "The team is on the quest", who has played.
//
// After playing, the screen says "Card played" and never which card.

import { C2S } from '../../shared/protocol.js';
import { h, icon, avatar, replace } from '../dom.js';
import { t, gap, list } from '../i18n.js';
import { toast } from '../components/toast.js';
import { peekButton } from '../components/peek.js';
import { button, note, panel, privateBand, statusBar, dots } from '../components/ui.js';
import { gameTopbar, awayStatus } from '../components/board.js';
import { openMenu, openHistory } from './sheets.js';

export function mount(app) {
  let card = null; // 'success' | 'fail' before playing
  let sending = false;
  let peek = null;
  let dockKey = null;
  let alive = true; // the last card moves the phase on before our ack returns

  const band = h('div', { class: 'status-slot' });
  const status = h('div', { class: 'status-slot' });
  const content = h('div', { class: 'content quest' });
  const dock = h('div', { class: 'dock' });

  const v = () => app.view;
  const g = () => app.view.game;
  const qp = () => app.view.game.questPlay;
  const q = () => g().questIndex + 1;
  const onTeam = () => qp().team.includes(v().you);
  const played = () => qp().played.includes(v().you);
  const choosing = () => onTeam() && !played();
  const isEvil = () => g().me.team === 'evil';

  // "You and Ilse" / "Tomas, Mei and you"
  function teamNames() {
    const names = qp().team.map((id, i) => (id === v().you ? t(i === 0 ? 'board.youCap' : 'board.you') : g().names[id]));
    return list(names);
  }

  async function play() {
    if (!card || sending) return;
    sending = true;
    const ack = await app.request(C2S.QUEST_PLAY, { card });
    sending = false;
    if (!ack.ok && ack.code !== 'err.locked') toast(t(ack.code, ack.params), { kind: 'err' });
    card = null; // never kept or shown again
    if (alive) paint();
  }

  function paintStatus() {
    const game = g();
    const size = qp().team.length;
    const away = awayStatus(v(), app);
    const right = away ? away.chip : h('span', { class: 't-label faint tnum' }, t('quest.played', { n: qp().played.length, size }));
    const waiting = game.waitingOn.map((id) => game.names[id]);
    let main;
    let wait;
    if (choosing()) {
      main = t('quest.choose');
      wait = t('quest.teamIs', { names: teamNames(), q: q() });
    } else if (onTeam()) {
      main = waiting.length === 1 ? t('quest.waitingFor', { name: waiting[0] }) : t('quest.waitingForN', { n: waiting.length });
      wait = t('quest.thenShuffled');
    } else {
      main = t('quest.teamAway');
      wait = [dots(), t('quest.waitingOn', { names: list(waiting) })];
    }
    replace(band, choosing() ? privateBand() : null);
    replace(
      status,
      statusBar({
        phase: t('quest.phase', { q: q() }),
        phaseIcon: 'arrow',
        tone: away?.needed ? 'alert' : choosing() ? 'you' : null,
        right,
        main,
        wait: away?.needed ? away.wait : wait,
      }),
    );
    status.classList.toggle('status-gap', choosing());
  }

  function paintContent() {
    const game = g();
    const quest = game.quests[game.questIndex];
    content.classList.toggle('quest-away', !onTeam());
    if (choosing()) {
      replace(
        content,
        isEvil()
          ? panel([icon('evil', 'evil'), h('p', { class: 't-label muted' }, h('b', { class: 'text-1' }, t('quest.evilMay')), gap(), t(quest.failsNeeded === 2 ? 'quest.evilHintTwo' : 'quest.evilHint', { q: q() }))], { extra: ['row', 'row-top', 'evil-panel'] })
          : h('p', { class: 't-label muted center pretty' }, t('quest.countOnly')),
      );
      return;
    }
    if (onTeam()) {
      replace(
        content,
        panel(
          [
            h('span', { class: 'modal-icon modal-icon-52' }, icon('lock', 'ic-28')),
            h('div', { class: 'grow' }, h('p', { class: 't-title' }, t('quest.cardPlayed')), h('p', { class: 't-label muted' }, t('quest.cardPlayedHint'))),
          ],
          { gold: true, extra: ['row', 'locked-panel', 'anim-rise'] },
        ),
      );
      return;
    }
    // D11: the quest emblem and the team's progress.
    const team = qp().team;
    replace(
      content,
      h(
        'div',
        { class: 'quest-emblem' },
        h('div', { class: 'quest-glow anim-breathe', 'aria-hidden': 'true' }),
        h('div', { class: 'quest-ring' }, h('span', { class: 'eyebrow eyebrow-12' }, t('quest.questWord')), h('span', { class: 'd-xl quest-number' }, String(q()))),
      ),
      h('p', { class: 't-body-l muted pretty narrow' }, t('quest.awayText', { n: team.length })),
      h(
        'div',
        { class: 'col full-width team-progress' },
        team.map((id) => {
          const done = qp().played.includes(id);
          return h(
            'div',
            { class: ['wcell', done ? 'is-done' : 'is-pending'] },
            avatar(game.names[id], { size: 32 }),
            h('span', { class: 'nm', text: game.names[id] }),
            h('span', { class: 'state' }, done ? [icon('check', 'ic-14'), t('quest.playedCell')] : dots(t('quest.choosing'))),
          );
        }),
      ),
    );
  }

  function cardButton(kind) {
    const picked = card === kind;
    if (kind === 'fail' && !isEvil()) {
      // Good can't play Fail: it stays visible, locked, with the reason (HANDOFF §3).
      return h(
        'button',
        { type: 'button', class: 'qcard is-locked', disabled: true, 'aria-describedby': 'fail-why', key: 'card-fail' },
        h('span', { class: 'qcard-lockbadge' }, icon('lock')),
        icon('fail'),
        t('card.fail'),
        h('span', { class: 'qcard-sub', id: 'fail-why' }, t('fail.locked')),
      );
    }
    return h(
      'button',
      {
        type: 'button',
        class: ['qcard', `qcard-${kind}`, picked && 'is-picked', card && !picked && 'is-dim'],
        role: 'radio',
        key: `card-${kind}`,
        'aria-checked': String(picked),
        on: { click: () => { card = kind; paintDock(true); } },
      },
      icon(kind === 'success' ? 'success' : 'fail'),
      t(kind === 'success' ? 'card.success' : 'card.fail'),
      h('span', { class: ['qcard-sub', kind === 'success' ? 'sub-good' : 'sub-evil'] }, t(kind === 'success' ? 'quest.help' : 'quest.sabotage')),
    );
  }

  function paintDock(force = false) {
    const key = choosing() ? `choose:${card}` : 'wait';
    if (key === dockKey && !force) return;
    dockKey = key;
    if (!choosing()) {
      peek?.destroy();
      peek = peekButton(app);
      replace(dock, peek.el);
      return;
    }
    replace(
      dock,
      h('div', { class: 'qcards', role: 'radiogroup', 'aria-label': t('quest.yourCard') }, cardButton('success'), cardButton('fail')),
      card
        ? button({ label: t(card === 'success' ? 'quest.playSuccess' : 'quest.playFail'), kind: card === 'fail' ? 'danger' : 'primary', ic: 'lock', key: 'play', extra: ['anim-rise'], onClick: play })
        : note(t('quest.tapHint'), { extra: ['note-box'] }),
    );
  }

  function paint() {
    paintStatus();
    paintContent();
    paintDock();
  }

  const el = h(
    'div',
    { class: 'screen-body' },
    gameTopbar(app, { onMenu: () => openMenu(app), onHistory: () => openHistory(app) }),
    band,
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
