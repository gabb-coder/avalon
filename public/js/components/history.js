// The vote history grid (E1, E2, F4 "All votes"): one row per resolved
// proposal, one column per player, grouped under quest headers. Everything
// here is public: votes are only in the view after they were revealed.

import { h, icon, avatar } from '../dom.js';
import { t } from '../i18n.js';

// data: { seats, names, quests, proposals, questIndex }, you: viewer id.
export function historyGrid(data, { you, focus = null, onFocus = null } = {}) {
  const me = data.seats.indexOf(you);
  const cols = data.seats.map((_, k) => data.seats[(Math.max(0, me) + k) % data.seats.length]);

  const head = h(
    'div',
    { class: 'hrow head', role: 'row' },
    h('div', { class: 'hstick', role: 'columnheader' }, t('history.proposal')),
    cols.map((id) => {
      const props = {
        class: ['hhead', id === you && 'is-you', focus === id && 'is-focus'],
        role: 'columnheader',
        'aria-label': data.names[id],
      };
      const inner = [avatar(data.names[id], { you: id === you }), h('span', { text: data.names[id] })];
      return onFocus
        ? h('button', { ...props, type: 'button', key: `col-${id}`, 'aria-pressed': String(focus === id), on: { click: () => onFocus(focus === id ? null : id) } }, inner)
        : h('div', props, inner);
    }),
  );

  const rows = [];
  let lastQuest = -1;
  const header = (q) => {
    const quest = data.quests[q];
    let cls = 'c';
    let ic = 'hourglass';
    let text = t('history.qInProgress', { q: q + 1 });
    if (quest.result === 'success') {
      cls = 's';
      ic = 'success';
      text = quest.fails ? t('history.qSuccessDespite', { q: q + 1, n: quest.fails, need: quest.failsNeeded }) : t('history.qSuccess', { q: q + 1 });
    } else if (quest.result === 'fail') {
      cls = 'f';
      ic = 'fail';
      text = t('history.qFail', { q: q + 1, n: quest.fails });
    }
    return h('div', { class: 'hqrow', role: 'row' }, h('div', { class: cls, role: 'cell' }, icon(ic), text));
  };

  for (const p of data.proposals) {
    if (p.quest !== lastQuest) {
      rows.push(header(p.quest));
      lastQuest = p.quest;
    }
    const yes = Object.values(p.votes).filter((v) => v === 'approve').length;
    const no = Object.values(p.votes).length - yes;
    const leader = data.names[p.leader];
    rows.push(
      h(
        'div',
        { class: 'hrow', role: 'row', 'aria-label': t(p.approved ? 'history.rowApproved' : 'history.rowRejected', { q: p.quest + 1, n: p.attempt, name: leader, yes, no }) },
        h(
          'div',
          { class: 'hstick', role: 'rowheader' },
          h('span', { class: 'hl1' }, t('history.rowLabel', { q: p.quest + 1, n: p.attempt, name: leader })),
          h(
            'span',
            { class: ['hl2', p.approved ? 'ok' : 'no'] },
            h('span', { class: ['vm', p.approved ? 'vm-a' : 'vm-r'] }, icon(p.approved ? 'check' : 'cross')),
            t(p.approved ? 'history.yes' : 'history.no', { yes, no }),
          ),
        ),
        cols.map((id) => {
          const vote = p.votes[id];
          const onTeam = p.team.includes(id);
          const lead = p.leader === id;
          const label = [
            t('history.cellVote', { name: data.names[id], vote: t(vote === 'approve' ? 'history.cellApprove' : 'history.cellReject') }),
            onTeam && t('history.cellTeam'),
            lead && t('history.cellLeader'),
          ].filter(Boolean).join(t('common.sep'));
          return h(
            'div',
            { class: ['hcell', onTeam && 'on-team', focus === id && 'is-focus'], role: 'cell', 'aria-label': label },
            lead ? h('span', { class: 'lead' }, icon('standard')) : null,
            h('span', { class: ['vm', vote === 'approve' ? 'vm-a' : 'vm-r'] }, icon(vote === 'approve' ? 'check' : 'cross')),
          );
        }),
      ),
    );
  }
  // A quest that is under way but has no resolved proposal yet still gets its header.
  if (data.questIndex !== undefined && data.questIndex > lastQuest && data.quests[data.questIndex] && !data.quests[data.questIndex].result && data.proposals.length) {
    rows.push(header(data.questIndex));
  }

  const col = h('div', { class: 'hcol' }, head, rows);
  col.style.setProperty('--cols', String(cols.length));
  return h('div', { class: 'hscroll', role: 'table', 'aria-label': t('history.tableLabel') }, col);
}

export function historyLegend({ leader = true } = {}) {
  return h(
    'div',
    { class: 'legend' },
    h('span', {}, h('span', { class: 'vm vm-a vm-20' }, icon('check')), t('vote.approve')),
    h('span', {}, h('span', { class: 'vm vm-r vm-20' }, icon('cross')), t('vote.reject')),
    h('span', {}, h('span', { class: 'team-swatch', 'aria-hidden': 'true' }), t('history.onTeam')),
    leader ? h('span', {}, icon('standard', 'ic-16', 'gold'), t('history.leader')) : null,
  );
}

// "Following Kofi · Approved 3 of 5 · on 2 proposed teams · led 1."
export function focusSummary(data, id) {
  const approved = data.proposals.filter((p) => p.votes[id] === 'approve').length;
  const teams = data.proposals.filter((p) => p.team.includes(id)).length;
  const led = data.proposals.filter((p) => p.leader === id).length;
  return h(
    'div',
    { class: 'panel panel-gold col focus-summary anim-rise', 'aria-live': 'polite' },
    h('p', { class: 't-body b' }, t('history.following', { name: data.names[id] })),
    h('p', { class: 't-label muted' }, t('history.focusLine', { approved, total: data.proposals.length, teams, led })),
  );
}
