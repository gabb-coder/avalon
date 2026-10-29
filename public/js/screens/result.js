// D12 · Quest result. D13 · Quest 4 with 7+ players: one Fail isn't enough.
// The shuffled cards coin-flip one by one (280 ms apart), then the verdict
// stamps, then the quest node stamps: under 3 seconds in all, with Skip.
// Only counts and the already-shuffled cards are shown, never who played what.

import { h, icon } from '../dom.js';
import { t, gap } from '../i18n.js';
import { panel, statusBar } from '../components/ui.js';
import { questTrack } from '../components/board.js';
import { revealTopbar, continueDock } from '../components/reveal.js';
import { openMenu, openHistory } from './sheets.js';

const FIRST_MS = 200;
const STEP_MS = 280;

export function mount(app) {
  const v = app.view;
  const g = v.game;
  const qi = g.questIndex;
  const quest = g.quests[qi];
  const q = qi + 1;
  const success = quest.result === 'success';
  const wins = g.quests.filter((x) => x.result === 'success').length;
  const losses = g.quests.filter((x) => x.result === 'fail').length;
  const despite = success && quest.fails > 0; // only possible on a two-fail quest

  const cardsEnd = FIRST_MS + quest.cards.length * STEP_MS;
  const bannerAt = cardsEnd + (despite ? 400 : 200);
  const stampAt = bannerAt + 400;

  const tokens = h(
    'div',
    { class: 'row result-cards' },
    quest.cards.map((c, i) => {
      const tok = h('div', { class: ['rtok', c === 'success' ? 'rtok-s' : 'rtok-f', 'anim-coin'] }, icon(c === 'success' ? 'success' : 'fail'), t(c === 'success' ? 'card.success' : 'card.fail'));
      tok.style.animationDelay = `${FIRST_MS + i * STEP_MS}ms`;
      return tok;
    }),
  );
  tokens.setAttribute('aria-label', t('result.cardsAria', { s: quest.successes, f: quest.fails }));
  tokens.setAttribute('role', 'img');

  let special = null;
  if (despite) {
    special = panel([h('span', { class: 'qnode-tag tag-lg' }, t('board.twoFailsTag')), h('p', { class: 't-label muted' }, h('b', { class: 'text-1' }, t('result.q4Title', { q })), gap(), t('result.q4Text', { n: quest.fails }))], {
      extra: ['row', 'text-left', 'full-width', 'evil-ring-panel', 'anim-rise'],
    });
    special.style.animationDelay = `${cardsEnd + 100}ms`;
  }

  let score;
  if (wins >= 3) score = t('result.goodWon');
  else if (losses >= 3) score = t('result.evilWon');
  else if (wins > losses) score = t('result.goodLeads', { a: wins, b: losses });
  else if (losses > wins) score = t('result.evilLeads', { a: losses, b: wins });
  else score = t('result.tied', { a: wins, b: losses });

  const banner = h(
    'div',
    { class: ['banner', success ? 'banner-good' : 'banner-evil', 'full-width', 'anim-stamp'], role: 'status' },
    h('span', { class: [success ? 'frame-good' : 'frame-evil', 'frame-56'] }, icon(success ? 'success' : 'fail', 'ic-32')),
    h('p', { class: 'd-l' }, t(success ? 'card.success' : 'result.failWord')),
    h('p', { class: 't-body muted' }, score),
  );
  banner.style.animationDelay = `${bannerAt}ms`;

  const track = questTrack(g, { compact: false, stamp: qi, phase: v.phase });
  track.querySelector('.anim-stamp')?.style.setProperty('animation-delay', `${stampAt}ms`);

  const content = h(
    'div',
    { class: 'content content-center result' },
    h('p', { class: 'eyebrow eyebrow-12' }, t('result.shuffled')),
    tokens,
    special,
    banner,
    h('div', { class: 'panel full-width' }, track),
  );

  const status = statusBar({
    phase: t('result.phase', { q }),
    phaseIcon: success ? 'success' : 'fail',
    main: despite ? t('result.succeedsDespite', { q, n: quest.fails }) : t(success ? 'result.succeeds' : 'result.fails', { q }),
    wait: [t('result.counts', { s: quest.successes, f: quest.fails }), quest.failsNeeded === 2 ? t('result.neededTwo') : ''].join(''),
  });

  const dock = h('div', { class: 'dock' });
  let opts;
  if (wins >= 3) {
    opts = {
      label: t('result.toFinalGuess'),
      ic: 'assassin',
      before: h('div', { class: 'row assassin-warn' }, icon('assassin', 'evil', 'ic-20'), h('p', { class: 't-label b evil' }, t('result.assassinNext'))),
    };
  } else if (losses >= 3) {
    opts = { label: t('reveal.seeEnding') };
  } else {
    opts = { label: t('result.backToTable'), ic: 'standard' };
  }
  const cont = continueDock(app, dock, opts);
  const top = revealTopbar(app, { container: content, totalMs: stampAt + 500, onMenu: () => openMenu(app), onHistory: () => openHistory(app) });

  const el = h('div', { class: 'screen-body' }, top.el, h('div', { class: 'status-slot' }, status), content, dock);
  return { el, update: () => cont.paint(), destroy: () => top.destroy() };
}
