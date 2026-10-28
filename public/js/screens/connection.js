// G1 (first version): while a room's socket is down, a banner says we're
// reconnecting and that nothing is lost. Milestone 6 adds the full G1 overlay
// and G2 "Connection lost" after 30 seconds.

import { h } from '../dom.js';
import { t } from '../i18n.js';

export function connectionBanner(root) {
  const el = h(
    'div',
    { class: 'conn-banner', role: 'status', 'aria-live': 'assertive', hidden: true },
    h('span', { class: 'spinner spinner-warn', 'aria-hidden': 'true' }),
    h('div', { class: 'grow' }, h('p', { class: 't-body b' }, t('net.reconnectingTitle')), h('p', { class: 't-label muted' }, t('net.reconnectingSub'))),
  );
  root.append(el);
  return {
    update(app) {
      el.hidden = !(app.route === 'room' && app.everOnline && app.conn !== 'online');
    },
  };
}

