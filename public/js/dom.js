// A tiny DOM builder. All text goes in through textContent / text nodes, never
// innerHTML, so player names can't inject markup. Styles go through the CSSOM
// (el.style.setProperty), which the Content Security Policy allows; inline
// style attributes are not used anywhere.
//
//   h('button', { class: 'btn btn-primary', on: { click }, 'aria-label': '…' }, icon('check'), 'Lock in')

const PROPS = new Set(['value', 'checked', 'disabled', 'hidden', 'tabIndex', 'type']);

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'style') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else if (k === 'key') el.dataset.key = v;
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// A mask icon from rt.css: icon('check') -> <span class="ic i-check" aria-hidden="true">
export function icon(name, ...extra) {
  return h('span', { class: ['ic', `i-${name}`, ...extra], 'aria-hidden': 'true' });
}

// Replace a container's children. If focus was on an element with a data-key
// inside it, focus the new element with the same key, so re-rendering a list
// (e.g. after a server update) doesn't throw keyboard and screen-reader users out.
export function replace(container, ...children) {
  const active = document.activeElement;
  const key = active && container.contains(active) ? active.dataset.key : null;
  container.replaceChildren();
  append(container, children);
  if (key) container.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
}

// The first letter of a name, for avatars (works for any script, including emoji).
export function initial(name) {
  return [...String(name || '?').trim()][0]?.toLocaleUpperCase() || '?';
}

// Avatar: a neutral ink disc with an initial. Decorative: the name next to it
// carries the meaning, so screen readers skip it.
export function avatar(name, { size, you, off, extra = [] } = {}) {
  return h(
    'span',
    { class: ['av', size && `av-${size}`, you && 'is-you', off && 'is-off', ...extra], 'aria-hidden': 'true' },
    initial(name),
  );
}
