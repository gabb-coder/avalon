// G2 · Connection lost: the room's connection has been down for 30 seconds.
// The seat is still held on the server, so this offers Try again and counts
// down how long the seat is kept. The countdown starts when this phone lost
// the connection, which is no later than when the server noticed, so it can
// only err on the short side.
//
// The socket keeps retrying on its own the whole time; when it gets through,
// the app resumes the seat and the game screen comes back by itself.

import { h, icon, replace } from '../dom.js';
import { t } from '../i18n.js';
import { button } from '../components/ui.js';

const TRY_MS = 4000;

export function mount(app) {
  const seatMs = app.hello?.seatHoldMs ?? 5 * 60000;
  const lostMs = app.hello?.connectionLostMs ?? 30000;
  const held = h('p', { class: 't-label muted grow' });
  const dock = h('div', { class: 'dock' });
  let trying = false;
  let tryTimer = null;

  function paintHeld() {
    const left = Math.max(0, seatMs - (Date.now() - app.offlineSince));
    if (left > 0) {
      const m = Math.floor(left / 60000);
      const s = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
      replace(held, h('b', { class: 'text-1' }, t('lost.held', { time: `${m}:${s}` })), ' ', t('lost.heldText'));
    } else {
      replace(held, h('b', { class: 'text-1' }, t('lost.heldOver')), ' ', t('lost.heldOverText'));
    }
  }

  function paintDock() {
    replace(
      dock,
      button({
        label: trying ? t('lost.trying') : t('lost.tryAgain'),
        ic: 'refresh',
        key: 'try',
        disabled: trying,
        onClick: () => {
          trying = true;
          app.net.retry();
          paintDock();
          tryTimer = setTimeout(() => {
            trying = false;
            paintDock();
          }, TRY_MS);
        },
      }),
      button({ label: t('lost.home'), kind: 'ghost', md: true, onClick: () => app.homeKeepSeat() }),
    );
  }

  const el = h(
    'div',
    { class: 'screen-body' },
    h('div', { class: 'topbar' }),
    h(
      'div',
      { class: 'content content-center', role: 'alert' },
      h('div', { class: 'lost-icon' }, icon('wifioff', 'lost-ic')),
      h('h1', { class: 'd-l' }, t('lost.title')),
      h('p', { class: 't-body-l muted pretty lost-text' }, t('net.lost', { code: app.view?.code || app.session?.code || '', s: Math.round(lostMs / 1000) }), ' ', t('lost.check')),
      h('div', { class: 'panel row text-left full-width lost-panel' }, icon('hourglass', 'gold'), held),
    ),
    dock,
  );
  paintHeld();
  paintDock();
  const tick = setInterval(paintHeld, 1000);
  return {
    el,
    destroy: () => {
      clearInterval(tick);
      clearTimeout(tryTimer);
    },
  };
}
