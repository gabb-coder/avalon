// A2 · Home: Create room, Join room, How to play. Remembers the last name and
// offers "Back to room KQVX?" when this phone still holds a seat somewhere.
//
// Addition to the design: A2 always shows a remembered name ("Playing as
// Rowan · Change"). For a first visit, or after "Change", the same name field
// as A3 appears in that panel's place.

import { C2S, NAME_MAX } from '../../shared/protocol.js';
import { h, icon, avatar, replace } from '../dom.js';
import { t } from '../i18n.js';
import { prefs } from '../prefs.js';
import { button, iconButton, panel, textField, topbar } from '../components/ui.js';
import { GAME_TITLE } from '../../config.js';
import { openSettings, openHowTo } from './sheets.js';
import { ambience } from '../fx.js';

export function validName(raw) {
  const name = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!name) return { name, error: t('name.empty') };
  if ([...name].length > NAME_MAX) return { name, error: t('name.tooLong') };
  return { name, error: null };
}

export function mount(app) {
  let editing = !prefs.name;
  let draft = prefs.name || '';
  let nameError = null;
  let rejoin = null; // { code } when this phone still has a held seat
  let checkedFor = null;

  const namePanel = h('div', { class: 'home-name' });
  const rejoinSlot = h('div', { class: 'home-rejoin' });

  const paintName = () => {
    if (!editing) {
      replace(
        namePanel,
        panel(
          [
            avatar(prefs.name, { size: 48, you: true }),
            h('div', { class: 'grow' }, h('p', { class: 't-label muted' }, t('home.playingAs')), h('p', { class: 't-title', text: prefs.name })),
            button({ label: t('home.change'), kind: 'ghost', md: true, block: false, extra: ['gold-hi'], key: 'change', onClick: () => { editing = true; paintName(); namePanel.querySelector('input')?.focus(); } }),
          ],
          { extra: ['row', 'home-panel'] },
        ),
      );
      return;
    }
    const field = textField({
      id: 'home-name',
      label: t('field.name'),
      value: draft,
      max: NAME_MAX,
      autocomplete: 'nickname',
      msg: t('home.nameHint'),
      error: nameError,
      onInput: (v) => {
        draft = v;
        if (nameError) {
          nameError = null;
          paintName();
          namePanel.querySelector('input')?.focus();
        }
      },
      onEnter: () => saveName(),
    });
    replace(
      namePanel,
      h(
        'div',
        { class: 'col home-field' },
        field.el,
        prefs.name ? button({ label: t('home.saveName'), kind: 'secondary', md: true, key: 'save', onClick: () => saveName() }) : null,
      ),
    );
  };

  // Returns the saved name, or null after showing why it isn't valid.
  const saveName = () => {
    const { name, error } = validName(draft);
    if (error) {
      nameError = error;
      paintName();
      namePanel.querySelector('input')?.focus();
      return null;
    }
    prefs.name = name;
    draft = name;
    editing = false;
    nameError = null;
    paintName();
    return name;
  };

  const paintRejoin = () =>
    replace(
      rejoinSlot,
      rejoin
        ? panel(
            [
              icon('refresh', 'gold'),
              h(
                'div',
                { class: 'grow' },
                h('p', { class: 't-body b' }, t('home.backTo', { code: rejoin.code })),
                h('p', { class: 't-label muted' }, t('home.seatHeld', { n: Math.round((app.hello?.seatHoldMs || 300000) / 60000) })),
              ),
              button({ label: t('home.rejoin'), kind: 'secondary', md: true, block: false, key: 'rejoin', onClick: () => app.rejoin() }),
            ],
            { gold: true, extra: ['row', 'home-panel'] },
          )
        : null,
    );

  // Ask the server whether this phone still has a seat in its last room.
  const checkRejoin = async () => {
    const s = app.session;
    if (!s || s.active || app.conn !== 'online' || checkedFor === s.code) return;
    checkedFor = s.code;
    const ack = await app.request(C2S.ROOM_CHECK, { code: s.code, token: prefs.token || undefined });
    if (ack.ok && ack.exists && ack.seated) rejoin = { code: s.code };
    else {
      rejoin = null;
      prefs.session = null;
    }
    paintRejoin();
  };

  const create = () => {
    if (app.pending) return;
    const name = editing ? saveName() : prefs.name;
    if (name) {
      app.createRoom(name);
      createBtn.classList.add('is-loading');
      createBtn.setAttribute('aria-busy', 'true');
    }
  };
  const createBtn = button({ label: t('home.create'), ic: 'plus', key: 'create', onClick: () => create() });

  const el = h(
    'div',
    { class: 'screen-body' },
    ambience(),
    topbar(null, null, iconButton({ ic: 'sliders', label: t('home.settings'), onClick: () => openSettings(app) })),
    h(
      'div',
      { class: 'content content-center home' },
      icon('logo', 'logo-112'),
      h('h1', { class: 'd-l title-caps' }, GAME_TITLE.toLocaleUpperCase()),
      h('p', { class: 't-body muted pretty home-intro' }, t('home.intro')),
      namePanel,
      rejoinSlot,
    ),
    h(
      'div',
      { class: 'dock' },
      createBtn,
      button({ label: t('home.join'), kind: 'secondary', ic: 'arrow', key: 'join', onClick: () => app.go('join') }),
      button({ label: t('home.howTo'), kind: 'ghost', md: true, ic: 'book', key: 'howto', onClick: () => openHowTo(app) }),
    ),
  );

  paintName();
  paintRejoin();
  checkRejoin();
  return {
    el,
    update: () => {
      if (!app.pending) {
        createBtn.classList.remove('is-loading');
        createBtn.removeAttribute('aria-busy');
      }
      checkRejoin();
    },
  };
}
