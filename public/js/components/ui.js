// Basic building blocks, one per component in docs/HANDOFF.md §3, using the
// rt.css class names as they are.

import { h, icon, avatar } from '../dom.js';
import { t } from '../i18n.js';

let uid = 0;
export const nextId = (prefix = 'id') => `${prefix}-${++uid}`;

// Button. A disabled button carries its reason in a .btn-note linked by
// aria-describedby (HANDOFF: "Disabled reason linked with aria-describedby").
export function button({ label, kind = 'primary', ic, block = true, md = false, disabled = false, onClick, key, extra = [], attrs = {} }) {
  return h(
    'button',
    {
      type: 'button',
      class: ['btn', `btn-${kind}`, block && 'btn-block', md && 'btn-md', ...extra],
      disabled,
      key,
      on: onClick ? { click: onClick } : undefined,
      ...attrs,
    },
    ic ? icon(ic) : null,
    label,
  );
}

// A disabled primary button plus its reason underneath.
export function blockedButton({ label, reason, ic = 'info', tone }) {
  const id = nextId('why');
  return [
    h('button', { type: 'button', class: 'btn btn-primary btn-block', disabled: true, 'aria-describedby': id }, label),
    h('p', { class: ['btn-note', tone], id }, icon(ic, 'ic-16'), reason),
  ];
}

export function note(text, { ic, id, extra = [] } = {}) {
  return h('p', { class: ['btn-note', ...extra], id }, ic ? icon(ic, 'ic-16') : null, text);
}

export function iconButton({ ic, label, onClick, framed = false, danger = false, key }) {
  return h(
    'button',
    { type: 'button', class: ['icon-btn', framed && 'framed', danger && 'danger'], 'aria-label': label, key, on: { click: onClick } },
    icon(ic),
  );
}

// Keeps the topbar's three-slot layout when a side has nothing to show.
export const spacer = () => h('span', { class: 'topbar-spacer', 'aria-hidden': 'true' });

export function topbar(left, middle, right) {
  return h('div', { class: 'topbar' }, left || spacer(), middle || h('span'), right || spacer());
}

export function roomTag(code) {
  return h('span', { class: 'room-tag' }, t('room.tag', { code }));
}

// Status bar: phase · main line · waiting-on, every time (HANDOFF §3).
export function statusBar({ phase, phaseIcon, right, main, wait, tone, live = true }) {
  return h(
    'div',
    { class: ['status', tone && `is-${tone}`], role: 'status', 'aria-live': live ? 'polite' : undefined },
    h('div', { class: 'status-top' }, h('span', { class: 'status-phase' }, phaseIcon ? icon(phaseIcon, 'ic-16') : null, phase), right || null),
    h('p', { class: 'status-main' }, main),
    wait ? h('div', { class: 'status-wait' }, wait) : null,
  );
}

export function dots(label) {
  return label
    ? h('span', { class: 'dots', role: 'img', 'aria-label': label }, h('i'), h('i'), h('i'))
    : h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
}

export function chip(text, { kind, ic } = {}) {
  return h('span', { class: ['chip', kind && `chip-${kind}`] }, ic ? icon(ic) : null, text);
}

// Teams are never shown by colour alone: Good = round mark + word, Evil = thorn + word.
export function teamChip(team, text = t(`team.${team}`)) {
  return chip(text, { kind: team, ic: team });
}

export function teamTag(team) {
  return h('span', { class: ['team-tag', team] }, icon(team), t(`team.${team}`));
}

export function privateLabel() {
  return h('span', { class: 'private', role: 'note', 'aria-label': t('private.aria') }, icon('lock'), t('private.label'));
}

export function privateBand() {
  return h('div', { class: 'private-band', role: 'note' }, icon('lock'), t('private.band'));
}

// A static player row (lobby lists). For selectable rows see selectRow().
export function prow({ name, meta, you, off, end, extra = [] }) {
  return h(
    'div',
    { class: ['prow', off && 'is-off', ...extra] },
    avatar(name, { you, off }),
    h('span', { class: 'prow-name' }, h('span', { text: name }), meta ? h('span', { class: 'prow-meta' }, meta) : null),
    end ? h('span', { class: 'prow-end' }, end) : null,
  );
}

export function panel(children, { gold = false, extra = [], attrs = {} } = {}) {
  return h('div', { class: ['panel', gold && 'panel-gold', ...extra], ...attrs }, children);
}

// Segmented choice. role: 'tab' or 'radio'.
export function seg({ options, value, onChange, role = 'radio', label, labelledBy, disabled = false, extra = [] }) {
  const isTab = role === 'tab';
  return h(
    'div',
    { class: ['seg', ...extra], role: isTab ? 'tablist' : 'radiogroup', 'aria-label': label, 'aria-labelledby': labelledBy },
    options.map((o) =>
      h(
        'button',
        {
          type: 'button',
          class: ['seg-opt', o.value === value && 'is-on'],
          role,
          key: `seg-${o.value}`,
          [isTab ? 'aria-selected' : 'aria-checked']: String(o.value === value),
          disabled,
          on: { click: () => o.value !== value && onChange(o.value) },
        },
        o.label,
      ),
    ),
  );
}

// A switch inside a labelled row (B1 role toggles, E4 settings).
export function toggleRow({ id = nextId('sw'), ic, tone = 'gold', title, desc, checked, disabled = false, onChange }) {
  return h(
    'div',
    { class: 'toggle-row' },
    h(
      'label',
      { for: id },
      ic ? icon(ic, tone) : null,
      h('span', { class: 'grow' }, h('span', { class: 't-body b' }, title), desc ? [h('br'), h('span', { class: 't-label muted' }, desc)] : null),
    ),
    h('input', {
      class: 'switch',
      type: 'checkbox',
      role: 'switch',
      id,
      key: id,
      checked,
      disabled,
      on: { change: (e) => onChange(e.target.checked) },
    }),
  );
}

// Text field with label, character counter and message slot (HANDOFF §3 text input).
export function textField({ id = nextId('f'), label, value = '', max, placeholder, autocomplete, msg, error, onInput, onEnter }) {
  const msgId = `${id}-msg`;
  const counter = max ? h('span', { class: ['tnum', error ? null : 'faint'] }, `${[...value].length}/${max}`) : null;
  const input = h('input', {
    id,
    class: 'input',
    value,
    maxlength: max,
    placeholder,
    autocomplete,
    autocapitalize: 'words',
    spellcheck: 'false',
    enterkeyhint: 'go',
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': msg || error ? msgId : undefined,
    on: {
      input: (e) => {
        if (counter) counter.textContent = `${[...e.target.value].length}/${max}`;
        onInput?.(e.target.value);
      },
      keydown: (e) => {
        if (e.key === 'Enter') onEnter?.();
      },
    },
  });
  return {
    el: h(
      'div',
      { class: ['field', error && 'is-error'] },
      h('label', { class: 'field-label', for: id }, h('span', {}, label), counter),
      input,
      error || msg
        ? h('p', { class: 'field-msg', id: msgId, role: error ? 'alert' : undefined }, error ? icon('warn', 'ic-16') : null, error || msg)
        : null,
    ),
    input,
  };
}

// The waiting grid (C3, D6, D11): who is done and who we're waiting on.
export function waitGrid(entries) {
  return h(
    'div',
    { class: 'waitgrid' },
    entries.map((e) =>
      h(
        'div',
        { class: ['wcell', e.done ? 'is-done' : 'is-pending', e.highlight && 'is-next'] },
        avatar(e.name, { size: 32, you: e.you, off: e.off }),
        h('span', { class: 'nm', text: e.name }),
        h('span', { class: 'state' }, e.done ? [icon(e.doneIcon || 'check', 'ic-14'), e.doneText] : dots(e.pendingText)),
      ),
    ),
  );
}

export function progress(fraction) {
  const bar = h('i');
  bar.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
  return h('div', { class: 'progress', 'aria-hidden': 'true' }, bar);
}
