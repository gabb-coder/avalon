// A1 · Splash. Shown while the strings load; tap to skip ahead.

import { h, icon } from '../dom.js';
import { t } from '../i18n.js';
import { GAME_TITLE } from '../../config.js';

export function mount(app) {
  const el = h(
    'div',
    { class: 'screen-body' },
    h(
      'button',
      { type: 'button', class: 'splash-hit', 'aria-label': t('splash.continue'), on: { click: () => app.go('home') } },
      h('div', { class: 'splash-glow anim-breathe', 'aria-hidden': 'true' }),
      icon('logo', 'splash-logo', 'anim-stamp'),
      h(
        'div',
        { class: 'splash-title' },
        h('p', { class: 'd-l title-caps' }, GAME_TITLE.toLocaleUpperCase()),
        h('hr', { class: 'rule splash-rule' }),
        h('p', { class: 't-body muted center pretty splash-tag' }, t('app.tagline')),
      ),
    ),
    h('div', { class: 'splash-foot' }, h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('span', { class: 'sr' }, t('common.loading'))),
  );
  return { el };
}
