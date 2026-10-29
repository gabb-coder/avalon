// Role cards (C1/C2), the Peek sheet (C3, D-screens) and the night info.
//
// PRIVACY: everything built here is secret. Callers insert it only while the
// card or Peek button is held, and remove it on release. Nothing here may be
// kept in the page "hidden"; it is rebuilt from the view each time.

import { h, icon, initial } from '../dom.js';
import { t, tParts, gap, list } from '../i18n.js';
import { privateLabel, teamTag } from './ui.js';
import { GAME_TITLE } from '../../config.js';

export const ROLE_TEAM = {
  merlin: 'good', percival: 'good', servant: 'good',
  assassin: 'evil', morgana: 'evil', mordred: 'evil', oberon: 'evil', minion: 'evil',
};

// What this player learned at night, as { heading, names: [{ name, kind }], note }.
export function nightIntel(view) {
  const g = view.game;
  const { role, night } = g.me;
  const cfg = view.config;
  const names = night.seen.map((id) => ({ name: g.names[id], kind: night.kind === 'evil' ? 'evil' : 'maybe' }));

  if (role === 'merlin') {
    const hidden = [];
    if (cfg.mordred) hidden.push(t('role.mordred.name'));
    if (cfg.oberon && !cfg.oberonSeenByMerlin) hidden.push(t('role.oberon.name'));
    return {
      heading: t('intel.evilYouSee'),
      names,
      note: hidden.length ? t('intel.merlinHidden', { n: hidden.length, roles: list(hidden) }) : t('intel.merlinAll'),
    };
  }
  if (night.kind === 'maybe') return { heading: t('intel.maybeMerlin'), names, note: t('intel.note.percivalMaybe') };
  if (night.kind === 'sure') return { heading: t('intel.merlinIs'), names, note: t('intel.note.percivalSure') };
  if (ROLE_TEAM[role] === 'evil' && role !== 'oberon') {
    let note;
    if (cfg.oberon) note = t('intel.note.oberonHidden');
    else if (role === 'morgana') note = t(cfg.percival ? 'intel.note.morgana' : 'intel.note.morganaNoPercival');
    else note = t(`intel.note.${role}`);
    return { heading: t('intel.fellowEvil'), names, note };
  }
  return { heading: t('intel.sawNoOne'), names: [], note: t(`intel.note.${role}`) };
}

// One sentence a screen reader hears while the card is held.
export function roleAria(view) {
  const { role } = view.game.me;
  const intel = nightIntel(view);
  const who = intel.names.length ? t('peek.seenText', { heading: intel.heading, names: list(intel.names.map((n) => n.name)) }) : intel.note;
  return t('card.ariaHeld', { role: t(`role.${role}.name`), team: t(`team.${ROLE_TEAM[role]}`), who });
}

function intelBlock(view) {
  const intel = nightIntel(view);
  return h(
    'div',
    { class: 'rcard-intel' },
    h('p', { class: 'rcard-intel-h' }, intel.heading),
    intel.names.length
      ? h(
          'div',
          { class: 'intel-names' },
          intel.names.map((n) => h('span', { class: ['iname', n.kind] }, h('span', { class: 'mini', 'aria-hidden': 'true' }, initial(n.name)), n.name)),
        )
      : null,
    h('p', { class: 'rcard-note' }, intel.note),
  );
}

export function emblem(role, size = 64) {
  return h('span', { class: 'rcard-emblem' }, icon(role, `ic-${size}`));
}

// The parchment front of the role card.
export function roleFront(view, { animate = true } = {}) {
  const { role } = view.game.me;
  const team = ROLE_TEAM[role];
  return h(
    'div',
    { class: ['rcard', 'rcard-front', team, animate && 'anim-flip'] },
    privateLabel(),
    emblem(role),
    h('p', { class: 'rcard-name' }, t(`role.${role}.name`)),
    teamTag(team),
    h('p', { class: 'rcard-ability' }, t(`role.${role}.ability`)),
    intelBlock(view),
  );
}

// The face-down back: identical for everyone, safe to show.
export function roleBack() {
  return h(
    'div',
    { class: 'rcard rcard-back' },
    icon('logo', 'card-logo'),
    h('p', { class: 'd-m card-title' }, GAME_TITLE.toLocaleUpperCase()),
    h('span', { class: 'chip chip-gold anim-breathe card-hint' }, icon('hold'), t('card.holdToReveal')),
  );
}

// Contents of the Peek sheet: role, team, night info and any Lady results.
export function peekSheet(view) {
  const g = view.game;
  const { role, ladyResults } = g.me;
  const team = ROLE_TEAM[role];
  const intel = nightIntel(view);
  const seen = intel.names.length ? [tParts('peek.seen', { heading: intel.heading, names: h('b', { class: `ink-${intel.names[0].kind}` }, list(intel.names.map((n) => n.name))) }), gap()] : [];
  return h(
    'div',
    { class: ['peek-sheet', 'anim-rise', team], role: 'dialog', 'aria-label': t('peek.aria') },
    h('div', { class: 'peek-private' }, privateLabel()),
    h(
      'div',
      { class: 'row peek-row' },
      emblem(role, 32),
      h(
        'div',
        { class: 'grow col peek-text' },
        h('div', { class: 'row peek-title' }, h('p', { class: 'rcard-name' }, t(`role.${role}.name`)), teamTag(team)),
        h('p', { class: 'rcard-ability peek-intel' }, seen, intel.note),
      ),
    ),
    ladyResults.length
      ? h(
          'div',
          { class: 'rcard-intel' },
          h('p', { class: 'rcard-intel-h' }, t('peek.ladyHeading')),
          h(
            'div',
            { class: 'intel-names' },
            ladyResults.map((r) =>
              h('span', { class: ['iname', r.seenTeam === 'evil' ? 'evil' : 'maybe'] }, h('span', { class: 'mini', 'aria-hidden': 'true' }, initial(g.names[r.target])), t('peek.ladyResult', { name: g.names[r.target], team: t(`team.${r.seenTeam}`) })),
            ),
          ),
        )
      : null,
  );
}

// D15 · The Lady's private answer, on parchment: "Sana is loyal to Evil".
// Team only, never role. The Lady screen inserts it only while it is shown
// (right after looking, or while held) and removes it otherwise.
export function ladyCard(view, result) {
  const name = view.game.names[result.target];
  const team = result.seenTeam;
  const card = h(
    'div',
    { class: ['rcard', 'rcard-front', team, 'anim-flip', 'lady-card'], role: 'img', 'aria-label': t('lady.cardAria', { name, team: t(`team.${team}`) }) },
    privateLabel(),
    h('div', { class: 'row lady-card-head' }, icon('lady'), h('p', { class: 'rcard-intel-h' }, t('lady.reveals'))),
    h('div', { class: 'row lady-card-who' }, h('span', { class: 'av av-48 av-parchment', 'aria-hidden': 'true' }, initial(name)), h('p', { class: 'rcard-name', text: name })),
    h('p', { class: 't-body lady-card-loyal' }, t('lady.loyalTo')),
    emblem(team),
    teamTag(team),
  );
  return card;
}
