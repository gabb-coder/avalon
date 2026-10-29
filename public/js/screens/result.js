// D12 · Quest result. D13 · Quest 4 with 7+ players: one Fail isn't enough.
// The cards are dealt face down and shuffled into a row, then turn over one
// by one, with an extra beat before the last; each Success throws gold
// sparks, each Fail cracks and throws embers. Then the verdict stamps, then
// the quest node: under 3 seconds in all, with Skip.
// Only counts and the already-shuffled cards are shown, never who played
// what. The shuffle on screen is decoration: the server shuffled them.

import { h, icon } from '../dom.js';
import { t, gap } from '../i18n.js';
import { panel, statusBar } from '../components/ui.js';
import { questTrack } from '../components/board.js';
import { revealTopbar, continueDock } from '../components/reveal.js';
import { openMenu, openHistory } from './sheets.js';
import { calm, timeline, burst, shake, cardBack, crack } from '../fx.js';
import { sound } from '../sound.js';

const DEAL_MS = 560; // face down, shuffled into place
const STEP_MS = 200; // between flips
const PAUSE_MS = 260; // the extra beat before the last card
const FLIP_MS = 440;

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

  const n = quest.cards.length;
  const flipAt = (i) => DEAL_MS + i * STEP_MS + (n > 1 && i === n - 1 ? PAUSE_MS : 0);
  const cardsEnd = flipAt(n - 1) + FLIP_MS;
  const bannerAt = cardsEnd + (despite ? 300 : 120);
  const stampAt = bannerAt + 300;
  const moving = !calm(app);

  const cards = quest.cards.map((c, i) => {
    const ok = c === 'success';
    const front = h('div', { class: ['rtok', ok ? 'rtok-s' : 'rtok-f'] }, icon(ok ? 'success' : 'fail'), t(ok ? 'card.success' : 'card.fail'));
    if (!ok) {
      const lines = crack();
      lines.classList.add('anim-crack');
      lines.style.setProperty('--crack-at', `${flipAt(i) + FLIP_MS - 140}ms`);
      front.append(lines);
    }
    const inner = h('div', { class: 'rcard-inner anim-cardflip', style: { 'animation-delay': `${flipAt(i)}ms` } }, front, cardBack());
    return h('div', { class: ['rcard', moving && 'is-dealing'] }, inner);
  });
  const tokens = h('div', { class: 'row result-cards' }, cards);
  tokens.setAttribute('aria-label', t('result.cardsAria', { s: quest.successes, f: quest.fails }));
  tokens.setAttribute('role', 'img');

  // The deal: every card starts on one pile in the middle, the pile is cut
  // back and forth, and the cards slide out to their places. Measured once
  // the screen is laid out, so it works however the row wraps.
  function deal() {
    if (!tokens.isConnected || !cards[0].classList.contains('is-dealing')) return; // skipped already
    const row = tokens.getBoundingClientRect();
    const cx = row.left + row.width / 2;
    const cy = row.top + row.height / 2;
    cards.forEach((card, i) => {
      const r = card.getBoundingClientRect();
      const dx = cx - (r.left + r.width / 2);
      const dy = cy - (r.top + r.height / 2);
      const side = i % 2 ? 1 : -1;
      card.classList.remove('is-dealing');
      card.animate(
        [
          { transform: `translate(${dx}px, ${dy - 12}px) rotate(${side * 4}deg)`, opacity: 0 },
          { transform: `translate(${dx + side * 30}px, ${dy}px) rotate(${-side * 6}deg)`, opacity: 1, offset: 0.3 },
          { transform: `translate(${dx - side * 16}px, ${dy}px) rotate(${side * 3}deg)`, offset: 0.55 },
          { transform: 'none' },
        ],
        { duration: DEAL_MS - 40, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'backwards' },
      );
    });
  }
  if (moving) requestAnimationFrame(deal);

  let special = null;
  if (despite) {
    special = panel([h('span', { class: 'qnode-tag tag-lg' }, t('board.twoFailsTag')), h('p', { class: 't-label muted' }, h('b', { class: 'text-1' }, t('result.q4Title', { q })), gap(), t('result.q4Text', { n: quest.fails }))], {
      extra: ['row', 'text-left', 'full-width', 'evil-ring-panel', 'anim-rise'],
    });
    special.style.animationDelay = `${cardsEnd + 80}ms`;
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
  const fx = timeline(app);
  // Sounds: the shuffle, each card turning and what it shows, a swell before
  // the last, then the verdict. With reduced motion, only the verdict.
  if (moving) {
    fx.at(20, () => sound('shuffle'));
    quest.cards.forEach((c, i) => {
      fx.at(flipAt(i), () => sound('flip'));
      fx.at(flipAt(i) + FLIP_MS - 160, () => sound(c === 'success' ? 'success' : 'fail'));
    });
    if (n > 1) fx.at(flipAt(n - 1) - 420, () => sound('tension'));
    fx.at(bannerAt + 210, () => sound(success ? 'questWon' : 'questLost'));
  } else fx.at(150, () => sound(success ? 'questWon' : 'questLost'));
  // The last card trembles while the table holds its breath.
  if (n > 1) {
    fx.at(flipAt(n - 1) - 420, () =>
      cards[n - 1].animate(
        [{ transform: 'none' }, { transform: 'rotate(-2.5deg) scale(1.04)' }, { transform: 'rotate(2.5deg) scale(1.05)' }, { transform: 'rotate(-1.5deg) scale(1.04)' }, { transform: 'none' }],
        { duration: 400, easing: 'ease-in-out' },
      ),
    );
  }
  quest.cards.forEach((c, i) => {
    fx.at(flipAt(i) + FLIP_MS - 160, () => {
      if (c === 'success') burst(app, cards[i], { kind: 'gold', count: 9, reach: 52 });
      else {
        burst(app, cards[i], { kind: 'ember', count: 11, reach: 58 });
        shake(app, cards[i], { px: 3 });
      }
    });
  });
  fx.at(bannerAt + 210, () => {
    burst(app, banner.firstChild, { kind: success ? 'gold' : 'ember', count: 22, reach: 140 });
    if (!success) shake(app, content, { px: 6 });
  });
  const top = revealTopbar(app, { container: content, totalMs: stampAt + 500, fx, onMenu: () => openMenu(app), onHistory: () => openHistory(app) });

  const el = h('div', { class: 'screen-body' }, top.el, h('div', { class: 'status-slot' }, status), content, dock);
  return { el, update: () => cont.paint(), destroy: () => top.destroy() };
}
