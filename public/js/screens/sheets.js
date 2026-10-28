// Sheets and dialogs used from several screens:
// B4 role glossary, E4 menu (and its Display part as Home's settings),
// E3 how to play, the host hand-over picker (G4), G6 kick, G5 leave.

import { C2S } from '../../shared/protocol.js';
import { h, icon, avatar, replace } from '../dom.js';
import { t } from '../i18n.js';
import { prefs } from '../prefs.js';
import { openSheet, openModal, closeOverlay } from '../components/overlay.js';
import { toast } from '../components/toast.js';
import { button, seg, toggleRow, panel, teamChip, note } from '../components/ui.js';
import { ROLE_TEAM } from '../components/roleCard.js';

// ---------- B4 · Role glossary ----------

const GLOSSARY = ['merlin', 'percival', 'servant', 'assassin', 'morgana', 'mordred', 'minion', 'oberon', 'lady'];

// Which glossary entries are in this game, from the public setup summary.
function inGame(setup) {
  const set = new Set([...setup.goodRoles, ...setup.evilRoles]);
  if (setup.servants > 0) set.add('servant');
  if (setup.minions > 0) set.add('minion');
  if (setup.lady) set.add('lady');
  return GLOSSARY.filter((r) => set.has(r));
}

function glossaryEntry(id, config) {
  const team = id === 'lady' ? 'good' : ROLE_TEAM[id];
  const ic = id === 'lady' ? 'lady' : id;
  // Merlin's night line depends on the Oberon setting.
  const seesKey = id === 'merlin' && config.oberon && !config.oberonSeenByMerlin ? 'glossary.merlin.seesNoOberon' : `glossary.${id}.sees`;
  return panel(
    [
      h('span', { class: `frame-${team}` }, icon(ic, 'ic-28')),
      h(
        'div',
        { class: 'glossary-text' },
        h(
          'div',
          { class: 'row glossary-top' },
          h('p', { class: 't-title glossary-name' }, t(id === 'lady' ? 'lady.name' : `role.${id}.name`)),
          id === 'lady' ? null : teamChip(team),
        ),
        h('p', { class: 't-body pretty' }, t(`glossary.${id}.ability`)),
        h('p', { class: 't-label muted' }, icon('eye', 'ic-14', 'inline-ic'), ' ', t('glossary.atNight', { sees: t(seesKey) })),
      ),
    ],
    { extra: ['glossary-entry'] },
  );
}

export function openGlossary(app) {
  let showAll = false;
  const view = app.view;
  const ids = inGame(view.setup);
  const list = h('div', { class: 'col glossary-list' });
  const tabs = h('div', { class: 'sheet-tabs' });
  const paint = () => {
    replace(
      tabs,
      seg({
        role: 'tab',
        label: t('glossary.title'),
        value: showAll ? 'all' : 'in',
        options: [
          { value: 'in', label: t('glossary.inGame', { n: view.players.length }) },
          { value: 'all', label: t('glossary.all') },
        ],
        onChange: (v) => {
          showAll = v === 'all';
          paint();
        },
      }),
    );
    replace(list, (showAll ? GLOSSARY : ids).map((id) => glossaryEntry(id, view.config)));
  };
  paint();
  openSheet(app.root, { title: t('glossary.title'), closeLabel: t('glossary.close'), extraHead: tabs, body: list, height: 'tall' });
}

// ---------- E4 · Display settings (part of the Menu; Home's settings button) ----------

function displaySection(app) {
  const ts = h('div');
  const paintTs = () =>
    replace(
      ts,
      seg({
        labelledBy: 'ts-l',
        value: prefs.textScale,
        extra: ['seg-3'],
        options: [
          { value: 1, label: '100%' },
          { value: 1.15, label: '115%' },
          { value: 1.3, label: '130%' },
        ],
        onChange: (v) => {
          prefs.textScale = v;
          app.applyDisplayPrefs();
          paintTs();
        },
      }),
    );
  paintTs();
  return [
    h('p', { class: 'eyebrow menu-eyebrow' }, t('menu.display')),
    panel([h('p', { class: 't-body b', id: 'ts-l' }, t('menu.textSize')), ts], { extra: ['col'] }),
    panel(
      [
        toggleRow({
          ic: 'refresh',
          title: t('menu.reduceMotion'),
          desc: t('menu.reduceMotionDesc'),
          checked: prefs.reduceMotion,
          onChange: (on) => {
            prefs.reduceMotion = on;
            app.applyDisplayPrefs();
          },
        }),
        toggleRow({
          ic: 'hold',
          title: t('menu.vibrate'),
          desc: t('menu.vibrateDesc'),
          checked: prefs.vibrate,
          onChange: (on) => {
            prefs.vibrate = on;
          },
        }),
      ],
      { extra: ['panel-rows'] },
    ),
  ];
}

export function openSettings(app) {
  openSheet(app.root, { title: t('settings.title'), body: displaySection(app) });
}

// A Menu row: an <a>-like full-width button with icon, title, meta and chevron.
function menuRow({ ic, title, meta, onClick }) {
  return h(
    'button',
    { type: 'button', class: 'prow menu-row', on: { click: onClick } },
    icon(ic, 'gold'),
    h('span', { class: 'prow-name' }, h('span', {}, title), meta ? h('span', { class: 'prow-meta' }, meta) : null),
    icon('right', 'faint', 'menu-chevron'),
  );
}

// E4 · Menu. Items for later milestones (vote history, ending the game) are
// added when those features land.
export function openMenu(app) {
  const v = app.view;
  const isHost = v.hostId === v.you;
  const body = (close) => [
    menuRow({ ic: 'book', title: t('menu.howTo'), meta: t('menu.howToMeta'), onClick: () => openHowTo(app) }),
    menuRow({ ic: 'cards', title: t('menu.roles'), meta: t('menu.rolesMeta'), onClick: () => openGlossary(app) }),
    ...displaySection(app),
    isHost
      ? [
          h('p', { class: 'eyebrow menu-eyebrow' }, t('menu.host')),
          panel(
            button({ label: t('menu.handHost'), kind: 'ghost', md: true, ic: 'crown', extra: ['menu-action'], onClick: () => openHostPicker(app) }),
            { extra: ['menu-actions'] },
          ),
        ]
      : null,
    button({
      label: t('menu.leave'),
      kind: 'danger',
      ic: 'leave',
      extra: ['menu-leave'],
      onClick: () => (v.phase === 'lobby' ? (close(), app.leaveRoom()) : openLeaveConfirm(app)),
    }),
  ];
  openSheet(app.root, {
    title: t('menu.title'),
    subtitle: t('menu.subtitle', { code: v.code, n: v.players.length }),
    closeLabel: t('menu.close'),
    body,
  });
}

// ---------- E3 · How to play ----------

const HOWTO_STEPS = 6;

function howToArt(step) {
  const frame = (team, ic) => h('span', { class: `frame-${team} frame-72` }, icon(ic, 'ic-40'));
  switch (step) {
    case 1:
      return [
        h('div', { class: 'col howto-team' }, frame('good', 'good'), h('span', { class: 't-body b good' }, t('team.good'))),
        h('span', { class: 'd-m faint' }, t('howto.vs')),
        h('div', { class: 'col howto-team' }, frame('evil', 'evil'), h('span', { class: 't-body b evil' }, t('team.evil'))),
      ];
    case 2:
      return [
        h('span', { class: 'tok tok-leader tok-56' }, icon('standard', 'ic-32')),
        icon('arrow', 'gold'),
        h('div', { class: 'stack' }, ['I', 'T', 'M'].map((c) => avatar(c, { size: 48, extra: ['av-ring'] }))),
      ];
    case 3:
      return [
        h('span', { class: 'vm vm-a vm-72' }, icon('check', 'ic-40')),
        h('span', { class: 'vm vm-r vm-72' }, icon('cross', 'ic-40')),
      ];
    case 4:
      return ['s', 's', 'f'].map((c) =>
        h('div', { class: ['rtok', c === 's' ? 'rtok-s' : 'rtok-f'] }, icon(c === 's' ? 'success' : 'fail'), t(c === 's' ? 'card.success' : 'card.fail')),
      );
    case 5:
      return h(
        'div',
        { class: 'qtrack howto-track' },
        ['success', 'fail', 'success', 'current', 'next'].map((s, i) =>
          h(
            'div',
            { class: ['qnode', s === 'success' && 'is-success', s === 'fail' && 'is-fail', s === 'current' && 'is-current'] },
            h('div', { class: 'qnode-disc' }, s === 'success' || s === 'fail' ? icon(s, 'ic-28') : String(i + 1)),
          ),
        ),
      );
    default:
      return [frame('evil', 'assassin'), icon('target', 'evil', 'ic-32'), frame('good', 'merlin')];
  }
}

export function openHowTo(app) {
  let step = 1;
  const content = h('div', { class: 'col howto' });
  const footer = h('div', { class: 'dock dock-row howto-dock' });
  let closeSheet = () => {};
  const paint = () => {
    replace(
      content,
      h('div', { class: 'row howto-dots', 'aria-hidden': 'true' }, Array.from({ length: HOWTO_STEPS }, (_, i) => h('span', { class: ['howto-dot', i < step && 'is-on'] }))),
      h('p', { class: 'eyebrow', 'aria-live': 'polite' }, t('howto.step', { n: step, total: HOWTO_STEPS })),
      h(
        'div',
        { class: 'col anim-rise howto-page' },
        h('div', { class: 'panel howto-art' }, howToArt(step)),
        h('h3', { class: 't-title' }, t(`howto.${step}.title`)),
        h('p', { class: 't-body-l muted pretty' }, t(`howto.${step}.text`)),
      ),
    );
    replace(
      footer,
      button({ label: t('common.back'), kind: 'secondary', md: true, block: false, disabled: step === 1, extra: ['howto-back'], key: 'howto-back', onClick: () => { step -= 1; paint(); } }),
      step < HOWTO_STEPS
        ? h('button', { type: 'button', class: 'btn btn-primary howto-next', key: 'howto-next', on: { click: () => { step += 1; paint(); } } }, t('common.next'), icon('right'))
        : button({ label: t('howto.done'), block: false, extra: ['howto-next'], key: 'howto-next', onClick: () => closeSheet() }),
    );
  };
  paint();
  const sheet = openSheet(app.root, { title: t('howto.title'), closeLabel: t('howto.close'), body: content, footer, height: 'tall' });
  closeSheet = sheet.close;
}

// ---------- Host hand-over (G4 "Hand it on", E4 "Hand host to another player") ----------
// Not drawn in the design: a sheet with a radio list and one confirm button,
// in the same select-then-confirm pattern as everything else.

export function openHostPicker(app) {
  const v = app.view;
  let picked = null;
  const others = v.players.filter((p) => p.id !== v.you);
  const list = h('div', { class: 'plist', role: 'radiogroup', 'aria-label': t('host.pickLabel') });
  const footer = h('div', { class: 'dock' });
  let closeSheet = () => {};
  const paint = () => {
    replace(
      list,
      others.map((p) =>
        h(
          'button',
          {
            type: 'button',
            class: ['prow', picked === p.id && 'is-selected', !p.connected && 'is-disabled'],
            role: 'radio',
            key: `host-${p.id}`,
            'aria-checked': String(picked === p.id),
            disabled: !p.connected,
            on: { click: () => { picked = p.id; paint(); } },
          },
          avatar(p.name, { off: !p.connected }),
          h('span', { class: 'prow-name' }, h('span', { text: p.name }), !p.connected ? h('span', { class: 'prow-meta' }, t('lobby.away')) : null),
          h('span', { class: 'tick' }, icon('check')),
        ),
      ),
    );
    const who = others.find((p) => p.id === picked);
    replace(
      footer,
      who
        ? button({
            label: t('host.make', { name: who.name }),
            ic: 'crown',
            onClick: async () => {
              const ack = await app.request(C2S.HOST_TRANSFER, { playerId: who.id });
              if (ack.ok) {
                app.hostBanner = null;
                closeSheet();
                app.update();
              } else toast(t(ack.code, ack.params), { kind: 'err' });
            },
          })
        : note(t('host.pickFirst'), { ic: 'info' }),
    );
  };
  paint();
  closeSheet = openSheet(app.root, { title: t('host.pickTitle'), body: list, footer }).close;
}

// ---------- G6 · Kick confirm ----------

export function openKickConfirm(app, player) {
  let block = false;
  openModal(app.root, {
    danger: true,
    top: avatar(player.name, { size: 56, extra: ['av-danger'] }),
    title: t('kick.title', { name: player.name }),
    text: t('kick.text', { name: player.name }),
    extra: h(
      'label',
      { class: 'row kick-block', for: 'kick-block' },
      h('input', { id: 'kick-block', type: 'checkbox', class: 'switch', role: 'switch', on: { change: (e) => (block = e.target.checked) } }),
      h('span', { class: 't-body' }, t('kick.block', { name: player.name })),
    ),
    actions: (close) => [
      button({
        label: t('kick.confirm', { name: player.name }),
        kind: 'danger',
        ic: 'kick',
        onClick: async () => {
          const ack = await app.request(C2S.LOBBY_KICK, { playerId: player.id, block });
          close();
          if (!ack.ok) toast(t(ack.code, ack.params), { kind: 'err' });
        },
      }),
      button({ label: t('common.cancel'), kind: 'ghost', onClick: close, attrs: { 'data-autofocus': '' } }),
    ],
  });
}

// ---------- G5 · Leave confirm (mid-game) ----------

export function openLeaveConfirm(app) {
  const minutes = Math.round((app.hello?.seatHoldMs || 300000) / 60000);
  openModal(app.root, {
    danger: true,
    top: h('span', { class: 'modal-icon' }, icon('leave', 'ic-28')),
    title: t('leave.title'),
    text: t('leave.text', { n: minutes }),
    actions: (close) => [
      button({ label: t('leave.confirm'), kind: 'danger', ic: 'leave', onClick: () => { close(); closeOverlay(); app.stepAway(); } }),
      button({ label: t('leave.stay'), kind: 'ghost', onClick: close, attrs: { 'data-autofocus': '' } }),
    ],
  });
}
