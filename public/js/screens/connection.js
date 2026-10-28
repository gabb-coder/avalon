// G1 · Reconnecting. While a room's connection is down (for less than
// `connectionLostMs`, 30 s), the screen behind dims and stops taking taps, a
// banner counts the attempts, and "Hang tight" says nothing is lost. The
// server holds the seat and the game waits; when the socket comes back the
// app resumes the seat and the screen returns as it was.
//
// After 30 s the app switches to G2 (screens/lost.js) instead.

import { h, icon } from '../dom.js';
import { t } from '../i18n.js';
import { closeOverlay } from '../components/overlay.js';

export function connectionLayer(root, screenHost) {
  const sub = h('p', { class: 't-label muted' });
  const banner = h(
    'div',
    { class: 'conn-banner', role: 'status', 'aria-live': 'assertive' },
    h('span', { class: 'spinner spinner-warn', 'aria-hidden': 'true' }),
    h('div', { class: 'grow' }, h('p', { class: 't-body b' }, t('net.reconnectingTitle')), sub),
  );
  // Decorative for screen readers: the banner above already says it all.
  const card = h(
    'div',
    { class: 'modal conn-modal anim-modal', 'aria-hidden': 'true' },
    h('span', { class: 'modal-icon modal-icon-warn' }, icon('wifioff', 'ic-28')),
    h('p', { class: 't-title' }, t('net.hangTight')),
    h('p', { class: 't-body muted pretty' }, t('net.hangTightText')),
    h('div', { class: 'progress is-indet full-width' }, h('i')),
  );
  const layer = h('div', { class: 'conn-layer', hidden: true }, banner, card);
  root.append(layer);
  let shown = false;

  return {
    update(app) {
      const show = app.route === 'room' && app.everOnline && app.conn !== 'online' && !app.isLost();
      sub.textContent = app.attempt > 0 ? t('net.attempt', { n: app.attempt }) : t('net.reconnectingSub');
      if (show === shown) return;
      shown = show;
      layer.hidden = !show;
      root.classList.toggle('is-reconnecting', show);
      // The game behind can't be used while we're away: nothing would reach
      // the server. `inert` also takes it out of the tab order.
      screenHost.inert = show;
      if (show) closeOverlay();
    },
  };
}
