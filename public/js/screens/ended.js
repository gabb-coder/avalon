// G3 · Room ended: the room is gone (host ended it, someone never came back,
// it went idle, everyone left, you were removed, or the server restarted).
// Never a blank screen: always a reason and a way forward.

import { h, icon } from '../dom.js';
import { t } from '../i18n.js';
import { prefs } from '../prefs.js';
import { button, topbar } from '../components/ui.js';

export function mount(app) {
  const info = app.endedInfo || { reason: 'gone' };
  const code = info.code || '';
  const el = h(
    'div',
    { class: 'screen-body' },
    topbar(),
    h(
      'div',
      { class: 'content content-center', role: 'alert' },
      icon('logo', 'logo-120', 'faint'),
      h('h1', { class: 'd-l' }, t(info.reason === 'kicked' ? 'ended.kickedTitle' : 'ended.title')),
      h('p', { class: 't-body-l muted pretty narrow' }, t(`ended.${info.reason}`, { code, name: info.name || '' })),
    ),
    h(
      'div',
      { class: 'dock' },
      button({ label: t('ended.home'), onClick: () => app.go('home') }),
      button({
        label: t('ended.newRoom'),
        kind: 'ghost',
        md: true,
        ic: 'plus',
        onClick: () => (prefs.name ? app.createRoom(prefs.name) : app.go('home')),
      }),
    ),
  );
  return { el };
}
