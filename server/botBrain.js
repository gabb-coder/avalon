// What a bot does next, decided from its own view only.
//
// A bot is handed exactly what a phone in its seat would receive:
// viewFor(state, botId). It knows its own role and night info, its own Lady
// results, and everything public (votes by name, quest results, who sat on
// failed teams). It never sees the raw state, so it can't cheat, and nothing
// it does can leak more than a human player in that seat could.
//
//   botDuty(view)            -> a key for what the bot owes the table now, or null
//   botMove(view, rng, plan) -> the intent to send: { type, ...payload }
//
// How well bots play is the host's lobby setting, view.config.botLevel
// (public, like the rest of the config):
//   easy    simple and mistake-prone: Good approves most teams, Evil fails
//           every quest it's on, the Assassin guesses at random
//   normal  plausible: Good backs players who haven't been on failed quests
//           and avoids anyone it knows is Evil; Evil gets onto teams and fails
//           quests (one Fail per team, not always on Quest 1); the Assassin
//           names the Good player who looked best informed
//   clever  Good weighs every way the Evil seats could be filled against the
//           quest results and the voting record; Evil hides better; the
//           Assassin also studies who led clean teams

const GOOD = 'good';

// What this bot owes right now, as a key that changes with each new turn,
// so a turn is acted on once.
export function botDuty(view) {
  const g = view?.game;
  if (!g || !g.seats.includes(view.you)) return null;
  const me = view.you;
  const at = `${g.questIndex}.${g.proposals.length}`;
  switch (view.phase) {
    case 'night':
      return g.ready.includes(me) ? null : 'night';
    case 'propose':
      return g.proposal?.leader === me ? `lead:${at}:${g.proposal.picks.length}` : null;
    case 'vote':
      return g.proposal && !g.proposal.voted.includes(me) ? `vote:${at}` : null;
    case 'vote_reveal':
    case 'quest_result':
      return g.continued.includes(me) ? null : `continue:${g.revealSeq}`;
    case 'quest':
      return g.questPlay?.team.includes(me) && !g.questPlay.played.includes(me) ? `quest:${at}` : null;
    case 'lady':
      return g.lady?.holder === me ? `lady:${g.lady.afterQuest}:${g.lady.target ? 'pass' : 'look'}` : null;
    case 'assassination':
      return g.assassinId === me ? 'guess' : null;
    default:
      return null;
  }
}

// ---------- what the bot believes ----------

// Players this bot knows are Evil, from its night info and Lady results.
// Evil bots know their allies (and themselves); Merlin knows who Evil is.
function knownEvil(view) {
  const g = view.game;
  const out = new Set();
  const night = g.me.night;
  if (night?.kind === 'evil') for (const id of night.seen) out.add(id);
  if (g.me.team === 'evil') out.add(view.you);
  for (const r of g.me.ladyResults) if (r.seenTeam === 'evil') out.add(r.target);
  return out;
}

// Players a Good bot has reason to trust (the Lady showed them Good).
function knownGood(view) {
  return new Set(view.game.me.ladyResults.filter((r) => r.seenTeam === GOOD).map((r) => r.target));
}

// Public suspicion, the way a table reasons. A quest that failed: its team
// (weighted by Fails per member), its leader, and whoever voted to send it
// from outside. A quest that succeeded: whoever voted against it (Evil votes
// against clean teams), while its team earns a little trust.
function suspicion(view) {
  const g = view.game;
  const score = Object.fromEntries(g.seats.map((id) => [id, 0]));
  g.proposals.forEach((p) => {
    if (!p.approved) return;
    const q = g.quests[p.quest];
    if (!q?.result) return;
    if (q.fails > 0) {
      for (const id of p.team) score[id] += (2 * q.fails) / p.team.length;
      score[p.leader] += 0.4;
      for (const id of g.seats) if (p.votes[id] === 'approve' && !p.team.includes(id)) score[id] += 0.3;
    } else {
      for (const id of p.team) score[id] -= 0.3;
      for (const id of g.seats) if (p.votes[id] === 'reject') score[id] += 0.45;
    }
  });
  return score;
}

const shuffle = (rng, xs) => {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---------- decisions ----------

// ---------- Normal: the default ----------

// The team a leader bot wants (itself first; picks are sent one at a time).
function planTeamNormal(view, rng) {
  const g = view.game;
  const me = view.you;
  const size = g.quests[g.questIndex].size;
  const evil = knownEvil(view);
  const sus = suspicion(view);
  const others = shuffle(rng, g.seats.filter((id) => id !== me));
  if (g.me.team === 'evil') {
    // Look trustworthy: take clean-looking players; bring an ally along now and then.
    const allies = others.filter((id) => evil.has(id));
    const rest = others.filter((id) => !evil.has(id)).sort((a, b) => sus[a] - sus[b]);
    const team = [me];
    if (size >= 3 && allies.length && rng.next() < 0.3) team.push(allies[0]);
    for (const id of rest) if (team.length < size) team.push(id);
    for (const id of allies) if (team.length < size && !team.includes(id)) team.push(id);
    return team.slice(0, size);
  }
  const trusted = knownGood(view);
  const ranked = others
    .filter((id) => !evil.has(id))
    .sort((a, b) => (trusted.has(b) ? 1 : 0) - (trusted.has(a) ? 1 : 0) || sus[a] - sus[b]);
  const team = [me, ...ranked].slice(0, size);
  // Only when there's no one else left does a known Evil player get a place.
  for (const id of others) if (team.length < size && !team.includes(id)) team.push(id);
  return team;
}

function voteNormal(view, rng) {
  const g = view.game;
  const team = g.proposal.team;
  const evil = knownEvil(view);
  const lastChance = g.rejects >= 4; // a 5th rejection is an Evil win
  if (g.me.team === 'evil') {
    const evilOnTeam = team.some((id) => evil.has(id));
    if (lastChance) return evilOnTeam || rng.next() < 0.15; // let it be rejected
    return evilOnTeam ? true : rng.next() < 0.4; // blend in now and then
  }
  if (lastChance || g.proposal.leader === view.you) return true;
  // Merlin knows who is Evil but must not vote like it: a perfect record gives
  // them away to the Assassin. So the knowledge only sometimes shows.
  const merlin = g.me.role === 'merlin';
  const trusted = knownGood(view);
  const ladyEvil = new Set(g.me.ladyResults.filter((r) => r.seenTeam === 'evil').map((r) => r.target));
  if (team.some((id) => ladyEvil.has(id))) return false;
  if (merlin && team.some((id) => evil.has(id)) && rng.next() < 0.6) return false;
  // Anyone who sat on a failed quest is suspect, unless the Lady cleared them.
  const sus = suspicion(view);
  const suspects = team.filter((id) => id !== view.you && sus[id] > 0.3 && !trusted.has(id));
  if (suspects.length) return g.rejects >= 3 && rng.next() < 0.5; // running out of chances
  // A team that looks clean gets Good's vote: Evil votes against clean teams,
  // so Good can't afford to hold back.
  return team.includes(view.you) || rng.next() < 0.95;
}

function cardNormal(view, rng) {
  const g = view.game;
  if (g.me.team !== 'evil') return 'success';
  const quest = g.quests[g.questIndex];
  const evil = knownEvil(view);
  const alliesOnTeam = g.questPlay.team.filter((id) => evil.has(id)).sort();
  if (quest.failsNeeded > 1) return alliesOnTeam.length >= quest.failsNeeded ? 'fail' : 'success';
  // One Fail is enough: only the first ally (by id) plays it, so two don't show.
  if (alliesOnTeam[0] !== view.you) return 'success';
  if (g.questIndex === 0) return rng.next() < 0.5 ? 'fail' : 'success';
  return rng.next() < 0.9 ? 'fail' : 'success';
}

function ladyNormal(view, rng) {
  const g = view.game;
  const choices = g.seats.filter((id) => id !== view.you && !g.lady.pastHolders.includes(id));
  if (g.me.team === 'evil') return shuffle(rng, choices)[0];
  const evil = knownEvil(view);
  const sus = suspicion(view);
  // Look into the most suspicious player not already known.
  const unknown = choices.filter((id) => !evil.has(id));
  const pool = unknown.length ? unknown : choices;
  return shuffle(rng, pool).sort((a, b) => sus[b] - sus[a])[0];
}

// The Assassin's guess: the Good player whose votes looked best informed
// (rejecting teams with Evil on them, approving clean ones) and who stayed
// off failed quests.
function guessNormal(view, rng) {
  const g = view.game;
  const evil = new Set(g.evilIds);
  const targets = shuffle(rng, g.seats.filter((id) => !evil.has(id)));
  const sus = suspicion(view);
  const score = Object.fromEntries(targets.map((id) => [id, -sus[id]]));
  for (const p of g.proposals) {
    const dirty = p.team.some((id) => evil.has(id));
    for (const id of targets) {
      const v = p.votes[id];
      if (!v) continue;
      if ((dirty && v === 'reject') || (!dirty && v === 'approve')) score[id] += 1;
    }
  }
  return targets.sort((a, b) => score[b] - score[a])[0];
}

// ---------- Easy: simple and mistake-prone ----------

function planTeamEasy(view, rng) {
  const g = view.game;
  const size = g.quests[g.questIndex].size;
  const ladyEvil = new Set(g.me.ladyResults.filter((r) => r.seenTeam === 'evil').map((r) => r.target));
  const others = shuffle(rng, g.seats.filter((id) => id !== view.you));
  const ranked = [...others.filter((id) => !ladyEvil.has(id)), ...others.filter((id) => ladyEvil.has(id))];
  return [view.you, ...ranked].slice(0, size);
}

function voteEasy(view, rng) {
  const g = view.game;
  const team = g.proposal.team;
  const evil = knownEvil(view);
  if (g.rejects >= 4) return g.me.team === 'evil' ? team.some((id) => evil.has(id)) : true;
  if (g.me.team === 'evil') return team.some((id) => evil.has(id)) || rng.next() < 0.3;
  if (g.proposal.leader === view.you || team.includes(view.you)) return true;
  if (g.me.ladyResults.some((r) => r.seenTeam === 'evil' && team.includes(r.target))) return false;
  // Merlin rarely acts on what they know; everyone else mostly goes along.
  if (g.me.role === 'merlin' && team.some((id) => evil.has(id)) && rng.next() < 0.25) return false;
  return rng.next() < 0.75;
}

// Easy Evil never holds back, so double Fails give it away.
const cardEasy = (view) => (view.game.me.team === 'evil' ? 'fail' : 'success');

function ladyEasy(view, rng) {
  const g = view.game;
  return shuffle(rng, g.seats.filter((id) => id !== view.you && !g.lady.pastHolders.includes(id)))[0];
}

function guessEasy(view, rng) {
  const evil = new Set(view.game.evilIds);
  return shuffle(rng, view.game.seats.filter((id) => !evil.has(id)))[0];
}

// ---------- Clever: weigh every way the Evil seats could be filled ----------

function* subsets(items, k, start = 0, pick = []) {
  if (pick.length === k) {
    yield pick;
    return;
  }
  for (let i = start; i <= items.length - (k - pick.length); i++) yield* subsets(items, k, i + 1, [...pick, items[i]]);
}

// For a Good bot: the chance each player is Evil, and a way to ask how likely
// a team is to be clean. Every possible Evil set (at most 210 of them) is
// kept if it fits what this bot knows (its own seat, Merlin's or Percival's
// night info, the Lady's answers, each quest's Fail count) and weighed by
// how well it explains the votes: Evil backs teams with Evil on them and
// often turns down clean ones; Good mostly backs teams that look clean.
function worlds(view) {
  const g = view.game;
  const nEvil = view.setup.evil;
  const mustGood = new Set([view.you]);
  const mustEvil = new Set();
  const night = g.me.night;
  if (g.me.role === 'merlin' && night?.kind === 'evil') for (const id of night.seen) mustEvil.add(id);
  if (night?.kind === 'sure') for (const id of night.seen) mustGood.add(id);
  const maybePair = night?.kind === 'maybe' ? night.seen : null; // Merlin and Morgana: exactly one is Evil
  for (const r of g.me.ladyResults) (r.seenTeam === 'evil' ? mustEvil : mustGood).add(r.target);
  const decided = g.proposals.filter((p) => p.approved && g.quests[p.quest]?.result);
  const list = [];
  let total = 0;
  for (const set of subsets(g.seats.filter((id) => !mustGood.has(id)), nEvil)) {
    const evil = new Set(set);
    if ([...mustEvil].some((id) => !evil.has(id))) continue;
    if (maybePair && maybePair.filter((id) => evil.has(id)).length !== 1) continue;
    let w = 1;
    for (const p of decided) {
      const q = g.quests[p.quest];
      const onTeam = p.team.filter((id) => evil.has(id)).length;
      if (q.fails > onTeam) {
        w = 0;
        break;
      }
      if (q.fails === 0 && onTeam > 0) w *= 0.3 ** onTeam; // Evil on a clean quest held back
    }
    if (!w) continue;
    for (const p of g.proposals) {
      const dirty = p.team.some((id) => evil.has(id));
      for (const id of g.seats) {
        const v = p.votes[id];
        if (!v || id === view.you) continue;
        const pApprove = evil.has(id) ? (dirty ? 0.9 : 0.4) : dirty ? 0.6 : 0.85;
        w *= v === 'approve' ? pApprove : 1 - pApprove;
      }
    }
    list.push({ evil, w });
    total += w;
  }
  const odds = Object.fromEntries(g.seats.map((id) => [id, 0]));
  if (!total) return null; // nothing fits (Evil played oddly): fall back to Normal's reasoning
  for (const { evil, w } of list) for (const id of evil) odds[id] += w / total;
  const clean = (team) => list.reduce((sum, { evil, w }) => sum + (team.some((id) => evil.has(id)) ? 0 : w), 0) / total;
  return { odds, clean };
}

function planTeamClever(view, rng) {
  const g = view.game;
  if (g.me.team === 'evil') return planTeamNormal(view, rng);
  const model = worlds(view);
  if (!model) return planTeamNormal(view, rng);
  const size = g.quests[g.questIndex].size;
  // Merlin, leading, quietly leaves out the Evil they know.
  const avoid = g.me.role === 'merlin' ? knownEvil(view) : new Set();
  const others = shuffle(rng, g.seats.filter((id) => id !== view.you)).sort((a, b) => (avoid.has(a) ? 1 : 0) - (avoid.has(b) ? 1 : 0) || model.odds[a] - model.odds[b]);
  return [view.you, ...others].slice(0, size);
}

function voteClever(view, rng) {
  const g = view.game;
  const team = g.proposal.team;
  const evil = knownEvil(view);
  const lastChance = g.rejects >= 4;
  if (g.me.team === 'evil') {
    const evilOnTeam = team.some((id) => evil.has(id));
    if (lastChance) return evilOnTeam;
    return evilOnTeam ? true : rng.next() < 0.85; // blends in: backs clean teams as often as Good does
  }
  if (lastChance || g.proposal.leader === view.you) return true;
  const model = worlds(view);
  if (!model) return voteNormal(view, rng);
  // Merlin votes like an ordinary knight reading the table, with the odd
  // veto: perfect votes would hand the Assassin the answer.
  if (g.me.role === 'merlin' && team.some((id) => evil.has(id)) && rng.next() < 0.5) return false;
  const p = model.clean(team);
  const need = g.rejects >= 3 ? 0.25 : team.includes(view.you) ? 0.35 : 0.5;
  return p >= need;
}

function cardClever(view, rng) {
  const g = view.game;
  if (g.me.team !== 'evil') return 'success';
  const quest = g.quests[g.questIndex];
  const evil = knownEvil(view);
  const alliesOnTeam = g.questPlay.team.filter((id) => evil.has(id)).sort();
  if (quest.failsNeeded > 1) return alliesOnTeam.length >= quest.failsNeeded ? 'fail' : 'success';
  if (alliesOnTeam[0] !== view.you) return 'success';
  const wins = g.quests.filter((q) => q.result === 'success').length;
  const losses = g.quests.filter((q) => q.result === 'fail').length;
  // When a quest decides the game, always strike. Early on, hide now and then.
  if (wins === 2 || losses === 2) return 'fail';
  if (g.questIndex === 0) return rng.next() < 0.2 ? 'fail' : 'success';
  return rng.next() < 0.85 ? 'fail' : 'success';
}

function ladyClever(view, rng) {
  const g = view.game;
  if (g.me.team === 'evil') return ladyNormal(view, rng);
  const model = worlds(view);
  if (!model) return ladyNormal(view, rng);
  // The most useful look: whoever the bot is least sure about.
  const choices = shuffle(rng, g.seats.filter((id) => id !== view.you && !g.lady.pastHolders.includes(id)));
  return choices.sort((a, b) => Math.abs(model.odds[a] - 0.5) - Math.abs(model.odds[b] - 0.5))[0];
}

// The Assassin reads the whole game, knowing who Evil was: Merlin's votes
// tend to be right, and when Merlin led, the team tended to be clean.
function guessClever(view, rng) {
  const g = view.game;
  const evil = new Set(g.evilIds);
  const targets = shuffle(rng, g.seats.filter((id) => !evil.has(id)));
  const score = Object.fromEntries(targets.map((id) => [id, 0]));
  for (const p of g.proposals) {
    const dirty = p.team.some((id) => evil.has(id));
    if (score[p.leader] !== undefined) score[p.leader] += dirty ? -2 : 1;
    for (const id of targets) {
      const v = p.votes[id];
      if (!v) continue;
      if (dirty) score[id] += v === 'reject' ? 1.5 : -1;
      else score[id] += v === 'approve' ? 0.5 : -0.5;
    }
  }
  return targets.sort((a, b) => score[b] - score[a])[0];
}

// ---------- by level ----------

const LEVELS = {
  easy: { plan: planTeamEasy, vote: voteEasy, card: cardEasy, lady: ladyEasy, guess: guessEasy },
  normal: { plan: planTeamNormal, vote: voteNormal, card: cardNormal, lady: ladyNormal, guess: guessNormal },
  clever: { plan: planTeamClever, vote: voteClever, card: cardClever, lady: ladyClever, guess: guessClever },
};
const play = (view) => LEVELS[view.config?.botLevel] || LEVELS.normal;

// The team a leader bot wants (itself first).
export const planTeam = (view, rng) => play(view).plan(view, rng);

// The next intent for this bot. `plan` keeps a leader's chosen team between
// picks (the bot sends them one at a time, like a person tapping).
export function botMove(view, rng, plan = {}) {
  const g = view.game;
  switch (view.phase) {
    case 'night':
      return { type: 'NIGHT_ACK' };
    case 'propose': {
      if (!plan.team) plan.team = planTeam(view, rng);
      const picks = g.proposal.picks;
      const next = plan.team.find((id) => !picks.includes(id));
      const exact = picks.length === plan.team.length && plan.team.every((id) => picks.includes(id));
      if (next && !exact) return { type: 'SELECT', team: [...picks.filter((id) => plan.team.includes(id)), next] };
      return { type: 'PROPOSE', team: plan.team.slice() };
    }
    case 'vote':
      return { type: 'VOTE', approve: play(view).vote(view, rng) };
    case 'vote_reveal':
    case 'quest_result':
      return { type: 'CONTINUE' };
    case 'quest':
      return { type: 'PLAY', card: play(view).card(view, rng) };
    case 'lady':
      return g.lady.target ? { type: 'LADY_PASS' } : { type: 'LADY_INSPECT', target: play(view).lady(view, rng) };
    case 'assassination':
      return { type: 'GUESS', target: play(view).guess(view, rng) };
    default:
      return null;
  }
}
