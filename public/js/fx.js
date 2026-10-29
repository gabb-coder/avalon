// Decorative motion: sparks, embers, smoke, water ripples, the slash, the
// screen shake and the candlelit background.
//
// PRIVACY: nothing here carries information. Every effect is triggered by
// something the whole table already sees (a public reveal, a vote result,
// the Lady's choice), and looks the same for every role, so a neighbour
// glancing at a phone learns nothing from it.
//
// Reduced motion (the phone's setting or Menu → Reduce motion) skips every
// effect: callers check calm() first, and each screen's static end state is
// what reduced motion shows anyway.

import { h, icon } from './dom.js';

export const calm = (app) => app.root.classList.contains('reduce-motion');

const rand = (a, b) => a + Math.random() * (b - a);

// Effects sit in their own layer over the screen: no pointer events, hidden
// from screen readers, removed when they finish (or on Skip / screen change).
function layer(app, ms) {
  const el = h('div', { class: 'fx-layer', 'aria-hidden': 'true' });
  app.root.append(el);
  setTimeout(() => el.remove(), ms);
  return el;
}

export function clearFx(app) {
  app.root.querySelectorAll('.fx-layer').forEach((el) => el.remove());
}

// Where an element's centre is, relative to the phone.
function centreOf(app, el) {
  const r = el.getBoundingClientRect();
  const p = app.root.getBoundingClientRect();
  return { x: r.left - p.left + r.width / 2, y: r.top - p.top + r.height / 2 };
}

// Timers for a reveal's effects, all cancelled together by Skip or on leaving.
export function timeline(app) {
  const timers = new Set();
  return {
    at(ms, fn) {
      const id = setTimeout(() => {
        timers.delete(id);
        if (app.root.isConnected) fn();
      }, ms);
      timers.add(id);
    },
    stop() {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      clearFx(app);
    },
  };
}

// A burst of particles thrown out from an element: gold sparks (Success,
// Approved, Good) or embers that fall away (Fail, Evil). A ring of light
// spreads behind them.
export function burst(app, el, { kind = 'gold', count = 14, reach = 90 } = {}) {
  if (calm(app) || !el.isConnected) return;
  const { x, y } = centreOf(app, el);
  const fx = layer(app, 1400);
  const wave = h('span', { class: ['fx-wave', `fx-wave-${kind}`] });
  wave.style.left = `${x}px`;
  wave.style.top = `${y}px`;
  fx.append(wave);
  wave.animate([{ transform: 'translate(-50%, -50%) scale(.2)', opacity: 0.9 }, { transform: 'translate(-50%, -50%) scale(2.6)', opacity: 0 }], { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
  for (let i = 0; i < count; i++) {
    const p = h('span', { class: ['fx-p', `fx-p-${kind}`] });
    const size = rand(3, 7);
    p.style.width = p.style.height = `${size}px`;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    fx.append(p);
    const a = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
    const d = rand(reach * 0.45, reach);
    const dx = Math.cos(a) * d;
    const dy = Math.sin(a) * d;
    // Embers sag as they cool; sparks keep rising a little.
    const fall = kind === 'ember' ? rand(30, 60) : rand(-30, -10);
    p.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx * 0.8}px), calc(-50% + ${dy * 0.8}px)) scale(.9)`, opacity: 1, offset: 0.6 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + fall}px)) scale(.3)`, opacity: 0 },
      ],
      { duration: rand(650, 1050), easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
    );
  }
}

// Gold sparks rising from the bottom of the screen (Good wins).
export function riseSparks(app, { count = 34, ms = 2600 } = {}) {
  if (calm(app)) return;
  const fx = layer(app, ms + 900);
  const { width, height } = app.root.getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const p = h('span', { class: ['fx-p', 'fx-p-gold'] });
    const size = rand(3, 7);
    p.style.width = p.style.height = `${size}px`;
    p.style.left = `${rand(0.04, 0.96) * width}px`;
    p.style.top = `${height + 10}px`;
    fx.append(p);
    const up = rand(0.45, 0.95) * height;
    const sway = rand(-40, 40);
    p.animate(
      [
        { transform: 'translate(0, 0)', opacity: 0 },
        { transform: `translate(${sway * 0.4}px, ${-up * 0.3}px)`, opacity: 1, offset: 0.2 },
        { transform: `translate(${sway}px, ${-up}px) scale(.4)`, opacity: 0 },
      ],
      { duration: rand(ms * 0.6, ms), delay: rand(0, ms * 0.3), easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'both' },
    );
  }
}

// Crimson smoke rolling in from the edges, then thinning out (Evil wins).
export function smoke(app, { ms = 2800 } = {}) {
  if (calm(app)) return;
  const fx = layer(app, ms + 200);
  const { width, height } = app.root.getBoundingClientRect();
  for (let i = 0; i < 6; i++) {
    const puff = h('span', { class: 'fx-smoke' });
    const size = rand(0.7, 1.1) * width;
    puff.style.width = puff.style.height = `${size}px`;
    const left = i % 2 === 0;
    puff.style.left = `${(left ? -0.55 : 0.45) * width}px`;
    puff.style.top = `${rand(0.15, 0.85) * height - size / 2}px`;
    fx.append(puff);
    const drift = (left ? 1 : -1) * rand(0.15, 0.3) * width;
    puff.animate(
      [
        { transform: 'translateX(0) scale(.7)', opacity: 0 },
        { transform: `translateX(${drift * 0.6}px) scale(.95)`, opacity: 0.75, offset: 0.4 },
        { transform: `translateX(${drift}px) scale(1.15)`, opacity: 0 },
      ],
      { duration: ms, delay: i * 90, easing: 'ease-out', fill: 'both' },
    );
  }
  // A few embers float up through it.
  for (let i = 0; i < 14; i++) {
    const p = h('span', { class: ['fx-p', 'fx-p-ember'] });
    p.style.width = p.style.height = `${rand(3, 5)}px`;
    p.style.left = `${rand(0.05, 0.95) * width}px`;
    p.style.top = `${height + 6}px`;
    fx.append(p);
    p.animate([{ transform: 'translateY(0)', opacity: 0 }, { opacity: 1, offset: 0.25 }, { transform: `translate(${rand(-30, 30)}px, ${-rand(0.3, 0.7) * height}px)`, opacity: 0 }], {
      duration: rand(1600, 2600),
      delay: rand(0, 900),
      easing: 'ease-out',
      fill: 'both',
    });
  }
}

// Water rings spreading from an element, or from the middle of the screen.
export function ripple(app, el = null, { rings = 3, size = 0 } = {}) {
  if (calm(app)) return;
  const fx = layer(app, 1900);
  const box = app.root.getBoundingClientRect();
  const { x, y } = el?.isConnected ? centreOf(app, el) : { x: box.width / 2, y: box.height / 2 };
  const scale = (size || Math.max(box.width, box.height) * 1.2) / 100;
  for (let i = 0; i < rings; i++) {
    const ring = h('span', { class: 'fx-ripple' });
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    fx.append(ring);
    ring.animate([{ transform: 'translate(-50%, -50%) scale(.05)', opacity: 0.85 }, { transform: `translate(-50%, -50%) scale(${scale})`, opacity: 0 }], {
      duration: 1300,
      delay: i * 200,
      easing: 'cubic-bezier(.2,.7,.3,1)',
      fill: 'both',
    });
  }
}

// A short jolt, for the moment something lands hard.
export function shake(app, el, { px = 6 } = {}) {
  if (calm(app) || !el?.isConnected) return;
  el.animate(
    [{ transform: 'none' }, { transform: `translateX(${-px}px)` }, { transform: `translateX(${px * 0.8}px)` }, { transform: `translateX(${-px * 0.5}px)` }, { transform: `translateX(${px * 0.25}px)` }, { transform: 'none' }],
    { duration: 340, easing: 'ease-out' },
  );
}

// The Assassin's blade: a crimson slash across the screen and a flash.
export function slash(app) {
  if (calm(app)) return;
  const fx = layer(app, 1000);
  const flash = h('span', { class: 'fx-flash' });
  const blade = h('span', { class: 'fx-slash' });
  fx.append(flash, blade);
  flash.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 650, easing: 'ease-out', fill: 'forwards' });
  blade.animate(
    [
      { transform: 'translate(-50%, -50%) rotate(-32deg) scaleX(0)', opacity: 1 },
      { transform: 'translate(-50%, -50%) rotate(-32deg) scaleX(1)', opacity: 1, offset: 0.35 },
      { transform: 'translate(-50%, -50%) rotate(-32deg) scaleX(1)', opacity: 0 },
    ],
    { duration: 620, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
  );
}

// The candlelit background of the entry screens, lobby and night: a warm glow
// that flickers, and embers drifting up. Pure CSS animation; reduced motion
// stops it and leaves the still glow.
export function ambience() {
  const embers = [];
  for (let i = 0; i < 12; i++) {
    const e = h('span', { class: 'amb-ember' });
    e.style.left = `${rand(3, 97)}%`;
    e.style.setProperty('--size', `${rand(2, 4).toFixed(1)}px`);
    e.style.setProperty('--dx', `${rand(-40, 40).toFixed(0)}px`);
    e.style.animationDuration = `${rand(9, 16).toFixed(1)}s`;
    e.style.animationDelay = `${-rand(0, 16).toFixed(1)}s`; // already on their way up
    embers.push(e);
  }
  return h('div', { class: 'ambience', 'aria-hidden': 'true' }, h('span', { class: 'amb-glow' }), embers);
}

// A face-down card back (quest cards, the strike's reveal). Identical for
// every card, so it says nothing.
export function cardBack(extra = []) {
  return h('div', { class: ['rtok', 'rtok-back', ...extra] }, icon('logo'));
}

// The crack drawn across a Fail card.
export function crack() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 72 96');
  svg.setAttribute('class', 'crack');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ['M40 0 L33 20 L42 37 L29 58 L39 74 L34 96', 'M42 37 L56 44 L64 41', 'M29 58 L16 63']) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('pathLength', '1');
    svg.append(path);
  }
  return svg;
}
