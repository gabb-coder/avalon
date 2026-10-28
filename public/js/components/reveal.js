// Shared by the two reveal screens (D7/D8 votes, D12/D13 quest result):
// a Skip button in the top bar while the animation runs, and the Continue
// dock that tells the server this player has finished reading.
//
// Skip only jumps this player to the end state (HANDOFF §5); every reveal is
// under 3 seconds and ends in the same static state reduced motion shows.

import { C2S } from '../../shared/protocol.js';
import { h, replace } from '../dom.js';
import { t, list } from '../i18n.js';
import { toast } from './toast.js';
import { button, note, dots, iconButton, roomTag, topbar } from './ui.js';

const ANIMS = ['anim-rise', 'anim-stamp', 'anim-coin'];

// A top bar whose right slot is Skip until the reveal ends, then History.
export function revealTopbar(app, { container, totalMs, onMenu, onHistory }) {
  const right = h('div', { class: 'topbar-right' });
  const finish = () => {
    clearTimeout(timer);
    for (const cls of ANIMS) container.querySelectorAll(`.${cls}`).forEach((el) => el.classList.remove(cls));
    replace(right, iconButton({ ic: 'history', label: t('board.history'), onClick: onHistory }));
  };
  replace(right, h('button', { type: 'button', class: 'btn btn-ghost btn-md btn-skip', on: { click: finish } }, t('reveal.skip')));
  const reduced = app.root.classList.contains('reduce-motion');
  const timer = setTimeout(finish, reduced ? 200 : totalMs);
  const bar = topbar(iconButton({ ic: 'menu', label: t('menu.openFull'), onClick: onMenu }), roomTag(app.view.code), right);
  return { el: bar, finish, destroy: () => clearTimeout(timer) };
}

// The Continue dock: the action, then "Waiting for N more…" once pressed.
export function continueDock(app, dock, { label, ic = 'arrow', hint, before = null }) {
  let sent = false;
  const paint = () => {
    const g = app.view.game;
    const done = sent || g.continued.includes(app.view.you);
    if (!done) {
      replace(
        dock,
        before,
        button({
          label,
          ic,
          key: 'continue',
          onClick: async () => {
            sent = true;
            paint();
            const ack = await app.request(C2S.REVEAL_CONTINUE);
            if (!ack.ok && ack.code !== 'err.phase') toast(t(ack.code, ack.params), { kind: 'err' });
          },
        }),
        hint ? note(hint) : null,
      );
      return;
    }
    const waiting = g.seats.filter((id) => !g.continued.includes(id) && id !== app.view.you);
    replace(
      dock,
      before,
      h(
        'p',
        { class: 'btn-note note-box', role: 'status' },
        dots(),
        waiting.length ? t('reveal.waitingOthers', { n: waiting.length, names: list(waiting.map((id) => g.names[id])) }) : t('reveal.movingOn'),
      ),
    );
  };
  paint();
  return { paint };
}
