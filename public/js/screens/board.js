// Placeholder for every phase after the night, until milestone 4 builds the
// board (D1–D17). It never leaves a blank screen: it names the phase and who
// the table is waiting on, and Peek works.

import { h, replace } from '../dom.js';
import { t, list } from '../i18n.js';
import { peekButton } from '../components/peek.js';
import { iconButton, panel, roomTag, statusBar, topbar } from '../components/ui.js';
import { openMenu } from './sheets.js';

export function mount(app) {
  const status = h('div', { class: 'status-slot' });
  const peek = peekButton(app);

  const paint = () => {
    const v = app.view;
    const g = v.game;
    const waiting = g.waitingOn.map((id) => g.names[id]);
    replace(
      status,
      statusBar({
        phase: t(`phase.${v.phase}`, { q: g.questIndex + 1 }),
        main: t('board.placeholderMain'),
        wait: waiting.length ? t('board.waitingOn', { names: list(waiting) }) : null,
      }),
    );
  };

  const el = h(
    'div',
    { class: 'screen-body' },
    topbar(iconButton({ ic: 'menu', label: t('menu.open'), onClick: () => openMenu(app) }), roomTag(app.view.code)),
    status,
    h('div', { class: 'content' }, panel(h('p', { class: 't-body muted' }, t('board.placeholderBody')))),
    h('div', { class: 'dock' }, peek.el),
  );
  paint();
  return { el, update: paint, destroy: () => peek.destroy() };
}
