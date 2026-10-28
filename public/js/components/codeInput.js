// The room-code input (HANDOFF §3): ONE <input maxlength=4> drawn as four
// cells, so paste, autofill and the share link all just work. Only the 24
// letters codes use (A–Z without I and O) get through.

import { h } from '../dom.js';
import { CODE_ALPHABET } from '../../shared/protocol.js';

export function codeInput({ id, labelledBy, describedBy, value = '', error = false, onInput, onEnter }) {
  const cells = [0, 1, 2, 3].map(() => h('div', { class: 'code-cell' }));
  const input = h('input', {
    id,
    class: 'code-input',
    type: 'text',
    value,
    maxlength: 4,
    autocomplete: 'off',
    autocapitalize: 'characters',
    autocorrect: 'off',
    spellcheck: 'false',
    inputmode: 'text',
    enterkeyhint: 'next',
    'aria-labelledby': labelledBy,
    'aria-describedby': describedBy,
    'aria-invalid': error ? 'true' : undefined,
  });
  const wrap = h('div', { class: ['code', 'code-field', error && 'is-error'] }, h('div', { class: 'code-cells', 'aria-hidden': 'true' }, cells), input);

  function clean(raw) {
    return [...raw.toUpperCase()].filter((c) => CODE_ALPHABET.includes(c)).join('').slice(0, 4);
  }

  function paint() {
    const v = input.value;
    const focused = document.activeElement === input;
    cells.forEach((cell, i) => {
      cell.textContent = v[i] || '';
      cell.classList.toggle('is-filled', !!v[i]);
      cell.classList.toggle('is-active', focused && i === Math.min(v.length, 3) && v.length < 4);
    });
  }

  input.addEventListener('input', () => {
    const cleaned = clean(input.value);
    if (cleaned !== input.value) input.value = cleaned;
    paint();
    onInput?.(cleaned);
  });
  input.addEventListener('focus', paint);
  input.addEventListener('blur', paint);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onEnter?.();
  });
  input.value = clean(value);
  paint();

  return {
    el: wrap,
    input,
    setError(on) {
      wrap.classList.toggle('is-error', on);
      if (on) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    },
  };
}
