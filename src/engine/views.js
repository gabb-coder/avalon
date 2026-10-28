// viewFor(state, playerId): the one and only way game state leaves the server.
//
// Each view is built field by field from an explicit whitelist. Nothing is
// spread or copied wholesale from the raw state, so adding a secret field to
// the state can never leak it by accident. What each player may see:
//
//   - their own role, team and night info (never anyone else's)
//   - their own Lady of the Lake results (never anyone else's)
//   - WHO has voted or played, never HOW, until the reveal
//   - after a vote: every vote by name; after a quest: shuffled cards and counts
//     only (who played which card is wiped from the state at the reveal)
//   - during the assassination: who is Evil (by team, not role) and who the
//     Assassin is, so Evil can confer and the table knows who is choosing
//   - at game over: every role
//
// Your own vote and quest card are not echoed back either, so a glance at a
// neighbour's phone (or its network traffic) can't reveal them.

import { checkSetup, teamOf, EVIL } from './rules.js';

export function viewFor(state, viewerId) {
  const inRoom = state.players.some((p) => p.id === viewerId);
  if (!inRoom) return null;
  return {
    code: state.code,
    phase: state.phase,
    you: viewerId,
    hostId: state.hostId,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      disconnectedAt: p.disconnectedAt,
    })),
    config: publicConfig(state.config),
    setup: checkSetup(state.config, state.players.length),
    game: state.game ? gameView(state, viewerId) : null,
    lastGame: state.lastGame ? JSON.parse(JSON.stringify(state.lastGame)) : null, // public summary
  };
}

function publicConfig(c) {
  return {
    percival: c.percival,
    morgana: c.morgana,
    mordred: c.mordred,
    oberon: c.oberon,
    lady: c.lady,
    oberonSeenByMerlin: c.oberonSeenByMerlin,
  };
}

function gameView(state, viewerId) {
  const g = state.game;
  const phase = state.phase;
  const over = phase === 'game_over';
  const seated = g.seats.includes(viewerId);
  const role = seated ? g.roles[viewerId] : null;
  const night = seated ? g.night[viewerId] : null;

  const view = {
    seats: g.seats.slice(),
    names: { ...g.names },
    questIndex: g.questIndex,
    quests: g.quests.map((q) => ({
      size: q.size,
      failsNeeded: q.failsNeeded,
      result: q.result,
      fails: q.fails,
      successes: q.successes,
      cards: q.cards ? q.cards.slice() : null, // already shuffled
    })),
    leader: g.seats[g.leader],
    firstLeader: g.seats[g.firstLeader],
    rejects: g.rejects,
    ready: g.ready.slice(),
    proposal: g.proposal
      ? {
          leader: g.proposal.leader,
          picks: g.proposal.picks.slice(),
          team: g.proposal.team ? g.proposal.team.slice() : null,
          voted: Object.keys(g.proposal.votes), // who, never how
        }
      : null,
    proposals: g.proposals.map((p) => ({
      quest: p.quest,
      attempt: p.attempt,
      leader: p.leader,
      team: p.team.slice(),
      votes: { ...p.votes }, // only resolved proposals live here
      approved: p.approved,
    })),
    questPlay: g.questPlay ? { team: g.questPlay.team.slice(), played: g.questPlay.played.slice() } : null,
    continued: g.continued.slice(),
    revealSeq: g.revealSeq,
    lady: g.lady
      ? {
          holder: g.lady.holder,
          pastHolders: g.lady.pastHolders.slice(),
          target: g.lady.target,
          afterQuest: g.lady.afterQuest,
        }
      : null,
    waitingOn: waitingOn(state),
    me: {
      role,
      team: role ? teamOf(role) : null,
      night: night ? { kind: night.kind, seen: night.seen.slice() } : null,
      ladyResults: g.lady
        ? g.lady.results
            .filter((r) => r.holder === viewerId)
            .map((r) => ({ target: r.target, seenTeam: r.seenTeam, afterQuest: r.afterQuest }))
        : [],
    },
    assassinId: null, // key names never match role or team words, so string-search leak tests stay exact
    evilIds: null,
    guess: null,
    winner: null,
    winReason: null,
    roles: null,
  };

  if (phase === 'assassination' || over) {
    view.assassinId = g.seats.find((id) => g.roles[id] === 'assassin');
    view.evilIds = g.seats.filter((id) => teamOf(g.roles[id]) === EVIL);
  }
  if (over) {
    view.roles = { ...g.roles };
    view.guess = g.guess;
    view.winner = g.winner;
    view.winReason = g.winReason;
  }
  return view;
}

// Who the table is waiting on right now. Public: it names people, not secrets.
// (In the assassination phase it names the Assassin, who is public by then.)
export function waitingOn(state) {
  const g = state.game;
  if (!g) return [];
  switch (state.phase) {
    case 'night':
      return g.seats.filter((id) => !g.ready.includes(id));
    case 'propose':
      return [g.proposal.leader];
    case 'vote':
      return g.seats.filter((id) => !(id in g.proposal.votes));
    case 'vote_reveal':
    case 'quest_result':
      return g.seats.filter((id) => !g.continued.includes(id));
    case 'quest':
      return g.questPlay.team.filter((id) => !g.questPlay.played.includes(id));
    case 'lady':
      return [g.lady.holder];
    case 'assassination':
      return g.seats.filter((id) => g.roles[id] === 'assassin');
    default:
      return [];
  }
}
