// A3 · Join, A4 · inline validation, A5 · "This game has already started".
//
// As soon as four letters are in, the room is looked up (room:check) so the
// player sees "Found Rowan's room · 6 players waiting" or why it won't work,
// before pressing Join. Server refusals land in the same message slots.

import { C2S, NAME_MAX } from '../../shared/protocol.js';
import { h, icon, replace } from '../dom.js';
import { t } from '../i18n.js';
import { prefs } from '../prefs.js';
import { codeInput } from '../components/codeInput.js';
import { button, iconButton, panel, textField, topbar, blockedButton } from '../components/ui.js';
import { openSheet } from '../components/overlay.js';
import { validName } from './home.js';

export function mount(app) {
  const form = app.joinForm;
  let code = form.code || '';
  let name = form.name || prefs.name || '';
  let codeError = form.errors.code || null;
  let nameError = form.errors.name || null;
  let found = null; // { text, seated } once the lookup succeeds
  let lookedUp = null;
  let lookupBusy = false;
  const remembered = !!prefs.name && name === prefs.name;

  const codeMsg = h('p', { class: 'field-msg', id: 'join-code-msg' });
  const codeField = h('div', { class: 'field' });
  const code4 = codeInput({
    id: 'join-code',
    labelledBy: 'join-code-l',
    describedBy: 'join-code-msg',
    value: code,
    error: !!codeError,
    onInput: (v) => {
      code = v;
      codeError = null;
      found = null;
      lookedUp = null;
      paint();
      lookup();
      if (v.length === 4 && !name) nameInput.focus();
    },
    onEnter: () => nameInput.focus(),
  });
  codeField.append(
    h('p', { class: 'field-label', id: 'join-code-l' }, h('span', {}, t('join.codeLabel')), h('span', { class: 'faint' }, t('join.codeHint'))),
    code4.el,
    codeMsg,
  );

  const nameSlot = h('div');
  let nameInput;
  const paintName = () => {
    const f = textField({
      id: 'join-name',
      label: t('field.name'),
      value: name,
      max: NAME_MAX,
      autocomplete: 'nickname',
      msg: remembered ? t('join.nameRemembered') : t('join.nameHint'),
      error: nameError,
      onInput: (v) => {
        name = v;
        if (nameError) {
          nameError = null;
          paintName();
          nameInput.focus();
        }
        paintDock();
      },
      onEnter: () => submit(),
    });
    nameInput = f.input;
    replace(nameSlot, f.el);
  };

  const dock = h('div', { class: 'dock' });

  const paintCode = () => {
    code4.setError(!!codeError);
    codeField.classList.toggle('is-error', !!codeError);
    codeField.classList.toggle('is-ok', !codeError && !!found);
    codeMsg.removeAttribute('role');
    if (codeError) {
      codeMsg.setAttribute('role', 'alert');
      replace(codeMsg, icon('warn', 'ic-16'), codeError);
    } else if (found) {
      replace(codeMsg, icon('check', 'ic-16'), found.text);
    } else if (code.length === 4 && lookupBusy) {
      replace(codeMsg, t('join.looking'));
    } else {
      replace(codeMsg);
    }
  };

  const problems = () => {
    const list = [];
    if (code.length < 4 || codeError) list.push('code');
    if (validName(name).error || nameError) list.push('name');
    return list;
  };

  const paintDock = () => {
    const missing = problems();
    const label = code.length === 4 ? t('join.submitCode', { code }) : t('join.submit');
    if (app.pending) {
      replace(dock, button({ label, key: 'join', extra: ['is-loading'], attrs: { 'aria-busy': 'true' } }));
      return;
    }
    if (!missing.length) {
      replace(dock, button({ label, key: 'join', onClick: submit }));
      return;
    }
    const highlighted = (codeError ? 1 : 0) + (nameError ? 1 : 0);
    replace(dock, blockedButton({ label, reason: highlighted ? t('join.fixFields', { n: highlighted }) : t('join.fillIn') }));
  };

  const paint = () => {
    paintCode();
    paintDock();
  };

  // Look the room up once four letters are in and we're connected.
  async function lookup() {
    if (code.length !== 4 || app.conn !== 'online' || lookedUp === code) return;
    lookedUp = code;
    lookupBusy = true;
    paintCode();
    const asked = code;
    const ack = await app.request(C2S.ROOM_CHECK, { code: asked, token: prefs.token || undefined });
    lookupBusy = false;
    if (asked !== code) return; // the player kept typing
    if (!ack.ok || !ack.exists) codeError = t('code.notFound', { code: asked });
    else if (ack.seated) found = { text: t('join.seated', { code: asked }), seated: true };
    else if (ack.started) {
      codeError = t('code.started');
      showStarted();
    }
    else if (ack.full) codeError = t('code.full', { code: asked, n: ack.players });
    else found = { text: t('join.found', { host: ack.hostName, n: ack.players }) };
    paint();
  }

  function submit() {
    const v = validName(name);
    if (v.error) {
      nameError = v.error;
      paintName();
      paint();
      nameInput.focus();
      return;
    }
    if (code.length !== 4) {
      code4.input.focus();
      return;
    }
    app.joinRoom(code, v.name);
  }

  // A5: the room is mid-game and this phone has no seat in it.
  function showStarted() {
    openSheet(app.root, {
      bare: true,
      labelledBy: 'started-t',
      bodyClass: 'sheet-center',
      body: (close) => [
        h('span', { class: 'modal-icon modal-icon-72' }, icon('hourglass', 'ic-40')),
        h('h2', { class: 'd-m', id: 'started-t' }, t('started.title')),
        h('p', { class: 't-body muted pretty' }, t('started.text', { code })),
        panel([icon('refresh', 'gold'), h('p', { class: 't-label muted grow' }, t('started.rejoin'))], { extra: ['row', 'full-width', 'text-left'] }),
        h(
          'div',
          { class: 'col full-width' },
          button({ label: t('started.another'), onClick: () => { close(); code = ''; code4.input.value = ''; code4.input.dispatchEvent(new Event('input')); code4.input.focus(); } }),
          button({ label: t('ended.home'), kind: 'ghost', md: true, onClick: () => { close(); app.go('home'); } }),
        ),
      ],
    });
  }

  const el = h(
    'div',
    { class: 'screen-body' },
    topbar(iconButton({ ic: 'left', label: t('join.back'), onClick: () => app.go('home') }), h('span', { class: 't-body b' }, t('join.title'))),
    h(
      'div',
      { class: 'content join' },
      codeField,
      nameSlot,
      panel([icon('info', 'gold'), h('p', { class: 't-label muted' }, t('join.linkHint'))], { extra: ['row', 'row-top'] }),
    ),
    dock,
  );

  paintName();
  paint();
  lookup();
  if (form.started) {
    form.started = false;
    showStarted();
  }
  requestAnimationFrame(() => (code.length < 4 ? code4.input : nameInput).focus({ preventScroll: true }));

  return {
    el,
    update: () => {
      paintDock();
      lookup();
    },
  };
}
