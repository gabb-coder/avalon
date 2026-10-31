// C1 · Role card, hold to reveal. C2 · Held: the parchment front and the
// private band. C3 · "I've seen my role", then who we're still waiting on.
//
// PRIVACY: the card front (role, team, night info) is created on pointerdown
// and removed on release. While the card is face down the page contains only
// the identical card back; the button's label says "face down" too.

import { C2S } from '../../shared/protocol.js';
import { h, icon, replace } from '../dom.js';
import { t, list } from '../i18n.js';
import { bindHold } from '../components/hold.js';
import { roleFront, roleBack, roleAria } from '../components/roleCard.js';
import { peekButton } from '../components/peek.js';
import { button, blockedButton, iconButton, note, panel, privateBand, progress, roomTag, statusBar, topbar, waitGrid, dots } from '../components/ui.js';
import { toast } from '../components/toast.js';
import { openMenu } from './sheets.js';
import { ambience } from '../fx.js';
import { settingsButton } from '../components/board.js';

export function mount(app) {
  let seen = false; // held at least once: unlocks "I've seen my role"
  let peek = null;

  const g = () => app.view.game;
  const me = () => app.view.you;
  const acked = () => g().ready.includes(me());
  const names = (ids) => ids.map((id) => g().names[id]);

  const top = h('div', { class: 'status-slot' });
  const content = h('div', { class: 'content night' });
  const dock = h('div', { class: 'dock' });

  // ---------- C1/C2: the card ----------

  const card = h('button', {
    type: 'button',
    class: 'hold-card',
    'aria-label': t('card.ariaHidden'),
    'aria-pressed': 'false',
  });
  card.append(roleBack());
  const hint = h('p', { class: 't-label muted row hold-hint' });
  const paintHint = (held) =>
    held
      ? replace(hint, icon('hold', 'ic-16'), t('card.holding'))
      : replace(hint, icon('eyeoff', 'ic-16', 'gold'), t('card.tilt'));

  // Short screens (a phone with its browser bars showing) can't fit the
  // 300×440 card with the band, hint and dock: zoom it down to fit, so the
  // whole role is always in view. Measured while face down; the front is the
  // same size.
  function fitCard() {
    if (!content.contains(card) || !content.clientHeight) return;
    card.style.zoom = '';
    const style = getComputedStyle(content);
    const room = content.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - parseFloat(style.rowGap || 0) - hint.offsetHeight;
    const across = content.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const zoom = Math.min(1, room / card.offsetHeight, across / card.offsetWidth);
    if (zoom < 1) card.style.zoom = String(Math.max(0.55, zoom).toFixed(3));
  }
  const onResize = () => {
    if (!hold.held) fitCard();
  };
  window.addEventListener('resize', onResize);

  const hold = bindHold(card, {
    onShow: () => {
      seen = true;
      card.replaceChildren(roleFront(app.view, { animate: true }));
      card.setAttribute('aria-label', roleAria(app.view));
      card.setAttribute('aria-pressed', 'true');
      hint.classList.add('gold', 'b');
      paintHint(true);
      replace(top, privateBand());
      paintDock();
    },
    onHide: () => {
      card.replaceChildren(roleBack());
      card.setAttribute('aria-label', t('card.ariaHidden'));
      card.setAttribute('aria-pressed', 'false');
      hint.classList.remove('gold', 'b');
      paintHint(false);
      paintStatus();
    },
  });
  paintHint(false);

  // ---------- status, content, dock ----------

  function paintStatus() {
    if (hold.held) return; // the private band stays up while the card is held
    const game = g();
    const ready = game.ready.length;
    const total = game.seats.length;
    const right = h('span', { class: 't-label faint tnum' }, t('night.ready', { n: ready, total }));
    if (!acked()) {
      replace(top, statusBar({ phase: t('phase.night'), phaseIcon: 'eyeoff', right, tone: 'you', main: t('night.dealt'), wait: t('night.holdHint'), live: false }));
      return;
    }
    const waiting = names(game.waitingOn);
    replace(
      top,
      statusBar({
        phase: t('phase.night'),
        phaseIcon: 'eyeoff',
        right,
        main: waiting.length === 1 ? t('night.waitingOne', { name: waiting[0] }) : t('night.waitingMany', { n: waiting.length, names: list(waiting) }),
        wait: [dots(), t('night.startsWhenReady')],
      }),
    );
  }

  function paintContent() {
    if (!acked()) {
      if (!content.contains(card)) replace(content, card, hint);
      content.classList.add('night-card');
      return;
    }
    content.classList.remove('night-card');
    const game = g();
    const leader = game.firstLeader;
    replace(
      content,
      progress(game.ready.length / game.seats.length),
      waitGrid(
        game.seats.map((id) => ({
          name: game.names[id],
          you: id === me(),
          done: game.ready.includes(id),
          doneText: t('night.readyCell'),
          pendingText: t('night.stillLooking'),
          highlight: !game.ready.includes(id),
        })),
      ),
      panel(
        [
          h('p', { class: 't-body b' }, t('night.whileYouWait')),
          h('div', { class: 'row row-top' }, icon('eyeoff', 'gold', 'ic-20'), h('p', { class: 't-label muted' }, t('night.tipDark'))),
          h(
            'div',
            { class: 'row row-top' },
            icon('standard', 'gold', 'ic-20'),
            h('p', { class: 't-label muted' }, leader === me() ? t('night.tipYouLead') : t('night.tipLeader', { name: game.names[leader] })),
          ),
        ],
        { extra: ['col', 'tips'] },
      ),
    );
  }

  function paintDock() {
    if (acked()) {
      if (!peek) {
        peek = peekButton(app);
        replace(dock, peek.el);
      }
      return;
    }
    if (!seen) {
      replace(dock, blockedButton({ label: t('night.seen'), reason: t('night.holdFirst'), ic: 'hold' }));
      return;
    }
    replace(
      dock,
      button({
        label: t('night.seen'),
        ic: 'check',
        key: 'seen',
        onClick: async () => {
          const ack = await app.request(C2S.NIGHT_ACK);
          if (!ack.ok && ack.code !== 'err.locked') toast(t(ack.code, ack.params), { kind: 'err' });
        },
      }),
      note(t('night.peekLater')),
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
    ambience(),
    topbar(iconButton({ ic: 'menu', label: t('menu.open'), onClick: () => openMenu(app) }), roomTag(app.view.code), settingsButton(app)),
    top,
    content,
    dock,
  );
  paint();
  requestAnimationFrame(fitCard); // once the screen is on the page
  return {
    el,
    update: paint,
    destroy: () => {
      window.removeEventListener('resize', onResize);
      hold.destroy();
      peek?.destroy();
    },
  };
}
