// Sheets and modals (HANDOFF §3): role=dialog / alertdialog, aria-modal, focus
// trapped inside, Esc and a scrim tap close, focus returns to whatever opened
// them. One overlay at a time; opening another replaces it.

import { h, icon } from '../dom.js';
import { t } from '../i18n.js';
import { nextId } from './ui.js';

let current = null; // { root, close }

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trap(container, onEscape) {
  return (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onEscape();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...container.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
}

// Mount an overlay into the phone shell. `build(close)` returns the dialog element.
function open(host, build, { onClose } = {}) {
  closeOverlay();
  const opener = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    root.remove();
    if (current?.root === root) current = null;
    if (!current) host.classList.remove('has-overlay');
    onClose?.();
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
  };
  const dialog = build(close);
  const scrim = h('div', { class: 'scrim anim-fade', on: { click: close } });
  const root = h('div', { class: 'overlay' }, scrim, dialog);
  root.addEventListener('keydown', trap(dialog, close));
  host.append(root);
  host.classList.add('has-overlay'); // toasts move to the top, clear of the dialog's buttons
  current = { root, close, dialog };
  // Focus the first control (or the dialog itself) so screen readers land inside.
  requestAnimationFrame(() => {
    const target = dialog.querySelector('[data-autofocus]') || dialog.querySelector(FOCUSABLE) || dialog;
    target.focus({ preventScroll: true });
  });
  return close;
}

export function closeOverlay() {
  current?.close();
}

export function overlayOpen() {
  return !!current;
}

// Bottom sheet: title, optional subtitle, body nodes. Returns { close, body }.
// `body` may be a function (close) => nodes, for bodies with their own buttons.
// With `bare`, there's no header row: the body must contain an element with
// id `labelledBy` that names the dialog (A5).
export function openSheet(host, { title, subtitle, body, closeLabel, height, onClose, extraHead, footer, bare = false, labelledBy, bodyClass }) {
  const titleId = labelledBy || nextId('sheet-t');
  const bodyEl = h('div', { class: ['sheet-body', bodyClass] });
  const close = open(
    host,
    (close) => {
      bodyEl.append(...[typeof body === 'function' ? body(close) : body].flat(Infinity).filter(Boolean));
      return h(
        'div',
        { class: ['sheet', 'anim-sheet', height && `sheet-${height}`], role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' },
        h('div', { class: 'sheet-handle', 'aria-hidden': 'true' }),
        bare
          ? null
          : h(
              'div',
              { class: 'sheet-head' },
              h('div', { class: 'grow' }, h('h2', { class: 'd-m', id: titleId }, title), subtitle ? h('p', { class: 't-label muted' }, subtitle) : null),
              h('button', { type: 'button', class: 'icon-btn', 'aria-label': closeLabel || t('common.close'), on: { click: close } }, icon('cross')),
            ),
        extraHead || null,
        bodyEl,
        footer ? (typeof footer === 'function' ? footer(close) : footer) : null,
      );
    },
    { onClose },
  );
  return { close, body: bodyEl };
}

// Confirm modal (G5, G6, F2): role=alertdialog. `danger` styles it red; the
// dangerous action comes first and the safe one under it (HANDOFF §3).
export function openModal(host, { title, text, top, extra, actions, danger = false, onClose }) {
  const titleId = nextId('modal-t');
  const textId = nextId('modal-d');
  return open(
    host,
    (close) =>
      h(
        'div',
        {
          class: ['modal', 'anim-modal', danger && 'is-danger'],
          role: 'alertdialog',
          'aria-modal': 'true',
          'aria-labelledby': titleId,
          'aria-describedby': text ? textId : undefined,
          tabindex: '-1',
        },
        top || null,
        h('h2', { class: 'd-m', id: titleId }, title),
        text ? h('p', { class: 't-body muted pretty', id: textId }, text) : null,
        extra || null,
        h('div', { class: 'modal-actions' }, actions(close)),
      ),
    { onClose },
  );
}
