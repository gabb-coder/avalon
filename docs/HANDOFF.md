# Avalon — developer handoff (v1)

Extracted from the "8 · Developer handoff" page of the Avalon design canvas. The design targets a vanilla HTML/CSS/JS client. Everything on the canvas is drawn with one stylesheet, `design/rt.css`, which can ship as-is: tokens, components and icons (inline SVG as CSS masks). No images, no icon font, no framework.

## 1 · Setup

Suggested client files:

```
index.html     one page, screens as <template>s
rt.css         tokens + components + icons (copy from design/rt.css)
app.js         state machine + render(phase)
net.js         socket, reconnect, seat token
i18n/en.json   every string, ICU plurals
i18n/zh.json
```

Head:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0A0F1E">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;700&family=Cormorant+Garamond:wght@500;600;700&display=swap">
<link rel="stylesheet" href="rt.css">
```

Shell: root element is `.phone` at `width: 100%; height: 100dvh` in production (fixed 390×844 only on the canvas). Order inside: **topbar → status → content (scrolls) → dock**. Add `env(safe-area-inset-*)` to topbar top and dock bottom padding. The dock rides above the keyboard via `visualViewport`.

## 2 · Tokens (CSS custom properties)

Declared on `:root, .rt, .phone` so that setting `--ts` on the shell re-derives every type size. Excerpt; the full set is in rt.css §1.

```css
:root, .rt, .phone {
  /* surfaces */   --ink:#070B16; --bg:#0A0F1E; --surface-1:#121A2E; --surface-2:#1A2440; --surface-3:#243052; --scrim:rgba(3,5,12,.72);
  /* lines */      --line:rgba(214,178,94,.26); --line-strong:rgba(214,178,94,.55); --line-quiet:rgba(243,235,221,.10);
  /* gold */       --gold:#D6B25E; --gold-hi:#F0D58C; --gold-lo:#9C7A2F; --on-gold:#1A1408;
  /* parchment */  --parchment:#EFE3C8; --parchment-2:#E2D0A8; --on-parchment:#2A2118; --on-parchment-2:#5A4A35;
  /* text */       --text-1:#F3EBDD; --text-2:#BDB5A6; --text-3:#948C7D;
  /* teams */      --good:#6FD0DA; --good-fill:#1C5A63; --on-good-fill:#E6FBFD; --good-ink:#17636C; --good-wash:rgba(111,208,218,.12);
                   --evil:#F0707F; --evil-fill:#8C1D30; --on-evil-fill:#FFE9EC; --evil-ink:#962036; --evil-wash:rgba(240,112,127,.12);
  /* votes */      --approve:#E2C46E; --on-approve:#1A1408; --reject:#A9B1D1; --reject-fill:#1E2742;
  /* results */    --success:var(--good); --success-fill:var(--good-fill); --fail:var(--evil); --fail-fill:var(--evil-fill);
  /* feedback */   --warn:#F2A65A; --danger:#F0707F; --info:#8FB8F0; --focus:#F0D58C;
  /* risk ramp */  --risk-1:#8E96B8; --risk-2:#A9B1D1; --risk-3:#F2C25A; --risk-4:#F2A65A; --risk-5:#F0707F;

  /* type */       --font-display:"Cormorant Garamond","Noto Serif SC","Songti SC",Georgia,serif;
                   --font-ui:"Atkinson Hyperlegible Next","PingFang SC","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif;
                   --ts:1;  /* 1 | 1.15 | 1.3 */
                   --fs-d-xl:calc(48px*var(--ts)); --fs-d-l:calc(36px*var(--ts)); --fs-d-m:calc(28px*var(--ts));
                   --fs-title:calc(20px*var(--ts)); --fs-body-l:calc(18px*var(--ts)); --fs-body:calc(16px*var(--ts)); --fs-label:calc(14px*var(--ts));
  /* space */      --s-1:4px; --s-2:8px; --s-3:12px; --s-4:16px; --s-5:20px; --s-6:24px; --s-7:32px; --s-8:40px; --s-9:48px; --s-10:64px; --gutter:16px;
  /* radius */     --r-sm:8px; --r-md:12px; --r-lg:16px; --r-card:20px; --r-xl:24px; --r-pill:999px;
  /* elevation */  --e-1, --e-2, --e-3 (box-shadows); --glow-gold, --glow-good, --glow-evil
  /* motion */     --d-instant:80ms; --d-fast:140ms; --d-base:220ms; --d-slow:420ms; --d-drama:700ms; --d-stagger:90ms;
                   --ease-out:cubic-bezier(.2,.8,.2,1); --ease-in-out:cubic-bezier(.65,0,.35,1); --ease-back:cubic-bezier(.34,1.4,.64,1);
  /* texture */    --grain, --grain-paper (SVG feTurbulence data-URIs), --candle, --vignette (radial gradients)
}
```

### Type scale

| Token | Spec |
|---|---|
| d-xl | Cormorant Garamond 700 · 48/50 · room code, winner |
| d-l | Cormorant 700 · 36/40 · screen titles, role names |
| d-m | Cormorant 600 · 28/32 · section titles, quest numerals |
| title | Atkinson Next 700 · 20/26 · card titles |
| body-l | Atkinson Next 400 · 18/26 · status main line, buttons |
| body | Atkinson Next 400 · 16/24 · minimum body size |
| label | Atkinson Next 700 · 14/20 · meta, chips, eyebrows (never body) |

### Layout metrics

| Metric | Value |
|---|---|
| Gutter | 16px phone · 20px ≥ 414 · 28px tablet |
| Top bar | 56px · Menu (left), room tag, History (right) |
| Status bar | min 88px · phase / main line / waiting-on |
| Dock | padding 12/16/24 + safe area · primary 56px |
| Tap targets | ≥ 48px · rows 60px · vote buttons 148px |
| Ring | 340×300 · seat 76 wide · avatar 48 · ellipse rx 132 ry 120 |
| Short screens | < 780px tall: .qtrack.compact, Peek joins primary row |
| History grid | first column 92px sticky · cells 36px · rows 44px |
| Cards | role 300×440 r20 · quest 2-up 220 tall r18 |
| Breakpoints | 360 · 390 · 430 phone; ≥ 768 tablet two-column board |

## 3 · Components, states and labels

Class names are the ones in rt.css. "A11y" is what a screen reader should hear or what the element must be.

| Component | Class | States | A11y |
|---|---|---|---|
| Button | `.btn + -primary / -secondary / -danger / -ghost / -good` | default · pressed (scale .98) · disabled (+ .btn-note reason) · loading (.is-loading spinner, aria-busy) | <button> or <a> for navigation. Disabled reason linked with aria-describedby. |
| Icon button | `.icon-btn (.framed, .danger)` | default · focus · danger | 48×48. aria-label always (“Vote history”, “Remove Jude”). |
| Hold to peek | `.peek (.is-held)` | idle · held (gold ring) · shows .peek-sheet | Pointer down/up + Space/Enter keydown/up. aria-label “Hold to peek at your role”. Peek sheet role=dialog, not announced as text until held. |
| Toggle | `input.switch[role=switch]` | off · on · disabled (with reason in label) | Native checkbox inside <label>. Name = role name + one-line ability. |
| Segmented | `.seg > .seg-opt.is-on` | selected · unselected · disabled | role=radiogroup/radio or tablist/tab, aria-checked/selected. |
| Text input | `.field > .input` | empty · focus · filled · error (.is-error) · ok · counter n/16 | <label for>. Error text in .field-msg, aria-invalid + aria-describedby. |
| Room-code input | `.code > .code-cell` | empty · active (caret) · filled · error | Build as ONE <input maxlength=4 autocapitalize=characters inputmode=text> visually split into 4 cells: paste and autofill just work. Letters A–Z minus I, O. |
| Avatar | `.av (-32/-48/-56) + .av-badge` | default · you (gold ring) · offline (45%) · badges: lead, lady, off, ok | Decorative; the name next to it carries meaning. Badges aria-hidden; state in parent aria-label. |
| Chip / team tag | `.chip(-good/-evil/-gold/-warn), .team-tag` | Good (round icon) · Evil (thorn icon) · host · leader · offline | Always icon + word. Never colour only. |
| Player row | `.prow (.is-selected/.is-disabled/.is-off)` | default · selected (gold + tick) · disabled + reason · offline · with kick | <button aria-pressed> when selectable; role=radio in single-choice lists; reason in .prow-meta. |
| Status bar | `.status (.is-you/.is-alert/.is-tense)` | waiting · your turn · alert (offline) · tense (assassination) | role=status aria-live=polite. Phase · main line · waiting-on, every time. |
| Quest node | `.qnode (.is-current/.is-success/.is-fail) + .qnode-tag` | upcoming · current (glow) · success (round teal + sun) · fail (crimson diamond + crack) · “2 fails” tag | role=listitem aria-label “Quest 4, 4 knights, needs 2 fails”. |
| Reject counter | `.rejects.lvl-N > .pip.on.lN` | 0–5, ramp: slate → amber → orange → crimson; 5th pip is a diamond | aria-label “Rejected teams in a row: 2 of 5”. At 4: text “next reject, Evil wins”. |
| Tokens | `.tok-leader / .tok-lady / .tok-host` | leader (gold pennant) · Lady (parchment lake) · host (crown) | role=img with aria-label when standalone. |
| Role card | `.rcard-back / .rcard-front.good\|.evil` | back · held/front for 8 roles · peek-sheet mini | Front exists in the DOM ONLY while held. Button aria-label switches between “face down” and the full role text. |
| Vote pair | `.vote-pair > .vote-approve / .vote-reject` | idle · picked (lift + ring) · other dimmed · locked (panel) | role=radiogroup; then a separate “Lock in …” button. Locked vote is not displayed again. |
| Quest card | `.qcard-success / .qcard-fail (.is-picked/.is-locked)` | idle · picked · locked for Good with reason · played | Disabled Fail stays visible with reason text (aria-describedby). |
| Sheet | `.scrim + .sheet` | open (max 92–95% height) · drag to close | role=dialog aria-modal, focus trapped, Esc and scrim tap close, focus returns to opener. |
| Modal | `.modal (.is-danger)` | confirm · danger confirm · hold-to-confirm (assassination) | role=alertdialog. Danger first, safe action under it; scrim tap = cancel. |
| Toast | `.toast(-ok/-info/-warn/-err) in .toast-slot` | info · ok · warn · error with action | role=status (alert for errors). 3s, errors persist. Max 2 stacked, above the dock. |
| Waiting | `.dots, .spinner, .progress(.is-indet), .waitgrid > .wcell` | pending · done · indeterminate | Decorative dots aria-hidden; text says who we wait on. |
| History grid | `.hscroll > .hcol > .hrow / .hqrow / .hcell` | approve · reject · on team · leader · focus column | role=table/row/cell; each cell label “Kofi: reject, on team”. Header buttons toggle column focus. |
| Banner | `.banner-good / .banner-evil` | 5 reasons (see Components board) | role=status; reason sentence is plain language. |
| Private label | `.private, .private-band` | on every secret surface | Read aloud: “Private. Only you can see this.” |

## 4 · Motion specs

Every dramatic beat is under 3 seconds, has a Skip in the top bar, and ends in the same static state the reduced-motion version shows. Reduced motion = `prefers-reduced-motion: reduce` OR Menu → Reduce motion (adds `.reduce-motion` on the shell; mirror the media query rules).

| Moment | Animation | Timing | Easing | Reduced motion |
|---|---|---|---|---|
| Role reveal | Card flips in: rotateY(-90°→0), opacity .4→1 (.anim-flip). Hide is instant. | 420ms | `--ease-out` | 150ms cross-fade; hide stays instant |
| Vote reveal | Each vote cell rises 10px + fades (.anim-rise), seat order, then the verdict stamps (.anim-stamp). | 120 + n×90ms; stamp at ~750ms; total < 1.8s for 10 | `--ease-out / --ease-back` | All votes fade in together, 150ms |
| Reject pip | New pip stamps in after the verdict (scale 1.25→1). | 360ms at +1.1s | `--ease-back` | Fade |
| Quest result | Shuffled cards coin-flip one by one (rotateY 180→0), then the result banner stamps, then the quest node stamps. | 520ms each, 280–350ms apart; total ≤ 2.4s for 5 cards | `--ease-out` | Cards appear face-up together; banner fades |
| Assassination | Slow crimson pulse on the dagger emblem (.anim-pulse); status bar .is-tense. | 2.4s loop | `--ease-in-out` | Static crimson ring, no pulse |
| Current quest | Gold glow breathes on the current node. | 2.4s loop | `--ease-in-out` | Static gold ring |
| Sheets / toasts | Slide up 24px + fade. | 220ms in / 160ms out | `--ease-out` | Fade only |
| Selection | Lift 4–6px, ring appears, other option dims to 38%. | 140ms | `--ease-out` | No lift, ring + dim only |
| Hold to strike | Fill sweeps across the danger button while held; release resets. | 1500ms linear | `linear` | Same (it is a timer, not decoration); also announce “Hold for 1.5 seconds” |

## 5 · Interaction rules

- **Hold to reveal.** pointerdown → reveal (setPointerCapture); pointerup / pointercancel / pointerleave / visibilitychange / blur → hide immediately. Space/Enter keydown/keyup mirror it. Block the long-press context menu and text selection. First reveal enables “I’ve seen my role”.
- **Two-step confirm (one pattern).** Votes, quest cards, Lady and team proposal all work the same: tap to select (changeable), then a gold “Lock in / Send / Play …” button appears in the dock. Locked means final.
- **Hold-to-confirm (one place).** Only the Assassin’s strike uses a 1.5s hold, because it ends the game and cannot be undone.
- **Live selection.** Leader picks are broadcast as they happen (debounced 150ms) so the table can react out loud. Votes and cards are never broadcast before everyone locks.
- **Skip.** Every reveal has Skip in the top bar. Skipping jumps to the end state for that player only.
- **Disconnects.** Seat held 5 minutes. Play continues until the absent player is needed; then the status bar names them and waits. After 2 minutes the host may end the game (no auto-voting on anyone’s behalf).
- **Screen stays awake.** Request Screen Wake Lock while in a game; release in lobby/game over. Vibrate (where supported) when it becomes your turn; toggle in Menu.
- **History is one tap away.** Top-right on every game screen; on tablets it is always open. Tapping a name focuses that column and shows a one-line summary.

## 6 · Privacy, accessibility, i18n

- **Secrets never sit hidden in the DOM.** Do not render a role or result and hide it with CSS. Insert it only while held/visible; remove on release. Board markup must contain no secret data at all.
- **Server sends private payloads per player.** Each client receives only its own role and night info. Votes/cards are revealed by the server only after all are locked; quest cards are shuffled server-side.
- **Visible marker on every secret surface.** .private label (lock + “Only you can see this”) and parchment surface. Parchment is used nowhere else.
- **No secrets in titles or notifications.** document.title, push and vibration patterns never encode a role or a result.
- **Contrast.** All text ≥ 4.5:1 on its surface (text-3 only on bg/surface-1/2). Gold on bg 9.5:1, Evil text 6.6:1, on-evil-fill 7.9:1, Good 10:1.
- **Not colour alone.** Good = circle + “Good”, Evil = thorn/diamond + “Evil”, Approve = solid gold ✓, Reject = hollow slate ✕, Success = sun, Fail = crack + diamond node.
- **Focus.** 3px --focus outline with 3px offset on every interactive element. Sheets/modals trap focus and return it.
- **Text size.** All type is calc(px × --ts). Offer 100 / 115 / 130%. Layouts wrap; names ellipsize only in the ring and history header (full name in aria-label and on tap).
- **Strings.** Every string from i18n JSON with ICU plurals (“Waiting on {n, plural, one {# player} other {# players}}”). No text in SVG. Allow +40% length for EN→DE and wrap-safe CJK.
- **Chinese.** lang=zh-Hans on the shell; CJK font fallbacks are in the stacks. Turn off uppercase/letter-spacing on .eyebrow, .status-phase for CJK (see S4). In production load Noto Sans SC / Noto Serif SC subsets.

## 7 · Phases (state machine) → screens

| Phase | Acting player sees | Everyone else sees | Screens |
|---|---|---|---|
| `lobby` | Host: code, players, roles & rules, Start (reasoned disable) | Guest: code, players, settings summary, “Waiting for host” | B1–B4, G4, G6 |
| `night` | Hold-to-reveal card, “I’ve seen my role” | Same; then who is ready | C1–C3 |
| `propose` | Leader: list picker, live count, too-few/too-many states | Ring with live picks highlighted | D1–D4, S1–S3, S5 |
| `vote` | Approve / Reject, Lock in | — (everyone votes) | D5, D6, S4 |
| `vote_reveal` | Staggered reveal by name, verdict, reject track | Same | D7, D8 |
| `quest` | Team members: cards (Good: Fail locked) | “The team is on the quest” | D9–D11 |
| `quest_result` | Shuffled coin-flip reveal, track update, Q4 two-fail rule | Same | D12, D13 |
| `lady` | Holder: choose (past holders disabled), private result, pass | “Rowan is looking into Sana” | D14–D16 |
| `assassination` | Assassin: pick + hold-to-strike | Tense wait; Evil revealed | F1–F3 |
| `game_over` | Banner + reason, all roles, all votes, Play again / Leave | Same | F4 |

## 8 · Copy deck: validation & errors

| Key | String |
|---|---|
| `code.notFound` | No room called {code}. Check the code with your host. |
| `code.full` | Room {code} is full ({n} of 10). |
| `code.started` | This game has already started. |
| `name.taken` | Someone in this room is already “{name}”. Try “{name} B”. |
| `name.tooLong` | Names can be up to 16 characters. |
| `name.empty` | Add a name so others know who you are. |
| `start.tooFew` | Need {n} more {n, plural, one {player} other {players}} · 5 minimum |
| `start.tooManyEvil` | {p} players have {e} Evil seats, but {r} Evil roles are on. Turn one off. |
| `pick.tooFew` | Pick {n} more to continue |
| `pick.tooMany` | Quest {q} takes exactly {n}. Remove {x}. |
| `fail.locked` | Loyal knights can only play Success |
| `lady.disabled` | Already held the Lady |
| `net.reconnecting` | Reconnecting… Your seat, role and vote are held. |
| `net.lost` | We couldn’t reach room {code} for 30 seconds. |
| `server.waking` | Lighting the candles… Our free server naps when nobody is playing. |

## 9 · Design choices made where the brief was open

- **Ring on the board, lists for actions.** The ring mirrors real seating and leader rotation; anything you tap is a 60px list row.
- **Your own vote is never shown back.** After locking, the screen says “locked” but not what you chose, so a neighbour can’t glance at it.
- **Parchment = secret.** Light surfaces appear only for private information. A bright card in a dark room is the cue to angle the phone away.
- **Approve/Reject aren’t team colours.** Gold-solid ✓ and slate-hollow ✕, so a vote never reads as “Good” or “Evil”.
- **Neutral avatars.** Same ink disc + initial for everyone; any colour could be misread as a team hint.
- **Room codes skip I and O.** 24-letter alphabet so codes survive being read aloud.
- **Lady result kept in Peek.** The holder can re-check it later via Hold to peek.
- **Oberon default: Merlin sees him.** Matches the common rule; the host can flip it.
- **Leader = pennant standard, host = crown.** Two different jobs, two different symbols.
- **Host auto-transfer.** Longest-seated player becomes host; they can hand it on.
- **No timers on talking.** Only system waits have timeouts (reconnect 5 min, host may end after 2 min).
- **Text scale via --ts.** One variable drives all sizes; an in-app 100/115/130% control, since phones don’t pass Dynamic Type to web pages.

## 10 · Expensive to change later

- **Player ring as the board’s centrepiece** (Information architecture). Seat maths, scaling to 10 players and the tablet layout all hang off it. Switching to a list board later means redoing D-screens and S-screens.
- **Server-authoritative secrets, per-player payloads** (Networking). Required for “nothing secret in the DOM”. A peer-to-peer or broadcast-everything design can’t be retrofitted safely.
- **One two-step confirm pattern everywhere** (Interaction). Votes, cards, Lady and proposals share select → lock. Changing it later touches every phase.
- **Mask-based single-colour icons** (Visual system). Cheap and themeable, but icons can’t be two-tone. Multi-colour role art later means swapping to inline SVG components.
- **Cormorant + Atkinson Hyperlegible Next** (Type). Cormorant has no CJK; Chinese uses system serif. Swapping display fonts later shifts every title’s line-height and the ring’s table text.
- **Disconnect policy: wait, never auto-vote** (Rules). Simple and fair, but a vanished player can stall a game until the host ends it. Changing to auto-skip needs rule and UI work.
- **In-app text scale (--ts) instead of rem/OS scaling** (Accessibility). Predictable layouts, but OS-level text size is ignored. Moving to rem later is a sweep of rt.css.
- **Dark-only tokens** (Theme). Tokens are semantic, so a light theme is possible, but parchment-as-secret must be rethought for a light ground.
