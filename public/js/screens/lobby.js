// B1/B2 · Lobby for the host, B3 · for guests, G4 · "You're the host now",
// G6 · kick confirm (in sheets.js).
//
// The host's role toggles go to the server (lobby:setConfig); every player's
// counts, chips and the Start button's reason come back from the server's
// setup summary, so everyone always sees the same thing.

import { C2S } from '../../shared/protocol.js';
import { h, icon, avatar, replace } from '../dom.js';
import { t } from '../i18n.js';
import { button, blockedButton, iconButton, chip, panel, seg, toggleRow, topbar, statusBar, dots } from '../components/ui.js';
import { toast } from '../components/toast.js';
import { copyCode, shareRoom } from '../share.js';
import { openGlossary, openKickConfirm, openHostPicker } from './sheets.js';
import { ambience } from '../fx.js';

const MIN = 5;
const MAX = 10;

const OPTIONAL = [
  { key: 'percival', icon: 'percival', tone: 'good' },
  { key: 'morgana', icon: 'morgana', tone: 'evil' },
  { key: 'mordred', icon: 'mordred', tone: 'evil' },
  { key: 'oberon', icon: 'oberon', tone: 'evil' },
];

// Chips for the setup summary: role names plus "2 Loyal Servants" / "1 Minion".
function setupChips(setup, { lady = false } = {}) {
  return [
    ...setup.goodRoles.map((r) => chip(t(`role.${r}.name`), { kind: 'good', ic: 'good' })),
    setup.servants ? chip(t('lobby.servants', { n: setup.servants }), { kind: 'good', ic: 'good' }) : null,
    ...setup.evilRoles.map((r) => chip(t(`role.${r}.name`), { kind: 'evil', ic: 'evil' })),
    setup.minions ? chip(t('lobby.minions', { n: setup.minions }), { kind: 'evil', ic: 'evil' }) : null,
    lady && setup.lady ? chip(t('lady.name'), { ic: 'lady' }) : null,
  ];
}

function teamCounts(setup, cls = 't-body b') {
  return h('p', { class: cls }, h('span', { class: 'good' }, t('lobby.goodN', { n: setup.good })), ' · ', h('span', { class: 'evil' }, t('lobby.evilN', { n: setup.evil })));
}

// Who this phone has already seen at the table, so only newcomers pop in
// (not everyone again on each repaint, or after a language switch).
let seenPlayers = null; // { code, ids }

export function mount(app) {
  let tab = 'players';
  const banner = h('div');
  const tabs = h('div');
  const body = h('div', { class: 'col lobby-body' });
  const dock = h('div', { class: 'dock' });
  const title = h('span', { class: 't-body b' });
  const codeSlot = h('div');

  const view = () => app.view;
  const isHost = () => view().hostId === view().you;
  const hostName = () => view().players.find((p) => p.id === view().hostId)?.name || '';

  async function setConfig(patch) {
    const ack = await app.request(C2S.LOBBY_SET_CONFIG, { config: patch });
    if (!ack.ok) {
      toast(t(ack.code, ack.params), { kind: 'err' });
      paint();
    }
  }

  // ---------- pieces ----------

  function codePanel() {
    const code = view().code;
    const spelled = [...code].join(' ');
    if (!isHost()) {
      return panel(
        [
          h('div', { class: 'grow' }, h('span', { class: 'eyebrow code-eyebrow' }, t('lobby.codeLabel')), h('span', { class: 'd-l tnum room-code room-code-sm' }, code)),
          iconButton({ ic: 'share', label: t('lobby.share'), framed: true, key: 'share', onClick: () => shareRoom(code) }),
        ],
        { extra: ['row', 'code-panel', 'code-panel-guest'] },
      );
    }
    return panel(
      [
        h(
          'button',
          { type: 'button', class: 'code-copy', key: 'code-copy', 'aria-label': t('lobby.codeAria', { code: spelled }), on: { click: () => copyCode(code) } },
          h('span', { class: 'eyebrow code-eyebrow' }, t('lobby.codeTapToCopy')),
          h('span', { class: 'd-xl tnum room-code' }, code),
        ),
        iconButton({ ic: 'copy', label: t('lobby.copy'), framed: true, key: 'copy', onClick: () => copyCode(code) }),
        iconButton({ ic: 'share', label: t('lobby.share'), framed: true, key: 'share', onClick: () => shareRoom(code) }),
      ],
      { gold: true, extra: ['row', 'code-panel'] },
    );
  }

  function hostBanner() {
    const b = app.hostBanner;
    if (!b || !isHost()) return null;
    return panel(
      [
        h('span', { class: 'tok tok-host tok-44' }, icon('crown', 'ic-28')),
        h(
          'div',
          { class: 'grow col host-banner-text' },
          h('p', { class: 't-title' }, t('host.youNow')),
          h('p', { class: 't-label muted' }, t(`host.reason.${b.reason}`, { name: b.prev })),
          h(
            'div',
            { class: 'row host-banner-actions' },
            button({ label: t('host.handOn'), kind: 'secondary', md: true, block: false, key: 'hand-on', onClick: () => openHostPicker(app) }),
            button({ label: t('host.gotIt'), kind: 'ghost', md: true, block: false, extra: ['gold-hi'], key: 'got-it', onClick: () => { app.hostBanner = null; paint(); } }),
          ),
        ),
      ],
      { gold: true, extra: ['row', 'row-top', 'host-banner', 'anim-rise'], attrs: { role: 'alert' } },
    );
  }

  function playerRows() {
    const v = view();
    const host = isHost();
    const known = seenPlayers?.code === v.code ? seenPlayers.ids : null;
    seenPlayers = { code: v.code, ids: new Set(v.players.map((p) => p.id)) };
    const rows = v.players.map((p) => {
      const you = p.id === v.you;
      const fresh = known && !known.has(p.id); // just sat down: pops in
      const isTheHost = p.id === v.hostId;
      let meta = null;
      if (!p.connected) meta = t('lobby.connecting');
      else if (you && isTheHost) meta = t('lobby.youHost');
      else if (you) meta = t('lobby.you');
      else if (isTheHost) meta = t('lobby.host');
      else if (host) meta = t('lobby.joined');
      let end = null;
      if (isTheHost) end = h('span', { class: 'ic i-crown gold crown-end', role: 'img', 'aria-label': t('lobby.host') });
      else if (!p.connected) end = h('span', { class: 'spinner spinner-end', role: 'img', 'aria-label': t('lobby.connecting') });
      // B2: a player still connecting shows a spinner; connected guests can be removed.
      if (host && !you && p.connected) {
        end = iconButton({ ic: 'kick', danger: true, label: t('lobby.kick', { name: p.name }), key: `kick-${p.id}`, onClick: () => openKickConfirm(app, p) });
      }
      return h(
        'div',
        { class: ['prow', !p.connected && 'is-off', fresh && 'anim-rise'] },
        avatar(p.name, { you, off: !p.connected, extra: fresh ? ['anim-pop'] : [] }),
        h('span', { class: 'prow-name' }, h('span', { text: p.name }), meta ? h('span', { class: 'prow-meta' }, meta) : null),
        end ? h('span', { class: 'prow-end' }, end) : null,
      );
    });
    // B2: an open seat, inviting more players, while we're under the minimum.
    if (host && v.players.length < MIN) {
      rows.push(
        h(
          'div',
          { class: 'prow prow-open' },
          h('span', { class: 'av av-open', 'aria-hidden': 'true' }, icon('plus', 'ic-20')),
          h('span', { class: 'prow-name' }, h('span', { class: 'gold' }, t('lobby.openSeat', { n: v.players.length + 1 })), h('span', { class: 'prow-meta' }, t('lobby.openSeatHint', { code: v.code }))),
          h('span', { class: 'prow-end' }, button({ label: t('lobby.invite'), kind: 'secondary', md: true, block: false, ic: 'share', extra: ['btn-44'], onClick: () => shareRoom(v.code) })),
        ),
      );
    }
    return h('div', { class: 'plist' }, rows);
  }

  function playersTab() {
    const n = view().players.length;
    return [
      h(
        'div',
        { class: 'row between' },
        h('span', { class: 't-label muted b' }, t('lobby.seats', { n, max: MAX, min: MIN })),
        n >= MIN ? chip(t('lobby.ready'), { kind: 'good', ic: 'check' }) : chip(t('lobby.more', { n: MIN - n }), { kind: 'warn', ic: 'users' }),
      ),
      playerRows(),
      n < MIN ? h('p', { class: 't-label faint center' }, t('lobby.codeLasts')) : null,
    ];
  }

  function rolesTab() {
    const v = view();
    const s = v.setup;
    const cfg = v.config;
    const problem = s.problems.find((p) => p.code !== 'start.tooFew');
    const warning = s.warnings[0];
    return [
      panel(
        [
          h('div', { class: 'row between baseline' }, h('p', { class: 't-title' }, t('lobby.playersN', { n: v.players.length })), teamCounts(s)),
          h('div', { class: 'row wrap chips' }, setupChips(s)),
        ],
        { gold: true, extra: ['col', 'setup-summary'], attrs: { 'aria-live': 'polite' } },
      ),
      problem ? h('p', { class: 'field-msg evil', role: 'alert' }, icon('warn', 'ic-16'), t(problem.code, problem.params)) : null,
      warning ? h('p', { class: 'field-msg warn' }, icon('info', 'ic-16'), t(warning.code, warning.params)) : null,
      panel(
        [
          h(
            'div',
            { class: 'toggle-row toggle-row-56' },
            icon('merlin', 'good'),
            h('span', { class: 'grow' }, h('span', { class: 't-body b' }, t('lobby.coreRoles')), h('br'), h('span', { class: 't-label muted' }, t('lobby.coreRolesDesc'))),
            icon('lock', 'faint'),
          ),
          OPTIONAL.map((o) =>
            toggleRow({
              id: `opt-${o.key}`,
              ic: o.icon,
              tone: o.tone,
              title: t(`role.${o.key}.name`),
              desc: t(`lobby.desc.${o.key}`),
              checked: cfg[o.key],
              onChange: (on) => setConfig({ [o.key]: on }),
            }),
          ),
        ],
        { extra: ['panel-rows'] },
      ),
      h(
        'div',
        { class: 'col oberon-setting' },
        h('p', { class: 't-label muted b', id: 'ob-l' }, t('lobby.oberonLabel')),
        seg({
          labelledBy: 'ob-l',
          value: cfg.oberonSeenByMerlin ? 'seen' : 'hidden',
          disabled: !cfg.oberon,
          options: [
            { value: 'seen', label: t('lobby.oberonSeen') },
            { value: 'hidden', label: t('lobby.oberonHidden') },
          ],
          onChange: (val) => setConfig({ oberonSeenByMerlin: val === 'seen' }),
        }),
        !cfg.oberon ? h('p', { class: 't-label faint' }, t('lobby.oberonOff')) : null,
      ),
      panel(
        toggleRow({ id: 'opt-lady', ic: 'lady', tone: 'good', title: t('lady.name'), desc: t('lobby.desc.lady'), checked: cfg.lady, onChange: (on) => setConfig({ lady: on }) }),
        { extra: ['panel-rows'] },
      ),
      button({ label: t('lobby.whatRoles'), kind: 'ghost', md: true, ic: 'cards', extra: ['gold-hi'], onClick: () => openGlossary(app) }),
    ];
  }

  function guestBody() {
    const v = view();
    const s = v.setup;
    return [
      panel(
        [
          h('div', { class: 'row between baseline' }, h('p', { class: 't-body b' }, t('lobby.setByHost')), teamCounts(s, 't-label b')),
          h('div', { class: 'row wrap chips' }, setupChips(s, { lady: true })),
          h('button', { type: 'button', class: 'link-btn t-label b', on: { click: () => openGlossary(app) } }, t('lobby.whatDoTheyDo'), icon('right', 'ic-16')),
        ],
        { gold: true, extra: ['col', 'setup-summary'] },
      ),
      h('p', { class: 't-label muted b' }, t('lobby.atTable', { n: v.players.length })),
      playerRows(),
    ];
  }

  function paintDock() {
    const v = view();
    if (!isHost()) {
      replace(
        dock,
        statusBar({
          phase: t('phase.lobby'),
          right: dots(),
          main: t('lobby.waitingForHost', { name: hostName() }),
          wait: t('lobby.waitingHint'),
        }),
      );
      return;
    }
    const s = v.setup;
    if (s.canStart) {
      replace(dock, button({ label: t('lobby.start'), key: 'start', onClick: start }));
      return;
    }
    const p = s.problems[0];
    replace(dock, blockedButton({ label: t('lobby.startShort'), reason: t(p.code, p.params), ic: p.code === 'start.tooFew' ? 'users' : 'warn' }));
  }

  async function start() {
    const ack = await app.request(C2S.GAME_START);
    if (!ack.ok) toast(t(ack.code, ack.params), { kind: 'err' });
  }

  function paint() {
    const v = view();
    title.textContent = isHost() ? t('lobby.yourRoom') : t('lobby.roomOf', { name: hostName() });
    replace(codeSlot, codePanel());
    replace(banner, hostBanner());
    if (isHost()) {
      replace(
        tabs,
        seg({
          role: 'tab',
          label: t('lobby.tabsLabel'),
          value: tab,
          options: [
            { value: 'players', label: t('lobby.tabPlayers', { n: v.players.length }) },
            { value: 'roles', label: t('lobby.tabRoles') },
          ],
          onChange: (val) => {
            tab = val;
            paint();
          },
        }),
      );
      replace(body, tab === 'players' ? playersTab() : rolesTab());
    } else {
      replace(tabs);
      replace(body, guestBody());
    }
    paintDock();
  }

  const el = h(
    'div',
    { class: 'screen-body' },
    ambience(),
    topbar(
      iconButton({ ic: 'left', label: t('lobby.leave'), onClick: () => app.leaveRoom() }),
      title,
      iconButton({ ic: 'cards', label: t('lobby.glossary'), onClick: () => openGlossary(app) }),
    ),
    h('div', { class: 'content lobby' }, banner, codeSlot, tabs, body),
    dock,
  );
  paint();
  return { el, update: paint };
}
