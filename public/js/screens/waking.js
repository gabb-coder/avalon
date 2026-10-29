// A6 · Waking up the server. Render's free tier sleeps; the page is a static
// site and loads instantly, so this screen covers the 10–40 s the game server
// takes to boot. It retries on its own and offers "Try again" after 45 s.

import { h, icon, replace } from '../dom.js';
import { t } from '../i18n.js';
import { button, topbar } from '../components/ui.js';
import { ambience } from '../fx.js';

const TRY_AGAIN_AFTER_MS = 45000;

const clock = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function step(state, text, extra) {
  const mark =
    state === 'done'
      ? icon('check', 'good', 'ic-20')
      : state === 'busy'
        ? h('span', { class: 'spinner spinner-20', 'aria-hidden': 'true' })
        : h('span', { class: 'step-todo', 'aria-hidden': 'true' });
  return h('div', { class: 'row step' }, mark, h('span', { class: ['t-body', state === 'todo' && 'faint'] }, text, extra || null));
}

function taskText(app) {
  const p = app.pending || { task: 'resume', code: app.session?.code };
  if (p.task === 'create') return t('waking.creating');
  if (p.task === 'join') return t('waking.joining', { code: p.code });
  return t('waking.rejoining', { code: p.code || '' });
}

export function mount(app) {
  const steps = h('div', { class: 'panel col waking-steps' });
  const dock = h('div', { class: 'dock' });

  const paint = () => {
    const started = app.pending?.startedAt || Date.now();
    const elapsed = Date.now() - started;
    const online = app.conn === 'online';
    const reached = online || app.reached || app.awake;
    const awake = online || app.awake;
    replace(
      steps,
      step(reached ? 'done' : 'busy', t('waking.reached')),
      step(awake ? 'done' : reached ? 'busy' : 'todo', t('waking.waking'), awake ? null : h('span', { class: 'faint tnum' }, ` · ${clock(elapsed)}`)),
      step(online ? 'busy' : 'todo', taskText(app)),
    );
    replace(
      dock,
      elapsed > TRY_AGAIN_AFTER_MS ? button({ label: t('waking.tryAgain'), ic: 'refresh', key: 'try', onClick: () => app.retryWake() }) : null,
      button({ label: t('common.cancel'), kind: 'ghost', md: true, key: 'cancel', onClick: () => app.cancelPending() }),
    );
  };

  const el = h(
    'div',
    { class: 'screen-body' },
    ambience(),
    topbar(),
    h(
      'div',
      { class: 'content content-center', role: 'status', 'aria-live': 'polite' },
      h('div', { class: 'logo-glow' }, h('div', { class: 'glow anim-breathe', 'aria-hidden': 'true' }), icon('logo', 'logo-120')),
      h('h1', { class: 'd-m' }, t('server.waking')),
      h('p', { class: 't-body muted pretty narrow' }, t('waking.body')),
      h('div', { class: 'progress is-indet progress-240', 'aria-hidden': 'true' }, h('i')),
      steps,
      h('p', { class: 't-label faint pretty' }, t('waking.note')),
    ),
    dock,
  );
  paint();
  const timer = setInterval(paint, 1000);
  return { el, update: paint, destroy: () => clearInterval(timer) };
}
