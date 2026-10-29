// Assassination: Good has won three quests and the Assassin gets one guess.
//   F1 · The Assassin picks (Evil allies are locked and marked)
//   F2 · Serious confirm: hold to strike for 1.5 seconds, the game's only
//        hold-to-confirm (HANDOFF §5)
//   F3 · Everyone else: a tense wait; all of Evil is revealed so they can confer
//
// What is public here: who the Assassin is and who is Evil (Oberon included,
// decision 7). The server sends both to everyone in this phase only. Nobody's
// exact role and nothing about Merlin is on this screen.

import { C2S } from '../../shared/protocol.js';
import { h, icon, avatar, replace } from '../dom.js';
import { t } from '../i18n.js';
import { toast } from '../components/toast.js';
import { peekButton } from '../components/peek.js';
import { bindHoldToConfirm } from '../components/hold.js';
import { openModal } from '../components/overlay.js';
import { button, chip, note, statusBar } from '../components/ui.js';
import { gameTopbar, awayStatus } from '../components/board.js';
import { openMenu, openHistory } from './sheets.js';

const STRIKE_MS = 1500;

export function mount(app) {
  let pick = null;
  let peek = null;
  let dockKey = null;
  let alive = true;

  // F1/F3 tint the whole phone crimson (the design's background gradient).
  app.root.classList.add('phone-tense');

  const status = h('div', { class: 'status-slot' });
  const content = h('div', { class: 'content' });
  const dock = h('div', { class: 'dock' });

  const v = () => app.view;
  const g = () => app.view.game;
  const isAssassin = () => g().assassinId === v().you;
  const assassinName = () => g().names[g().assassinId];

  // ---------- F2 · hold to strike ----------

  function confirmStrike(id) {
    const name = g().names[id];
    let holder = null;
    // While held, the target's portrait beats like a heart (decoration; the
    // fill on the button is the timer).
    const target = h('div', { class: 'row strike-target', 'aria-hidden': 'true' }, avatar(name, { size: 56, extra: ['av-target'] }), icon('target', 'evil', 'ic-28'));
    openModal(app.root, {
      danger: true,
      top: h('span', { class: 'frame-evil frame-76' }, icon('assassin', 'ic-40')),
      title: t('assassin.confirmTitle', { name }),
      text: t('assassin.confirmText', { name }),
      extra: target,
      onClose: () => holder?.destroy(),
      actions: (close) => {
        const fill = h('span', { class: 'strike-fill', 'aria-hidden': 'true' });
        const btn = h(
          'button',
          { type: 'button', class: 'btn btn-danger btn-block btn-strike', 'aria-label': t('assassin.holdAria', { name }), 'aria-describedby': 'strike-why' },
          fill,
          icon('hold'),
          h('span', {}, t('assassin.hold')),
        );
        const why = note(t('assassin.holdNote'), { id: 'strike-why' });
        let sent = false;
        holder = bindHoldToConfirm(btn, {
          ms: STRIKE_MS,
          onStart: () => {
            btn.classList.add('is-holding');
            target.classList.add('is-beating');
            fill.style.animationDuration = `${STRIKE_MS}ms`;
          },
          onCancel: () => {
            btn.classList.remove('is-holding');
            target.classList.remove('is-beating');
          },
          onDone: async () => {
            if (sent) return;
            sent = true;
            btn.classList.add('is-struck');
            btn.disabled = true;
            const ack = await app.request(C2S.ASSASSIN_GUESS, { playerId: id });
            // Success moves everyone to game over, which closes this dialog.
            if (!ack.ok && ack.code !== 'err.phase') {
              toast(t(ack.code, ack.params), { kind: 'err' });
              close();
            }
          },
        });
        return [btn, why, button({ label: t('assassin.goBack'), kind: 'ghost', onClick: close, attrs: { 'data-autofocus': '' } })];
      },
    });
  }

  // ---------- F1 · the Assassin picks ----------

  function pickList() {
    const game = g();
    const me = game.seats.indexOf(v().you);
    const order = game.seats.map((_, k) => game.seats[(me + k) % game.seats.length]).filter((id) => id !== v().you);
    const evil = new Set(g().evilIds);
    return [
      h('p', { class: 't-label muted b' }, t('assassin.chooseOne')),
      h(
        'div',
        { class: 'plist', role: 'radiogroup', 'aria-label': t('assassin.listLabel') },
        order.map((id) => {
          const ally = evil.has(id);
          const on = pick === id;
          const meta = ally ? t('assassin.ally') : on ? t('assassin.yourGuess') : null;
          return h(
            'button',
            {
              type: 'button',
              class: ['prow', ally && 'is-disabled', on && 'is-target'],
              role: 'radio',
              key: `guess-${id}`,
              'aria-checked': String(on),
              disabled: ally,
              on: { click: () => { pick = id; paint(); } },
            },
            avatar(game.names[id]),
            h('span', { class: 'prow-name' }, h('span', { text: game.names[id] }), meta ? h('span', { class: 'prow-meta' }, meta) : null),
            ally ? chip(t('team.evil'), { kind: 'evil', ic: 'evil' }) : h('span', { class: 'tick' }, icon('target')),
          );
        }),
      ),
    ];
  }

  function pickDock() {
    if (pick) {
      return [
        button({ label: t('assassin.name', { name: g().names[pick] }), kind: 'danger', ic: 'assassin', key: 'name', extra: ['anim-rise'], onClick: () => confirmStrike(pick) }),
        note(t('assassin.nextStep')),
      ];
    }
    return [
      h('button', { type: 'button', class: 'btn btn-danger btn-block', disabled: true, 'aria-describedby': 'guess-why' }, t('assassin.nameEmpty')),
      note(t('assassin.takeTime'), { ic: 'info', id: 'guess-why' }),
    ];
  }

  // ---------- F3 · everyone else ----------

  function waitContent() {
    const game = g();
    return [
      h('div', { class: 'strike-emblem anim-pulse' }, icon('assassin', 'strike-dagger')),
      h(
        'div',
        { class: 'col strike-text' },
        h('p', { class: 'd-l' }, t('assassin.oneGuess')),
        h('p', { class: 't-body-l muted pretty narrow' }, t('assassin.waitText', { name: assassinName() })),
      ),
      h(
        'div',
        { class: 'row wrap strike-chips', role: 'list', 'aria-label': t('assassin.evilLabel') },
        g().evilIds.map((id) => {
          const c = chip(id === v().you ? t('over.you', { name: game.names[id] }) : game.names[id], { kind: 'evil', ic: 'evil' });
          c.setAttribute('role', 'listitem');
          return c;
        }),
      ),
      h('p', { class: 't-label faint' }, t('assassin.revealed')),
    ];
  }

  // ---------- paint ----------

  function paint() {
    if (!alive) return;
    const away = awayStatus(v(), app);
    const mine = isAssassin();
    replace(
      status,
      statusBar({
        phase: mine ? t('assassin.phaseYours') : t('phase.assassination'),
        phaseIcon: 'assassin',
        tone: away?.needed ? 'alert' : 'tense',
        right: away ? away.chip : null,
        main: mine ? t('assassin.yourMain') : t('assassin.choosing', { name: assassinName() }),
        wait: away?.needed ? away.wait : mine ? t('assassin.yourHint') : t('assassin.waitHint'),
      }),
    );
    content.classList.toggle('content-center', !mine);
    content.classList.toggle('strike-wait', !mine);
    content.classList.toggle('strike-pick', mine);
    replace(content, mine ? pickList() : waitContent());

    const key = mine ? `pick:${pick}` : 'wait';
    if (key === dockKey) return;
    dockKey = key;
    peek?.destroy();
    peek = null;
    if (mine) replace(dock, pickDock());
    else {
      peek = peekButton(app);
      replace(dock, peek.el);
    }
  }

  const el = h('div', { class: 'screen-body' }, gameTopbar(app, { onMenu: () => openMenu(app), onHistory: () => openHistory(app) }), status, content, dock);
  paint();
  return {
    el,
    update: paint,
    destroy: () => {
      alive = false;
      app.root.classList.remove('phone-tense');
      peek?.destroy();
    },
  };
}
