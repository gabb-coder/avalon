// Phone features (HANDOFF §5): keep the screen awake during a game, and a
// short buzz when it becomes your turn.
//
// PRIVACY: the buzz is always the same pattern, whatever the phase, your role
// or the result, and it fires only for turns the whole table can see are
// yours (leader, voter, team member, Lady holder, the named Assassin). A
// vibration is something a neighbour can feel, so it must never carry a secret.

import { prefs } from './prefs.js';

const BUZZ = [60, 40, 60];

// ---------- Screen Wake Lock ----------

let wanted = false;
let lock = null;

async function acquire() {
  if (!wanted || lock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => {
      lock = null;
    });
    if (!wanted) release(); // the game ended while we were asking
  } catch {
    lock = null; // refused (low battery, not allowed): the phone just sleeps as usual
  }
}

function release() {
  const l = lock;
  lock = null;
  l?.release().catch(() => {});
}

// The browser drops the lock whenever the page is hidden; take it again on return.
// (`?.` so the module also loads in Node for tests.)
globalThis.document?.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') acquire();
});

// On during a game; off in the lobby, at game over and outside rooms.
export function keepAwake(on) {
  if (on === wanted) return;
  wanted = on;
  if (on) acquire();
  else release();
}

// ---------- Your turn ----------

// A key for the action this player owes the table right now, or null. A new
// key means a new turn (the next proposal, the next vote…), so the same turn
// never buzzes twice, e.g. after a reconnect.
export function turnKey(view) {
  const g = view?.game;
  if (!g) return null;
  const me = view.you;
  const at = `${g.questIndex}.${g.proposals.length}`;
  switch (view.phase) {
    case 'propose':
      return g.proposal?.leader === me ? `lead:${at}` : null;
    case 'vote':
      return g.proposal && !g.proposal.voted.includes(me) ? `vote:${at}` : null;
    case 'quest':
      return g.questPlay?.team.includes(me) && !g.questPlay.played.includes(me) ? `quest:${at}` : null;
    case 'lady':
      return g.lady?.holder === me && !g.lady.target ? `lady:${g.lady.afterQuest}` : null;
    case 'assassination':
      return g.assassinId === me ? 'guess' : null;
    default:
      return null;
  }
}

export function buzz() {
  if (!prefs.vibrate || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(BUZZ);
  } catch {
    // not allowed yet (no tap on the page so far): skip silently
  }
}
