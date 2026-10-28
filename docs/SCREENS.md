# Screen index

Every artboard on the Avalon canvas, grouped by canvas page. Files are in `design/screens/`. Phone screens are 390×844 unless noted. Screens marked *interactive* have working controls in the prototype (their `renderVals()` logic shows the intended behaviour).

## 1 · Design system

| Screen | File | Size | Notes |
|---|---|---|---|
| Cover · flow map · start prototype | `Main.dc.html` | 1440×960 | interactive |
| Foundations · tokens | `Foundations.dc.html` | 1440×2100 |  |
| Components · all states | `Components.dc.html` | 1440×2760 |  |
| Logo & iconography | `Iconography.dc.html` | 1440×1100 |  |
| Role cards · back + every front | `RoleCards.dc.html` | 1760×1380 |  |

## 2 · Entry & lobby

| Screen | File | Size | Notes |
|---|---|---|---|
| A1 · Splash | `A1-Splash.dc.html` | 390×844 | interactive |
| A2 · Home | `A2-Home.dc.html` | 390×844 | interactive |
| A3 · Join room | `A3-Join.dc.html` | 390×844 | interactive |
| A4 · Join · validation | `A4-JoinErrors.dc.html` | 390×844 | interactive |
| A5 · Join · game already started | `A5-JoinBlocked.dc.html` | 390×844 | interactive |
| A6 · Waking up the server | `A6-Waking.dc.html` | 390×844 | interactive |
| B1 · Lobby · host | `B1-LobbyHost.dc.html` | 390×844 | interactive |
| B2 · Lobby · host, not enough players | `B2-LobbyHostFew.dc.html` | 390×844 |  |
| B3 · Lobby · guest | `B3-LobbyGuest.dc.html` | 390×844 | interactive |
| B4 · Role glossary sheet | `B4-Glossary.dc.html` | 390×844 | interactive |

## 3 · Night

| Screen | File | Size | Notes |
|---|---|---|---|
| C1 · Role card · hold to reveal (works) | `C1-RoleHidden.dc.html` | 390×844 | interactive |
| C2 · Role card · revealed (Merlin) | `C2-RoleRevealed.dc.html` | 390×844 | interactive |
| C3 · Seen my role · waiting | `C3-NightWaiting.dc.html` | 390×844 | interactive |

## 4 · Board & quests

| Screen | File | Size | Notes |
|---|---|---|---|
| D1 · Board · Quest 1, you lead | `D1-Board.dc.html` | 390×844 | interactive |
| D2 · Propose · leader (works) | `D2-ProposeLeader.dc.html` | 390×844 | interactive |
| D3 · Propose · too many | `D3-ProposeTooMany.dc.html` | 390×844 |  |
| D4 · Propose · watching the leader | `D4-ProposeWatch.dc.html` | 390×844 |  |
| D5 · Vote · two-step (works) | `D5-Vote.dc.html` | 390×844 | interactive |
| D6 · Vote locked · waiting on | `D6-VoteLocked.dc.html` | 390×844 | interactive |
| D7 · Vote reveal · approved | `D7-RevealApproved.dc.html` | 390×844 | interactive |
| D8 · Vote reveal · rejected | `D8-RevealRejected.dc.html` | 390×844 |  |
| D9 · Quest · Good member (works) | `D9-QuestPlay.dc.html` | 390×844 | interactive |
| D10 · Quest · Evil member | `D10-QuestPlayEvil.dc.html` | 390×844 |  |
| D11 · Quest · not on the team | `D11-QuestAway.dc.html` | 390×844 |  |
| D12 · Quest result · success | `D12-ResultSuccess.dc.html` | 390×844 | interactive |
| D13 · Quest 4 · one fail isn't enough | `D13-ResultQ4.dc.html` | 390×844 | interactive |
| D14 · Lady · choose (works) | `D14-LadyChoose.dc.html` | 390×844 | interactive |
| D15 · Lady · private result + pass | `D15-LadyResult.dc.html` | 390×844 | interactive |
| D16 · Lady · everyone else | `D16-LadyWatch.dc.html` | 390×844 |  |
| D17 · Board · mid-game, player offline | `D17-BoardMid.dc.html` | 390×844 | interactive |

## 5 · History & endgame

| Screen | File | Size | Notes |
|---|---|---|---|
| E1 · History drawer | `E1-History.dc.html` | 390×844 | interactive |
| E2 · History · 10 players at 360 | `E2-History10.dc.html` | 360×740 |  |
| E3 · How to play sheet | `E3-HowToPlay.dc.html` | 390×844 | interactive |
| E4 · Menu sheet | `E4-Menu.dc.html` | 390×844 | interactive |
| F1 · Assassination · Assassin picks (works) | `F1-AssassinPick.dc.html` | 390×844 | interactive |
| F2 · Assassination · serious confirm | `F2-AssassinConfirm.dc.html` | 390×844 |  |
| F3 · Assassination · everyone else | `F3-AssassinWait.dc.html` | 390×844 | interactive |
| F4 · Game over | `F4-GameOver.dc.html` | 390×844 | interactive |

## 6 · System states

| Screen | File | Size | Notes |
|---|---|---|---|
| G1 · Reconnecting… | `G1-Reconnecting.dc.html` | 390×844 |  |
| G2 · Connection lost | `G2-ConnLost.dc.html` | 390×844 |  |
| G3 · Room ended | `G3-RoomEnded.dc.html` | 390×844 |  |
| G4 · Host left · transfer | `G4-HostLeft.dc.html` | 390×844 |  |
| G5 · Confirm · leave game | `G5-LeaveConfirm.dc.html` | 390×844 |  |
| G6 · Confirm · kick player | `G6-KickConfirm.dc.html` | 390×844 |  |

## 7 · Sizes, tablet & i18n

| Screen | File | Size | Notes |
|---|---|---|---|
| S1 · Board at 360 × 740 | `S1-Board360.dc.html` | 360×740 |  |
| S2 · Board at 430 × 932 | `S2-Board430.dc.html` | 430×932 |  |
| S3 · Board · tablet portrait | `S3-Tablet.dc.html` | 834×1194 |  |
| S4 · Vote · Chinese | `S4-VoteZh.dc.html` | 390×844 |  |
| S5 · 130% text + long strings at 360 | `S5-Board130.dc.html` | 360×740 |  |

## 8 · Developer handoff

| Screen | File | Size | Notes |
|---|---|---|---|
| Developer handoff | `Handoff.dc.html` | page |  |

