// E3 · How to play: the picture on each page, and a short scene that plays
// into it when the page opens (and again on Replay).
//
// Each picture is built in its final state. A scene only adds motion on top:
// every animation fills "backwards" (it holds its start until its delay, then
// runs to the element's own style), and the props it adds for the show
// (`.hs-temp`: the dealt cards, the blade) are removed when it ends. So
// stopping a scene at any moment, or not playing it at all (reduced motion),
// leaves exactly the same picture.
//
// Everything here is example material: sample names' initials, sample votes
// and cards. Nothing comes from the view.

import { h, icon, avatar } from '../dom.js';
import { t } from '../i18n.js';
import { calm, burst, shake, crack, cardBack } from '../fx.js';

const EASE = 'cubic-bezier(.2,.8,.2,1)';
const BACK = 'cubic-bezier(.34,1.4,.64,1)';
const SLAM = [{ opacity: 0, transform: 'translateY(-14px) scale(2)' }, { opacity: 1, transform: 'none', offset: 0.5 }, { transform: 'scale(.86)', offset: 0.7 }, { transform: 'scale(1.06)', offset: 0.86 }, { transform: 'none' }];
const STAMP = [{ opacity: 0, transform: 'scale(1.6)' }, { opacity: 1, transform: 'scale(.95)', offset: 0.6 }, { transform: 'none' }];

// ---------- the pictures (final state) ----------

const frame = (team, ic) => h('span', { class: `frame-${team} frame-72` }, icon(ic, 'ic-40'));

// A small table of 7, seated like the board (you at the bottom, clockwise).
const RING = { cx: 125, cy: 80, rx: 105, ry: 62, n: 7, leader: 3, picks: [1, 3, 5] };
const ringAngle = (k) => Math.PI / 2 + (k * 2 * Math.PI) / RING.n;
const ringPos = (a) => [RING.cx + RING.rx * Math.cos(a), RING.cy + RING.ry * Math.sin(a)];

function miniRing() {
  const ring = h('div', { class: 'mini-ring' }, h('div', { class: 'mini-table' }, h('span', { class: 't-label b gold' }, t('board.knights', { n: RING.picks.length }))));
  'RITKMSJ'.split('').forEach((letter, k) => {
    const av = avatar(letter, { size: 32, extra: RING.picks.includes(k) ? ['av-ring', 'hs-pick'] : [] });
    if (k === RING.leader) av.append(h('span', { class: 'av-badge lead hs-crown' }, icon('standard')));
    const seat = h('div', { class: ['mini-seat', k === RING.leader && 'is-lead'] }, av);
    const [x, y] = ringPos(ringAngle(k));
    seat.style.left = `${x}px`;
    seat.style.top = `${y}px`;
    ring.append(seat);
  });
  return ring;
}

const SAMPLE_VOTES = ['approve', 'approve', 'reject', 'approve', 'reject'];

export function howToArt(step) {
  switch (step) {
    case 1:
      return [
        h('div', { class: 'col howto-team hs-good' }, frame('good', 'good'), h('span', { class: 't-body b good' }, t('team.good'))),
        h('span', { class: 'd-m faint hs-vs' }, t('howto.vs')),
        h('div', { class: 'col howto-team hs-evil' }, frame('evil', 'evil'), h('span', { class: 't-body b evil' }, t('team.evil'))),
      ];
    case 2:
      return miniRing();
    case 3: {
      const yes = SAMPLE_VOTES.filter((x) => x === 'approve').length;
      return h(
        'div',
        { class: 'col howto-votes' },
        h(
          'div',
          { class: 'row howto-voters' },
          'RITKM'.split('').map((letter, i) =>
            h(
              'div',
              { class: 'col howto-voter' },
              avatar(letter, { size: 32 }),
              h('span', { class: 'slam hs-vote' }, h('span', { class: ['vm', SAMPLE_VOTES[i] === 'approve' ? 'vm-a' : 'vm-r'] }, icon(SAMPLE_VOTES[i] === 'approve' ? 'check' : 'cross'))),
            ),
          ),
        ),
        h(
          'div',
          { class: 'banner banner-row banner-approve howto-seal hs-seal' },
          h('span', { class: 'vm vm-a' }, icon('check')),
          h('span', { class: 't-body b' }, t('reveal.approved')),
          h('span', { class: 't-label muted tnum' }, t('reveal.approveN', { n: yes }), ' · ', t('reveal.rejectN', { n: SAMPLE_VOTES.length - yes })),
        ),
      );
    }
    case 4:
      return ['success', 'success', 'fail'].map((c) => {
        const ok = c === 'success';
        const front = h('div', { class: ['rtok', ok ? 'rtok-s' : 'rtok-f'] }, icon(ok ? 'success' : 'fail'), t(ok ? 'card.success' : 'card.fail'));
        if (!ok) front.append(crack());
        return h('div', { class: 'flip-card hs-card' }, h('div', { class: 'flip-card-inner' }, front, cardBack()));
      });
    case 5:
      return h(
        'div',
        { class: 'qtrack howto-track' },
        ['success', 'fail', 'success', 'success', 'next'].map((s, i) =>
          h(
            'div',
            { class: ['qnode', s === 'success' && 'is-success', s === 'fail' && 'is-fail', s !== 'next' && 'hs-node'] },
            h('div', { class: 'qnode-disc' }, s === 'next' ? String(i + 1) : icon(s, 'ic-28')),
          ),
        ),
      );
    default:
      return [h('span', { class: 'hs-assassin' }, frame('evil', 'assassin')), icon('target', 'evil', 'ic-32', 'hs-target'), h('span', { class: 'hs-merlin' }, frame('good', 'merlin'))];
  }
}

// ---------- the scenes ----------

// Play the scene for `step` inside `panel` (the picture's panel, already on
// screen). Returns stop(): ends it at once on the final picture.
export function playScene(app, step, panel) {
  if (calm(app) || !panel.isConnected) return () => {};
  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));
  // fill "backwards": hold the first frame until the delay is up. A second
  // animation on the same element uses fill "none", or its held first frame
  // would override the first animation while it waits.
  const run = (el, keyframes, { delay = 0, duration = 400, easing = EASE, fill = 'backwards' } = {}) => el?.animate(keyframes, { delay, duration, easing, fill });
  const $ = (sel) => panel.querySelector(sel);
  const $$ = (sel) => [...panel.querySelectorAll(sel)];
  // Positions inside the panel from layout offsets, not screen boxes: the page
  // is still rising in (scaled) when the scene starts.
  const box = { width: panel.offsetWidth, height: panel.offsetHeight };
  const centre = (el) => {
    let x = el.offsetWidth / 2;
    let y = el.offsetHeight / 2;
    for (let n = el; n && n !== panel; n = n.offsetParent) {
      x += n.offsetLeft;
      y += n.offsetTop;
    }
    return [x, y];
  };
  const temp = (cls) => {
    const el = h('div', { class: ['hs-temp', cls], 'aria-hidden': 'true' });
    panel.append(el);
    return el;
  };
  const SCENES = {
    // Six roles dealt face down, then split: four to Good, two to Evil.
    1: () => {
      const [gx, gy] = centre($('.hs-good .frame-72'));
      const [ex, ey] = centre($('.hs-evil .frame-72'));
      const mid = box.width / 2;
      const cy = box.height / 2;
      for (let i = 0; i < 6; i++) {
        const card = temp('hs-mini-card');
        card.append(cardBack());
        const x = mid + (i - 2.5) * 34;
        const [tx, ty] = i < 4 ? [gx, gy] : [ex, ey];
        card.style.left = `${tx}px`;
        card.style.top = `${ty}px`;
        // Keyframes are offsets from the destination: stacked in the middle,
        // dealt into a row, then gathered into their team.
        const from = (px, py, extra = '') => `translate(${px - tx}px, ${py - ty}px) ${extra}`;
        run(
          card,
          [
            { transform: from(mid, cy, 'rotate(-4deg)'), opacity: 0 },
            { transform: from(mid, cy), opacity: 1, offset: 0.12 },
            { transform: from(x, cy, `rotate(${(i - 2.5) * 3}deg)`), offset: 0.45 },
            { transform: from(x, cy), offset: 0.62 },
            { transform: 'scale(.4)', opacity: 0 },
          ],
          { delay: i * 60, duration: 1500, easing: 'ease-in-out' },
        );
      }
      run($('.hs-good'), STAMP, { delay: 1350, duration: 380, easing: BACK });
      run($('.hs-evil'), STAMP, { delay: 1450, duration: 380, easing: BACK });
      run($('.hs-vs'), [{ opacity: 0 }, { opacity: 1 }], { delay: 1650, duration: 300 });
      at(1450, () => burst(app, $('.hs-good .frame-72'), { kind: 'gold', count: 10, reach: 60, host: panel }));
      at(1550, () => burst(app, $('.hs-evil .frame-72'), { kind: 'ember', count: 10, reach: 60, host: panel }));
      return 2000;
    },
    // The crown goes round the table to its leader, who picks three knights.
    2: () => {
      const from = ringAngle(0);
      const to = ringAngle(RING.leader);
      const [lx, ly] = ringPos(to);
      const frames = [];
      for (let s = 0; s <= 12; s++) {
        const [x, y] = ringPos(from + ((to - from) * s) / 12);
        frames.push({ transform: `translate(${(x - lx).toFixed(1)}px, ${(y - ly).toFixed(1)}px) scale(${(1 + 0.4 * Math.sin((Math.PI * s) / 12)).toFixed(2)})` });
      }
      run($('.hs-crown'), frames, { delay: 200, duration: 1000, easing: 'cubic-bezier(.45,0,.25,1)' });
      $$('.hs-pick').forEach((av, i) => {
        run(av, [{ boxShadow: '0 0 0 0 rgba(214,178,94,0)' }, { boxShadow: '0 0 0 6px rgba(240,213,140,.55)', offset: 0.4 }, { boxShadow: '0 0 0 2.5px var(--gold)' }], { delay: 1350 + i * 280, duration: 500 });
      });
      run($('.mini-table > span'), [{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'none' }], { delay: 2200, duration: 300 });
      return 2500;
    },
    // Five votes slam down, then the verdict lands like a seal.
    3: () => {
      $$('.hs-vote').forEach((vote, i) => run(vote, SLAM, { delay: 250 + i * 170, duration: 400 }));
      const seal = $('.hs-seal');
      run(seal, [{ opacity: 0, transform: 'scale(2) rotate(-7deg)' }, { opacity: 1, transform: 'scale(.94) rotate(1.5deg)', offset: 0.55 }, { transform: 'none' }], { delay: 1300, duration: 440 });
      at(1550, () => {
        shake(app, panel, { px: 4 });
        burst(app, seal.firstChild, { kind: 'gold', count: 12, reach: 70, host: panel });
      });
      return 1900;
    },
    // Three cards dealt face down and cut, then turned: the Fail cracks.
    4: () => {
      const cards = $$('.hs-card');
      const mid = box.width / 2;
      const cy = box.height / 2;
      cards.forEach((card, i) => {
        const [x, y] = centre(card);
        const side = i % 2 ? 1 : -1;
        run(
          card,
          [
            { transform: `translate(${mid - x}px, ${cy - y - 10}px) rotate(${side * 4}deg)`, opacity: 0 },
            { transform: `translate(${mid - x + side * 26}px, ${cy - y}px) rotate(${-side * 6}deg)`, opacity: 1, offset: 0.3 },
            { transform: `translate(${mid - x - side * 14}px, ${cy - y}px) rotate(${side * 3}deg)`, offset: 0.55 },
            { transform: 'none' },
          ],
          { duration: 600, easing: 'cubic-bezier(.45,0,.25,1)' },
        );
        const flipAt = 700 + i * 260 + (i === cards.length - 1 ? 300 : 0);
        run(card.firstChild, [{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0)' }], { delay: flipAt, duration: 440 });
        const fail = card.querySelector('.rtok-f');
        if (fail) {
          run(card, [{ transform: 'none' }, { transform: 'rotate(-2.5deg) scale(1.04)' }, { transform: 'rotate(2.5deg) scale(1.05)' }, { transform: 'none' }], { delay: flipAt - 380, duration: 360, fill: 'none' });
          for (const path of fail.querySelectorAll('.crack path')) run(path, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { delay: flipAt + 300, duration: 380 });
        }
        at(flipAt + 280, () => {
          burst(app, card, { kind: fail ? 'ember' : 'gold', count: fail ? 12 : 8, reach: 55, host: panel });
          if (fail) shake(app, card, { px: 3 });
        });
      });
      return 2200;
    },
    // Quest by quest, the track fills: three Successes, and Good is close.
    5: () => {
      const nodes = $$('.hs-node');
      nodes.forEach((node, i) => run(node, STAMP, { delay: 250 + i * 380, duration: 360, easing: BACK }));
      const last = nodes[nodes.length - 1];
      at(250 + (nodes.length - 1) * 380 + 220, () => {
        burst(app, last, { kind: 'gold', count: 16, reach: 80, host: panel });
        for (const node of $$('.qnode.is-success .qnode-disc')) run(node, [{ boxShadow: '0 0 0 0 rgba(240,213,140,0)' }, { boxShadow: '0 0 22px 4px rgba(240,213,140,.6)', offset: 0.4 }, { boxShadow: '0 0 0 0 rgba(240,213,140,0)' }], { duration: 900 });
      });
      return 2400;
    },
    // The Assassin takes aim at Merlin, and strikes.
    6: () => {
      const [ax] = centre($('.hs-assassin'));
      const [tx] = centre($('.hs-target'));
      run($('.hs-assassin'), [{ opacity: 0, transform: 'translateX(-16px)' }, { opacity: 1, transform: 'none' }], { duration: 400 });
      run($('.hs-merlin'), [{ opacity: 0, transform: 'translateX(16px)' }, { opacity: 1, transform: 'none' }], { delay: 150, duration: 400 });
      run($('.hs-target'), [{ opacity: 0, transform: `translateX(${ax - tx}px) rotate(-180deg) scale(.6)` }, { opacity: 1, transform: 'none' }], { delay: 500, duration: 700, easing: 'cubic-bezier(.45,0,.25,1)' });
      // The blade cuts up and across, through Merlin's centre.
      const blade = temp('hs-blade');
      const [mx, my] = centre($('.hs-merlin'));
      const half = 90;
      const a = (28 * Math.PI) / 180;
      blade.style.left = `${mx - half * Math.cos(a)}px`;
      blade.style.top = `${my + half * Math.sin(a)}px`;
      blade.style.width = `${half * 2}px`;
      // Easing per keyframe (as in CSS): a fast swipe, then a slow fade. An
      // easing for the whole animation would rush the fade too.
      run(
        blade,
        [
          { transform: 'rotate(-28deg) scaleX(0)', opacity: 1, easing: EASE },
          { transform: 'rotate(-28deg) scaleX(1)', opacity: 1, offset: 0.3 },
          { transform: 'rotate(-28deg) scaleX(1)', opacity: 0 },
        ],
        { delay: 1300, duration: 700, easing: 'linear' },
      );
      at(1420, () => {
        shake(app, $('.hs-merlin'), { px: 6 });
        burst(app, $('.hs-merlin'), { kind: 'ember', count: 14, reach: 70, host: panel });
      });
      return 2000;
    },
  };
  const ms = SCENES[step]?.() ?? 0;
  at(ms, () => panel.querySelectorAll('.hs-temp').forEach((el) => el.remove()));
  return () => {
    timers.forEach(clearTimeout);
    for (const a of panel.getAnimations?.({ subtree: true }) ?? []) a.cancel();
    panel.querySelectorAll('.hs-temp, .fx-layer').forEach((el) => el.remove());
  };
}
