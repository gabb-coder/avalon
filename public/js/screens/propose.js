// The board during team building.
//   D1 · You lead: board + "Choose 2 knights"
//   D2/D3 · Leader picks from a list (too few / too many disable Send, with a reason)
//   D4 · Watching the leader's picks appear live on the ring
//   D17 · Mid-game, someone offline: the status bar names them
//   S1 · Short screens: compact track, smaller ring, Peek joins the dock row
//   S3 · Tablets: ring and quest panel side by side, vote history always open

import { C2S } from '../../shared/protocol.js';
import { h, icon, avatar, replace } from '../dom.js';
import { t, tParts, list } from '../i18n.js';
import { toast } from '../components/toast.js';
import { peekButton } from '../components/peek.js';
import { button, blockedButton, iconButton, note, roomTag, statusBar, topbar } from '../components/ui.js';
import { trackPanel, seatRing, gameTopbar, awayStatus, isShort, isTablet, ringSize, questTrack, rejectCounter } from '../components/board.js';
import { historyGrid, historyLegend, focusSummary } from '../components/history.js';
import { openMenu, openHistory, openHowTo, openGlossary } from './sheets.js';

const SELECT_DEBOUNCE_MS = 150;

export function mount(app) {
  let picking = false; // the leader has opened the list (D2)
  let order = []; // the leader's picks, in the order they were added
  let proposalKey = null;
  let selectTimer = null;
  let peek = null;
  let dockKey = null; // the dock is rebuilt only when its shape changes, so a held Peek isn't cut off
  let focus = null; // S3: the history column being followed

  const bar = h('div', { class: 'topbar-slot' });
  const status = h('div', { class: 'status-slot' });
  const content = h('div', { class: 'content board' });
  const dock = h('div', { class: 'dock' });

  const v = () => app.view;
  const g = () => app.view.game;
  const size = () => g().quests[g().questIndex].size;
  const q = () => g().questIndex + 1;
  const isLeader = () => g().proposal?.leader === v().you;

  // A new proposal (next leader, or after a reload): start from the server's picks.
  function syncPicks() {
    const key = `${g().questIndex}:${g().proposals.length}:${g().proposal?.leader}`;
    if (key === proposalKey) return;
    proposalKey = key;
    order = (g().proposal?.picks || []).slice();
    picking = false;
  }

  function sendPicks() {
    clearTimeout(selectTimer);
    selectTimer = setTimeout(() => app.request(C2S.TEAM_SELECT, { team: order.slice() }), SELECT_DEBOUNCE_MS);
  }

  function toggle(id) {
    order = order.includes(id) ? order.filter((x) => x !== id) : [...order, id];
    sendPicks();
    paint();
  }

  async function send() {
    clearTimeout(selectTimer);
    const ack = await app.request(C2S.TEAM_PROPOSE, { team: order.slice() });
    if (!ack.ok) toast(t(ack.code, ack.params), { kind: 'err' });
  }

  const openHist = () => openHistory(app);
  const openMenuSheet = () => openMenu(app);

  // ---------- board (D1, D4, D17) ----------

  function tableCenter() {
    const game = g();
    const team = isLeader() ? order : game.proposal.picks;
    const sm = ringSize(app.root) === 'sm';
    if (!isLeader() && team.length) {
      const missing = Math.max(0, size() - team.length);
      return [
        h('span', { class: 'eyebrow eyebrow-12' }, t('board.proposed')),
        h(
          'div',
          { class: 'stack table-stack' },
          team.slice(0, size()).map((id) => avatar(game.names[id], { size: 32 })),
          Array.from({ length: Math.min(missing, 3) }, () => h('span', { class: 'av av-32 av-empty', 'aria-hidden': 'true' }, '?')),
        ),
        h('span', { class: 't-label faint table-line' }, missing ? t('board.moreToPick', { n: missing }) : t('board.allPicked')),
      ];
    }
    const quest = game.quests[game.questIndex];
    const done = game.quests.filter((x) => x.result);
    const wins = done.filter((x) => x.result === 'success').length;
    let line = t('board.oneFailSinks');
    if (quest.failsNeeded === 2) line = t('board.twoFailsSink');
    else if (done.length) line = t('board.score', { good: wins, evil: done.length - wins });
    return [
      h('span', { class: 'eyebrow eyebrow-12' }, t('board.questN', { q: q() })),
      h('span', { class: 'd-m table-size' }, t('board.knights', { n: size() })),
      sm ? null : h('span', { class: 't-label faint table-line' }, line),
    ];
  }

  function boardStatus() {
    const game = g();
    const away = awayStatus(v(), app);
    const n = game.seats.length;
    if (isLeader()) {
      return statusBar({
        phase: t('board.phaseYourTurn', { q: q() }),
        phaseIcon: 'standard',
        tone: away ? 'alert' : 'you',
        right: away ? away.chip : h('span', { class: 't-label faint' }, t('board.leaderOf', { k: (game.proposals.length % n) + 1, n })),
        main: t('board.youLead', { n: size(), q: q() }),
        wait: away ? away.wait : t('board.youLeadHint'),
      });
    }
    const picks = game.proposal.picks;
    const leaderName = game.names[game.proposal.leader];
    const left = size() - picks.length;
    return statusBar({
      phase: t('board.phaseBuilding', { q: q() }),
      phaseIcon: 'standard',
      tone: away ? 'alert' : null,
      right: away ? away.chip : h('span', { class: 't-label b tnum gold' }, t('board.pickedOf', { n: picks.length, size: size() })),
      main: t('board.choosing', { name: leaderName, n: size() }),
      wait: away
        ? away.wait
        : picks.length
          ? tParts('board.pickedLine', { names: h('b', { class: 'text-1', text: list(picks.map((id) => game.names[id])) }), rest: left > 0 ? t('board.toGo', { n: left }) : t('board.allPicked') })
          : t('board.noPicksYet'),
    });
  }

  function boardDock() {
    peek?.destroy();
    const short = isShort();
    peek = peekButton(app, { short, extra: [short ? 'peek-short' : null] });
    if (isLeader()) {
      const choose = button({ label: t('board.choose', { n: size() }), ic: 'standard', key: 'choose', extra: short ? ['grow'] : [], block: !short, onClick: () => { picking = true; paint(); } });
      return short ? h('div', { class: 'row dock-pair' }, peek.el, choose) : [peek.el, choose];
    }
    const hasHistory = g().proposals.length > 0;
    if (short) {
      return h('div', { class: 'row dock-pair' }, peek.el, button({ label: t('board.votes'), kind: 'secondary', ic: 'history', block: false, extra: ['grow'], onClick: openHist }));
    }
    if (hasHistory) {
      peek.el.classList.add('grow');
      return h('div', { class: 'row dock-pair' }, peek.el, button({ label: t('board.votes'), kind: 'secondary', md: true, block: false, ic: 'history', extra: ['btn-pill'], onClick: openHist }));
    }
    const leaderName = g().names[g().proposal.leader];
    return [peek.el, note(t('board.nothingToTap', { name: leaderName }), { ic: 'users', extra: ['note-box'] })];
  }

  // ---------- tablet (S3) ----------

  function tabletTopbar() {
    return h(
      'div',
      { class: 'topbar topbar-tab' },
      h(
        'div',
        { class: 'row topbar-group' },
        button({ label: t('tab.menu'), kind: 'ghost', md: true, block: false, ic: 'menu', onClick: openMenuSheet }),
        button({ label: t('tab.rules'), kind: 'ghost', md: true, block: false, ic: 'book', onClick: () => openHowTo(app) }),
      ),
      h('div', { class: 'row topbar-group' }, icon('logo', 'gold', 'ic-28'), roomTag(v().code)),
      h(
        'div',
        { class: 'row topbar-group' },
        button({ label: t('tab.roles'), kind: 'ghost', md: true, block: false, ic: 'cards', onClick: () => openGlossary(app) }),
        button({ label: t('tab.settings'), kind: 'ghost', md: true, block: false, ic: 'sliders', key: 'settings', onClick: () => app.openSettings() }),
      ),
    );
  }

  // "Sana leads · next: Jude" and "You hold the Lady · use after Quest 3".
  function tabletInfo() {
    const game = g();
    const nameOf = (id, cap) => (id === v().you ? t(cap ? 'board.youCap' : 'board.you') : game.names[id]);
    const leader = game.proposal.leader;
    const next = game.seats[(game.seats.indexOf(leader) + 1) % game.seats.length];
    const rows = [
      h('div', { class: 'row tab-info' }, h('span', { class: 'tok tok-leader' }, icon('standard')), h('p', { class: 't-body grow' }, tParts(leader === v().you ? 'tab.youLead' : 'tab.leads', { name: h('b', { text: nameOf(leader, true) }), next: nameOf(next) }))),
    ];
    if (game.lady) {
      const holder = game.lady.holder;
      const use = Math.max(game.questIndex, 1); // the Lady is used after Quests 2, 3 and 4
      rows.push(
        h(
          'div',
          { class: 'row tab-info' },
          h('span', { class: 'tok tok-lady' }, icon('lady')),
          h('p', { class: 't-body grow' }, tParts(holder === v().you ? 'tab.youHoldLady' : 'tab.holdsLady', { name: h('b', { text: nameOf(holder, true) }) }), use <= 3 ? t('tab.ladyUse', { q: use + 1 }) : ''),
        ),
      );
    }
    return h('div', { class: 'panel col tab-panel' }, rows);
  }

  function tabletHistory() {
    const game = g();
    const body = game.proposals.length
      ? [historyGrid(game, { you: v().you, focus, onFocus: (id) => { focus = id; paint(); } }), historyLegend(), focus ? focusSummary(game, focus) : null]
      : [h('p', { class: 't-body muted' }, t('history.empty'))];
    return h(
      'section',
      { class: 'col tab-history', 'aria-labelledby': 'tab-history-t' },
      h('div', { class: 'row between' }, h('h2', { class: 't-title', id: 'tab-history-t' }, t('history.title')), h('span', { class: 't-label muted' }, t('tab.alwaysOpen'))),
      body,
    );
  }

  function paintTablet() {
    const team = isLeader() ? order : g().proposal.picks;
    replace(bar, tabletTopbar());
    replace(status, boardStatus());
    replace(
      content,
      h(
        'div',
        { class: 'tab-grid' },
        h('div', { class: 'ring-cell' }, seatRing(app, { team, center: tableCenter(), size: 'xl' })),
        h(
          'div',
          { class: 'col tab-side' },
          h('div', { class: 'panel col tab-panel' }, h('p', { class: 'eyebrow eyebrow-12' }, t('board.quests')), questTrack(g(), { compact: window.innerWidth < 900, phase: v().phase }), h('hr', { class: 'rule rule-flat' }), rejectCounter(g().rejects)),
          tabletInfo(),
        ),
      ),
      tabletHistory(),
    );
    const key = ['tab', isLeader(), size()].join('|');
    if (key !== dockKey) {
      dockKey = key;
      peek?.destroy();
      peek = peekButton(app, { extra: ['peek-tab'] });
      replace(
        dock,
        h('div', { class: 'row dock-tab' }, peek.el, isLeader() ? button({ label: t('board.choose', { n: size() }), ic: 'standard', block: false, key: 'choose', onClick: () => { picking = true; paint(); } }) : null),
      );
    }
  }

  // ---------- leader's list (D2, D3) ----------

  function pickStatus() {
    const n = size();
    const count = order.length;
    const over = count > n;
    const headline = count === n ? t('pick.ready') : over ? t('pick.tooManyHeadline', { q: q() }) : t('pick.more', { n: n - count });
    return statusBar({
      phase: t('pick.phase', { q: q() }),
      phaseIcon: 'standard',
      tone: over ? 'alert' : 'you',
      right: h('span', { class: ['t-label b tnum', over ? 'warn' : count === n ? 'good' : 'gold-hi'] }, t('pick.count', { n: count, size: n })),
      main: headline,
      wait: t('pick.watching'),
    });
  }

  function pickList() {
    const game = g();
    const n = size();
    const extra = order.slice(n); // picks beyond the quest size, newest last
    const conn = Object.fromEntries(v().players.map((p) => [p.id, p.connected]));
    return [
      h('div', { class: 'row between' }, h('p', { class: 't-label muted b' }, t('pick.tapHint')), h('p', { class: 't-label faint' }, t('pick.questSize', { q: q(), n }))),
      h(
        'div',
        { class: 'plist', role: 'group', 'aria-label': t('pick.listLabel') },
        game.seats.map((id) => {
          const on = order.includes(id);
          const isOver = extra.includes(id);
          const you = id === v().you;
          let meta = you ? t('pick.youLeader') : on ? t('pick.onTeam') : null;
          if (isOver) meta = t('pick.oneTooMany');
          if (conn[id] === false) meta = [meta, t('lobby.away')].filter(Boolean).join(' · ');
          return h(
            'button',
            { type: 'button', class: ['prow', on && 'is-selected', isOver && 'is-over'], key: `pick-${id}`, 'aria-pressed': String(on), on: { click: () => toggle(id) } },
            avatar(game.names[id], { you, off: conn[id] === false }),
            h('span', { class: 'prow-name' }, h('span', { text: game.names[id] }), meta ? h('span', { class: 'prow-meta' }, meta) : null),
            h('span', { class: 'tick' }, icon('check')),
          );
        }),
      ),
    ];
  }

  function pickDock() {
    const n = size();
    const count = order.length;
    if (count === n) {
      const names = order.map((id) => g().names[id]);
      const label = n <= 3 ? t('pick.send', { names: list(names) }) : t('pick.sendN', { n });
      return [button({ label, ic: 'check', key: 'send', onClick: send }), note(t('pick.sendHint'))];
    }
    if (count > n) return blockedButton({ label: t('pick.sendTeam'), reason: t('pick.tooMany', { q: q(), n, x: count - n }), ic: 'warn', tone: 'warn' });
    return blockedButton({ label: t('pick.sendTeam'), reason: t('pick.tooFew', { n: n - count }), ic: 'info' });
  }

  // ---------- paint ----------

  function paint() {
    syncPicks();
    const showList = picking && isLeader();
    const tablet = isTablet() && !showList;
    // The tablet board uses the full width; everything else stays a phone column.
    app.root.classList.toggle('board-tablet', tablet);
    content.classList.toggle('board-tab', tablet);
    if (tablet) return paintTablet();
    replace(
      bar,
      showList
        ? topbar(iconButton({ ic: 'left', label: t('pick.back'), onClick: () => { picking = false; paint(); } }), roomTag(v().code), iconButton({ ic: 'history', label: t('board.history'), onClick: openHist }))
        : gameTopbar(app, { onMenu: openMenuSheet, onHistory: openHist }),
    );
    if (showList) {
      peek?.destroy();
      peek = null;
      dockKey = null;
      replace(status, pickStatus());
      content.classList.add('pick');
      replace(content, pickList());
      replace(dock, pickDock());
      return;
    }
    content.classList.remove('pick');
    replace(status, boardStatus());
    const team = isLeader() ? order : g().proposal.picks;
    replace(content, trackPanel(g(), { phase: v().phase }), seatRing(app, { team, center: tableCenter() }));
    const key = [isLeader(), isShort(), g().proposals.length > 0, g().proposal.leader, size()].join('|');
    if (key !== dockKey) {
      dockKey = key;
      replace(dock, boardDock());
    }
  }

  const el = h('div', { class: 'screen-body' }, bar, status, content, dock);
  paint();
  return {
    el,
    update: paint,
    destroy: () => {
      clearTimeout(selectTimer);
      peek?.destroy();
      app.root.classList.remove('board-tablet');
    },
  };
}
