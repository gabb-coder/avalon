// Toasts (HANDOFF §3): role=status (alert for errors), 3 s, errors stay until
// dismissed, at most 2 stacked, sitting above the dock.

import { h, icon } from '../dom.js';
import { t } from '../i18n.js';

const ICONS = { ok: 'check', info: 'info', warn: 'warn', err: 'warn' };
const MAX = 2;
const LIFETIME_MS = 3000;

let slot = null;

export function mountToasts(host) {
  slot = h('div', { class: 'toast-slot' });
  host.append(slot);
}

export function toast(text, { kind = 'info', ic, action, persist = kind === 'err' } = {}) {
  if (!slot) return;
  const el = h(
    'div',
    { class: ['toast', `toast-${kind}`, 'anim-rise'], role: kind === 'err' ? 'alert' : 'status' },
    icon(ic || ICONS[kind]),
    h('span', { class: 'grow' }, text),
    action || persist
      ? h('button', { type: 'button', class: 'toast-action', on: { click: () => { action?.onClick?.(); remove(); } } }, action?.label || t('common.ok'))
      : null,
  );
  const remove = () => el.remove();
  slot.append(el);
  while (slot.children.length > MAX) slot.firstElementChild.remove();
  if (!persist) setTimeout(remove, LIFETIME_MS);
  return remove;
}

export function clearToasts() {
  slot?.replaceChildren();
}
