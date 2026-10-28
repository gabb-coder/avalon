// "Hold to peek at my role" (HANDOFF §3, D-screens): while held, the peek
// sheet is inserted above the dock; on release it is removed from the DOM.

import { h, icon } from '../dom.js';
import { t } from '../i18n.js';
import { bindHold } from './hold.js';
import { peekSheet } from './roleCard.js';

export function peekButton(app, { short = false, extra = [] } = {}) {
  const label = h('span', {}, t(short ? 'peek.short' : 'peek.label'));
  const btn = h('button', { type: 'button', class: ['peek', ...extra], 'aria-label': t('peek.aria') }, icon('hold'), label);
  let sheet = null;
  const hold = bindHold(btn, {
    onShow: () => {
      if (!app.view?.game) return;
      btn.classList.add('is-held');
      label.textContent = t('peek.release');
      sheet = peekSheet(app.view);
      app.root.append(sheet);
    },
    onHide: () => {
      btn.classList.remove('is-held');
      label.textContent = t(short ? 'peek.short' : 'peek.label');
      sheet?.remove();
      sheet = null;
    },
  });
  return { el: btn, destroy: () => hold.destroy() };
}
