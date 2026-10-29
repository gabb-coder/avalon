# Playtest checklist: 5 phones

A manual pass over everything automated tests can't feel: real phones, real Wi-Fi, real people. Use the Render address (README → *Deploy to Render*), so that `https://` features work (keeping the screen awake, sharing).

**You need:** 5 phones (ideally a mix of iPhone and Android), one person per phone, about 45 minutes. One person keeps notes.

**When something goes wrong, note:** what you tapped, what you expected, what happened, the time, the phone (model and browser), and the room code. A screenshot helps. On Render, **avalon-server → Logs** shows each room's events by room code (never names, roles or votes).

Tick each box as you go.

## 1. Waking up and joining

- [ ] After the server has been idle 15+ minutes, open the game address: the page appears at once. Creating a room shows "Lighting the candles…", then the lobby within a minute.
- [ ] If it takes over 45 seconds, "Try again" appears.
- [ ] Phone 2 joins by typing the 4-letter code.
- [ ] Phone 3 joins through the host's share button (link or message). The code is already filled in.
- [ ] A wrong code says the room doesn't exist. A name already taken suggests another ("Rowan B").
- [ ] Phones 4 and 5 join. Everyone sees all 5 names appear live.

## 2. Lobby

- [ ] The host's Start button explains why it's disabled with fewer than 5 players.
- [ ] The host turns Percival and Morgana on. Every phone shows the change.
- [ ] The host removes a player, ticking "block from rejoining". That phone shows "You were removed" and can't rejoin, even under another name.
- [ ] Without the block, a removed player can rejoin. (Get back to 5 players.)
- [ ] The host hands the host role to another player from the Menu. The crown moves.
- [ ] Phone 2 reloads the page in the lobby: it comes straight back in, same seat.

## 3. Night (roles)

- [ ] Nobody's role shows until they hold the card. Letting go hides it at once.
- [ ] Hold, then switch apps or lock the phone while holding: the role is hidden when you come back.
- [ ] "I've seen my role" works only after a first hold.
- [ ] After the game, compare notes out loud:
  - Merlin saw exactly the Evil players.
  - Percival saw Merlin and Morgana, without knowing which is which.
  - Evil saw each other.
  - Loyal Servants saw no one.

## 4. A full round

- [ ] The leader's phone buzzes (Android) and says "You lead". Others see who is choosing.
- [ ] As the leader taps names, they light up on everyone's ring within a moment.
- [ ] Picking too many or too few disables Send, with the reason underneath.
- [ ] Everyone votes. After "Lock in", your screen says your vote is locked but never which way, even after a reload.
- [ ] The reveal shows every vote by name, then Approved or Rejected. Skip jumps to the end. Continue moves on once everyone has pressed it.
- [ ] Reject a team on purpose: the reject counter goes up and the next player leads.
- [ ] On the quest, a Good player sees Fail locked, with the reason. Evil can choose either card. Players not on the team see "The team is on the quest".
- [ ] The result shows the shuffled cards and the count, never who played what.
- [ ] Vote history (the table icon) shows every proposal. Tapping a name follows that player.

## 5. Lady of the Lake (the host turns it on before a game)

- [ ] After Quest 2, the holder picks a player (themselves and past holders locked) and sees that player's team on a light card that nobody else sees.
- [ ] Switch apps while the answer is showing: it's hidden on return, and "Hold to see the answer again" works.
- [ ] Everyone else sees "X is looking into Y". The Lady passes to Y.
- [ ] The holder can see the answer again later with "Hold to peek".

## 6. Endings

- [ ] Good wins 3 quests: the screen turns red. The Assassin picks from a list where the Evil allies are locked. Everyone else sees all Evil players named.
- [ ] Naming someone asks for a 1.5-second hold. Letting go early cancels.
- [ ] Game over shows the winner, the reason, everyone's role and all the votes.
- [ ] One player presses Play again. The others keep reading the summary until they press it too.
- [ ] Also play to an Evil win at least once: 3 failed quests, or 5 rejected teams in a row.

## 7. Phones being phones

- [ ] Mid-game, turn one phone to airplane mode for 10 seconds:
  - that phone shows "Reconnecting…";
  - the others see it as offline;
  - it comes back by itself, with its role and vote intact.
- [ ] Airplane mode for 40 seconds: "Connection lost" appears with a countdown, and the game resumes when the network returns.
- [ ] While that player is offline and needed (say, they haven't voted), the game waits for them. After 2 minutes, the host's status bar offers "End game for everyone".
- [ ] Lock a phone for 2 minutes mid-game and unlock it: it picks up where it was.
- [ ] The screen doesn't dim or lock during a game, but does in the lobby.
- [ ] "Vibrate on my turn" buzzes on Android when it's your turn (leader, vote, quest). Turning it off in the Menu stops it. iPhones never vibrate (a Safari limit).
- [ ] Menu → Leave game mid-game: Home offers "Back to room?" and rejoining works.
- [ ] The host ends the game from the Menu: everyone sees the room closed, and the host's phone says they ended it.

## 8. Comfort and access

- [ ] Menu → Text size 130%: every screen stays readable, with nothing cut off or overlapping.
- [ ] Menu → Reduce motion: reveals fade instead of flipping, and nothing pulses.
- [ ] Turn the phone sideways and back: nothing breaks.
- [ ] On a tablet, if you have one, team building shows the ring and vote history side by side.
- [ ] With a screen reader on (VoiceOver or TalkBack), you can find and use the vote buttons.
- [ ] One player switches to 中文 (Home → Settings, or Menu → Display) mid-game: their phone changes language at once and the game carries on; everyone else stays in their own language.
- [ ] A Chinese speaker reads through a whole game in Chinese and notes any wording that feels unnatural.

## Afterwards

- [ ] Ask everyone: was anything confusing? Did anyone see something they shouldn't have?
- [ ] Note anything that felt slow, and on which phone.
