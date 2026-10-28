// Lady of the Lake, after Quests 2, 3 and 4 (when the Lady is on).
//   D14 · The holder chooses a player (themselves and past holders locked)
//   D15 · The holder's private answer on parchment, then "Hide & pass"
//   D16 · Everyone else: "Rowan is looking into Sana"
//
// PRIVACY: the answer exists in this player's view only (me.ladyResults).
// It is put on screen face-up right after looking, the way the design shows
// it, and taken out of the DOM the moment the page is hidden (app switch,
// screen lock). After that, or after a reload, it is only shown while
// "Hold to see the answer" is held, like the role card.

import { C2S } from '../../shared/protocol.js';
import { h, icon, avatar, replace } from '../dom.js';
import { t, list } from '../i18n.js';
import { toast } from '../components/toast.js';
import { peekButton } from '../components/peek.js';
import { bindHold } from '../components/hold.js';
import { ladyCard } from '../components/roleCard.js';
import { button, note, panel, privateBand, statusBar, dots } from '../components/ui.js';
import { gameTopbar, awayStatus } from '../components/board.js';
import { openMenu, openHistory } from './sheets.js';

export function mount(app) {
  let pick = null; // the holder's choice before "Look into…"
  let sending = false;
  let shown = false; // the answer is face-up (only straight after looking)
  let peek = null;
  let reveal = null; // the hold binding of "Hold to see the answer"
  let dockKey = null;
  let answerKey = null; // the answer area is rebuilt only when it changes, so a hold isn't cut off

  const band = h('div', { class: 'status-slot' });
  const status = h('div', { class: 'status-slot' });
  const content = h('div', { class: 'content lady' });
  const dock = h('div', { class: 'dock' });

  const v = () => app.view;
  const g = () => app.view.game;
  const lady = () => app.view.game.lady;
  const isHolder = () => lady().holder === v().you;
  const after = () => lady().afterQuest + 1; // "After Quest 3"
  const nameOf = (id) => (id === v().you ? t('board.you') : g().names[id]);
  const result = () => g().me.ladyResults.find((r) => r.target === lady().target && r.afterQuest === lady().afterQuest);

  function onVisibility() {
    if (document.hidden && shown) {
      shown = false;
      paint();
    }
  }
  document.addEventListener('visibilitychange', onVisibility);

  async function inspect() {
    if (!pick || sending) return;
    sending = true;
    const ack = await app.request(C2S.LADY_INSPECT, { playerId: pick });
    sending = false;
    if (!ack.ok) {
      toast(t(ack.code, ack.params), { kind: 'err' });
      return;
    }
    shown = !document.hidden;
    paint();
  }

  async function pass() {
    shown = false; // hide first: the answer leaves the DOM before anything else
    paint();
    const ack = await app.request(C2S.LADY_PASS);
    if (!ack.ok && ack.code !== 'err.phase') toast(t(ack.code, ack.params), { kind: 'err' });
  }

  // ---------- D14 · the holder chooses ----------

  function chooseList() {
    const game = g();
    const me = game.seats.indexOf(v().you);
    const order = game.seats.map((_, k) => game.seats[(me + k) % game.seats.length]);
    const off = Object.fromEntries(v().players.map((p) => [p.id, !p.connected]));
    return h(
      'div',
      { class: 'plist', role: 'radiogroup', 'aria-label': t('lady.listLabel') },
      order.map((id) => {
        const you = id === v().you;
        const held = lady().pastHolders.includes(id);
        const locked = you || held;
        const on = pick === id;
        let meta = you ? t('lady.thatsYou') : held ? t('lady.disabled') : on ? t('lady.selected') : null;
        if (off[id] && !you) meta = [meta, t('lobby.away')].filter(Boolean).join(' · ');
        return h(
          'button',
          {
            type: 'button',
            class: ['prow', locked && 'is-disabled', on && 'is-selected'],
            role: 'radio',
            key: `lady-${id}`,
            'aria-checked': String(on),
            disabled: locked,
            on: { click: () => { pick = id; paint(); } },
          },
          avatar(game.names[id], { you, off: off[id] }),
          h('span', { class: 'prow-name' }, h('span', { text: game.names[id] }), meta ? h('span', { class: 'prow-meta' }, meta) : null),
          locked ? icon('lock', 'faint', 'row-lock') : h('span', { class: 'tick' }, icon('check')),
        );
      }),
    );
  }

  function chooseDock() {
    if (pick) {
      return [
        button({ label: t('lady.lookInto', { name: g().names[pick] }), ic: 'lady', key: 'look', extra: ['anim-rise'], onClick: inspect }),
        note(t('lady.onlyYou')),
      ];
    }
    return [
      h('button', { type: 'button', class: 'btn btn-primary btn-block', disabled: true, 'aria-describedby': 'lady-why' }, t('lady.lookIntoEmpty')),
      note(t('lady.pickFirst'), { ic: 'info', id: 'lady-why' }),
    ];
  }

  // ---------- D15 · the holder's answer ----------

  // "The Lady passes to Sana. They can use it after Quest 4, but not on you."
  function passPanel() {
    const target = g().names[lady().target];
    const next = lady().afterQuest + 2; // quest number the new holder uses it after
    const more = lady().afterQuest < 3;
    return panel(
      [
        h('span', { class: 'tok tok-lady' }, icon('lady')),
        h('p', { class: 't-label muted grow' }, h('b', { class: 'text-1', text: t('lady.passesTo', { name: target }) }), ' ', more ? t('lady.nextUse', { q: next }) : t('lady.lastUse')),
      ],
      { extra: ['row', 'lady-pass'] },
    );
  }

  function answerContent() {
    const r = result();
    const slot = h('div', { class: 'lady-slot' });
    if (shown && r) {
      reveal?.destroy();
      reveal = null;
      slot.append(ladyCard(v(), r));
      return [slot, h('p', { class: 't-label muted center pretty narrow' }, t('lady.keepNote')), passPanel()];
    }
    // Hidden again: hold to see it, inserted only while held.
    reveal?.destroy();
    const btn = h('button', { type: 'button', class: 'peek', key: 'lady-hold' }, icon('hold'), h('span', {}, t('lady.holdToSee')));
    reveal = bindHold(btn, {
      onShow: () => {
        const res = result();
        if (res) slot.replaceChildren(ladyCard(v(), res));
      },
      onHide: () => slot.replaceChildren(),
    });
    return [slot, btn, passPanel()];
  }

  // ---------- D16 · everyone else ----------

  function watchContent() {
    const game = g();
    const { holder, target } = lady();
    const holderName = nameOf(holder);
    const person = (id) =>
      h('div', { class: 'col lady-person' }, avatar(game.names[id], { size: 56, you: id === v().you, extra: id === target ? ['av-lady'] : [] }), h('span', { class: 't-body b', text: game.names[id] }));
    const past = list(lady().pastHolders.map(nameOf));
    return [
      h(
        'div',
        { class: 'row lady-scene' },
        person(holder),
        h('div', { class: 'lady-centre' }, h('div', { class: 'lady-glow anim-breathe', 'aria-hidden': 'true' }), h('span', { class: 'tok tok-lady tok-88' }, icon('lady', 'ic-48'))),
        target ? person(target) : h('div', { class: 'col lady-person' }, h('span', { class: 'av av-56 av-empty', 'aria-hidden': 'true' }, '?'), h('span', { class: 't-body faint' }, t('lady.notYet'))),
      ),
      h('p', { class: 't-body-l muted pretty narrow' }, target ? t(target === v().you ? 'lady.watchTextYou' : 'lady.watchText', { holder: holderName, target: game.names[target] }) : t('lady.watchChoosing', { holder: holderName })),
      panel(
        [icon('arrow', 'gold'), h('p', { class: 't-label muted' }, target ? [t('lady.nextHolder'), ' ', h('b', { class: 'text-1', text: game.names[target] }), '. '] : null, t('lady.heldBy', { names: past }))],
        { extra: ['row', 'text-left', 'full-width', 'lady-pass'] },
      ),
    ];
  }

  // ---------- paint ----------

  function paintStatus() {
    // D15 (the holder's answer) has no status bar: the private band takes its place.
    if (isHolder() && lady().target) return replace(status, null);
    const away = awayStatus(v(), app);
    const { holder, target } = lady();
    const phase = t('lady.phase', { q: after() });
    let s;
    if (isHolder() && !target) {
      s = { tone: 'you', main: t('lady.youHold'), wait: t('lady.youHoldHint') };
    } else if (target) {
      s = { main: t('lady.looking', { holder: nameOf(holder), target: nameOf(target) }), wait: [dots(), t('lady.onlyHolder', { name: g().names[holder] })] };
    } else {
      s = { main: t('lady.choosing', { holder: g().names[holder] }), wait: [dots(), t('lady.choosingHint')] };
    }
    if (away?.needed) s = { ...s, tone: 'alert', wait: away.wait };
    replace(status, statusBar({ phase, phaseIcon: 'lady', tone: s.tone, right: away ? away.chip : null, main: s.main, wait: s.wait }));
  }

  function paint() {
    const holder = isHolder();
    const answering = holder && !!lady().target;
    paintStatus();
    replace(band, answering ? privateBand() : null);
    content.classList.toggle('content-center', !holder);
    content.classList.toggle('lady-watch', !holder);
    content.classList.toggle('lady-answer', answering);
    if (answering) {
      const key = `${lady().target}:${shown}`;
      if (key !== answerKey) {
        answerKey = key;
        replace(content, answerContent());
      }
    } else {
      answerKey = null;
      reveal?.destroy();
      reveal = null;
      replace(content, holder ? chooseList() : watchContent());
    }

    // The dock is rebuilt only when its shape changes, so a held Peek isn't cut off.
    const key = !holder ? 'watch' : !answering ? `choose:${pick}` : 'pass';
    if (key === dockKey) return;
    dockKey = key;
    peek?.destroy();
    peek = null;
    if (!holder) {
      peek = peekButton(app);
      replace(dock, peek.el);
    } else if (!answering) replace(dock, chooseDock());
    else replace(dock, button({ label: t('lady.hidePass', { name: g().names[lady().target] }), ic: 'eyeoff', key: 'pass', onClick: pass }));
  }

  const el = h('div', { class: 'screen-body' }, gameTopbar(app, { onMenu: () => openMenu(app), onHistory: () => openHistory(app) }), band, status, content, dock);
  paint();
  return {
    el,
    update: paint,
    destroy: () => {
      document.removeEventListener('visibilitychange', onVisibility);
      reveal?.destroy();
      peek?.destroy();
    },
  };
}
