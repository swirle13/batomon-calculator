# Feature Specification: Batomon Showdown Screen-Reading Companion

**Feature Branch**: `002-screen-reading-companion`

**Created**: 2026-10-08

**Status**: Draft — research complete, nothing built

**Input**: User description: "A cross-platform mobile app providing screen reading to give
suggestions to players playing Batomon Showdown on Android (iOS isn't out yet). Like the floating
icon IV calculators for Pokémon GO — screen scanning, then a popup with information. Provide the
same recommendation engine that powers 'placement suggestion', reading the screen's UI with its
fixed layout and known trinket/mon/item effects, identifying DPS and suggesting placements to
improve DPS and EHP/survivability. Also detect when an item or trinket is taken from the UI
animations, not just from opening the trinkets tab."

**Companion documents**: [`research.md`](./research.md) ·
[`port-inventory.md`](./port-inventory.md) · [`uncertainty-register.md`](./uncertainty-register.md) ·
[`project-setup.md`](./project-setup.md)

---

## Framing: this is not a port with a camera attached

The brief describes bringing the existing advisor to the phone. The research found something
stronger, and it should set the priorities.

Batomon Showdown is an **asynchronous PvP autobattler** — you load a saved opponent board, and that
board is on screen. The calculator's single largest structural limitation, stated repeatedly in its
own source, is that there is no modeled opponent: `applyShieldReduction` is implemented, unit-tested
and **wired to nothing**; healing and shielding are computed and then absorbed by nothing;
`CleanseDebuffs` is priced against an *assumed* incoming debuff rate that `survivability.ts` itself
flags as "the one tag whose value depends on an assumption about the opponent."

A screen reader sees the enemy. It also sees the shop, the gold, and the current levels — which is
what the user's own stated next want ("expecting level-ups as potential benefits over just raw
upgrades") requires and the web app can never have.

**So the mobile app is the only form of this tool that can see the inputs the engine has always been
missing.** EHP and survivability stop being half-modelled estimates. That is why the phasing below
puts "read the board" before "port the advisor UI," and why opponent modelling is named as a phase
rather than buried as a future idea.

Second framing note, stated plainly because it should discipline scope: Batomon Showdown has
roughly **16K installs and ~10K monthly actives**. A companion tool reaching an enthusiastic 5–10%
of that is **500–1,000 users**. This is a high-craft hobby project with a real but small ceiling,
and the phasing is built so that stopping after any phase still leaves something usable.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Read my board and tell me its DPS (Priority: P1)

A player mid-run taps the floating icon. The app captures the screen, identifies the six monsters on
the grid with their levels, and shows total team DPS and per-creature contribution in a compact
panel over the game, without the player leaving the game or typing anything.

**Why this priority**: It is the smallest thing that is genuinely useful and it exercises the entire
risky path end to end — permissions, capture, overlay, calibration, sprite matching, digit reading,
and the engine. Everything else is a feature on top of a pipeline that either works or doesn't, and
this story is how we find out.

**Independent Test**: Place a known team in-game, tap the icon, and verify the displayed DPS matches
what the web calculator reports for the same team entered by hand.

**Acceptance Scenarios**:

1. **Given** the game is in the foreground showing a team of six on the 2×3 grid, **When** the user
   taps the overlay icon, **Then** within 2 seconds a panel displays total DPS and a per-creature
   breakdown.
2. **Given** a scan where one slot's sprite matched below the confidence threshold, **When** the
   panel renders, **Then** that slot is shown as unidentified with a tap target to pick the species
   manually, and the DPS figure states that it excludes that slot.
3. **Given** the user corrects a misidentified monster, **When** the correction is saved, **Then**
   the figures recompute immediately and the correction persists for the rest of the run.

---

### User Story 2 — Tell me where to move them (Priority: P1)

With a board already read, the player sees the placement advisor's output: the suggested
arrangement, the specific moves that differ from the current board, and the projected change in
score — the same `computePlacementAdvice` output the web app renders, on the phone.

**Why this priority**: This is the feature the brief is actually about. It is P1 alongside Story 1
rather than after it only because the engine code already exists — the work is surfacing it, not
building it.

**Independent Test**: Scan a board whose optimal arrangement is known from the web calculator and
verify the mobile app proposes the same moves.

**Acceptance Scenarios**:

1. **Given** a scanned board of six, **When** the user opens the advisor, **Then** it lists only the
   placements that change slot, with the current and suggested score.
2. **Given** a board where no arrangement scores better, **When** the advisor runs, **Then** it says
   so **and** states how many of the placed monsters have a positional ability the engine can act
   on — because "no improvement found" usually means "the effects that would make position matter
   aren't modelled yet," and the web app already tells the truth about this.
3. **Given** a mid-range device, **When** the advisor runs over a full six-monster board, **Then**
   the UI does not block, and a result appears within 3 seconds or a progress state is shown.

---

### User Story 3 — Keep up with my run without re-entering everything (Priority: P2)

Across a run, the player picks up trinkets and uses items. The app tracks the current run's state —
team, bench, trinkets, items, trainer, gold, day — so each scan updates what changed rather than
starting from nothing, and acquired trinkets are noticed without the player opening the trinket tab.

**Why this priority**: Without it the tool is a calculator you re-feed constantly, which is the
friction the brief is trying to remove. It is P2 rather than P1 because Stories 1 and 2 are useful
without it.

**Independent Test**: Play a run, scanning at intervals; verify trinkets acquired between scans
appear without the player ever opening the trinket tab.

**Acceptance Scenarios**:

1. **Given** a known run state, **When** the player acquires a trinket and then scans, **Then** the
   app detects the new trinket by diffing against the previous state and adds it.
2. **Given** a trinket whose effect the engine does not model (87 of 93 today), **When** it is
   added, **Then** it is listed and visibly marked as not affecting the figures.
3. **Given** the player closes and reopens the app mid-run, **When** they return, **Then** the run
   state is intact.

> **Scope note on the brief's animation-detection request.** Detecting a pickup *from the UI
> animation* requires continuous capture, a temporal model, and battery the game is already
> spending — and it fails silently when it misses one. State diffing gets the same information for
> a fraction of the cost, at the price of being current only as of the last scan, which is
> acceptable in a game with **no timers**. Animation detection is deferred to Phase 4 behind its own
> feasibility spike (`research.md` D3, `uncertainty-register.md` KU-7).

---

### User Story 4 — Price my survivability against the actual opponent (Priority: P3)

The player scans the versus screen. The app reads the **opposing** board and computes the matchup:
real time-to-kill against a real enemy, shields absorbing real damage, healing offsetting real
incoming damage, and a survivability figure that is measured rather than assumed.

**Why this priority**: Highest ceiling, highest cost. It needs engine work that does not exist —
a modeled target — so it cannot precede the pipeline that feeds it. But it is the reason this
project is worth more than a port, and it should be on the roadmap from day one so the data model
does not have to be rebuilt to accommodate it.

**Independent Test**: Scan a matchup, verify the opposing board is read correctly, and verify the
engine's shield and heal terms are non-zero where the web app's are structurally zero.

**Acceptance Scenarios**:

1. **Given** a versus screen, **When** the user scans, **Then** both boards are read and identified.
2. **Given** both boards, **When** the simulation runs, **Then** `applyShieldReduction` is actually
   invoked against incoming damage and the result states the assumptions that remain.
3. **Given** a team with a cleanse ability (Runerock, Sirenade), **When** the matchup is simulated,
   **Then** the cleanse is priced against the opponent's measured debuff output rather than the
   assumed rate `survivability.ts` uses today.

---

### Edge Cases

- **The game blocks capture or overlays.** If `FLAG_SECURE` or `HIDE_OVERLAY_WINDOWS` is ever set,
  there is no workaround. Test before anything else (`uncertainty-register.md` KU-1).
- **Scan taken mid-animation or over a popup.** Must be detected and reported as a bad scan rather
  than parsed into a wrong board.
- **Capture consent dialog appears every session.** Unavoidable (`research.md` B1). Onboarding must
  explain it and the flow must require the game running *first*, or only full-screen capture will be
  offered.
- **Overlay blocks the permission prompts we need.** Request every permission before the overlay is
  first shown, or hit the classic "Screen overlay detected" deadlock.
- **Device has an aspect ratio calibration doesn't handle.** Must degrade to a manual calibration
  path, not to wrong readings.
- **The game patches and moves a UI element.** ROI definitions, sprite hashes and the corpus must be
  remotely refreshable — see FR-029, and `uncertainty-register.md` KU-10 for why this is a v1
  decision rather than a later fix.
- **OEM battery manager kills the foreground service mid-session.** Detect and offer to restart,
  rather than silently stopping.
- **A monster on the board is one of the 139 with no modelled ability.** State coverage; never let a
  working engine imply full coverage.

---

## Requirements *(mandatory)*

### Functional Requirements — capture and overlay

- **FR-001**: System MUST capture the device screen via `MediaProjection`, from a foreground service
  declaring `mediaProjection`, started before the projection token is obtained.
- **FR-002**: System MUST request fresh user consent per capture session and MUST NOT attempt to
  reuse a consent `Intent` or call `createVirtualDisplay` more than once per `MediaProjection`.
- **FR-003**: System MUST hold a single projection open for a play session and capture frames
  on demand within it, rather than re-prompting per scan.
- **FR-004**: System MUST guide the user to start the game before granting capture, so the
  single-app capture option is available.
- **FR-005**: System MUST display a draggable floating overlay with a collapsed handle and an
  expanded panel, snapping to screen edges, persisting its position.
- **FR-006**: The overlay's interactive surface MUST be opaque enough to receive touches under
  Android 12+ rules (opacity ≥ 0.8).
- **FR-007**: System MUST request every required permission before the overlay is first shown.
- **FR-008**: System MUST host the overlay from the capture service where technically possible, to
  avoid a second reviewed `specialUse` foreground service [NEEDS VERIFICATION: `uncertainty-register.md` KU-4].
- **FR-009**: System MUST provide an unambiguous way to stop capture, and MUST stop automatically
  when the game leaves the foreground for longer than a configured interval.
- **FR-010**: System MUST NOT use the AccessibilityService API (`research.md` B4).

### Functional Requirements — perception

- **FR-011**: System MUST calibrate the game's rendered viewport bounds (letterbox) once per device
  and orientation, and derive regions of interest in normalized coordinates from it.
- **FR-012**: System MUST identify monsters, trinkets, items and the trainer by matching sprite
  regions against a known asset set, not by OCR of names.
- **FR-013**: System MUST read numeric fields with a fixed-ROI digit classifier, falling back to
  ML Kit Text Recognition v2 for free text.
- **FR-014**: Every read MUST carry a confidence value, and reads below threshold MUST be surfaced
  as unknown rather than guessed.
- **FR-015**: System MUST detect a frame that is unreadable (mid-animation, obscured, wrong screen)
  and report a failed scan rather than emit a partial board.
- **FR-016**: The perception layer MUST be invocable on a stored image file, independent of any
  device or capture session.
- **FR-017**: System MUST produce a single structured `BoardReading` as the only data crossing from
  the native layer to the application layer. Frame bitmaps MUST NOT cross that boundary.
- **FR-018**: System MUST perform all perception on-device. No frame, crop or derived image may
  leave the device.

### Functional Requirements — advice

- **FR-019**: System MUST compute team DPS, per-creature contribution, and per-status
  per-second values using the existing engine, unmodified.
- **FR-020**: System MUST surface `computePlacementAdvice` output: suggested arrangement, the
  changed placements only, and current vs. suggested score.
- **FR-021**: System MUST state how many placed monsters have a positional ability the engine acts
  on, alongside any "no improvement found" result.
- **FR-022**: System MUST state ability-tag coverage alongside any DPS figure, matching the web
  app's existing honesty about the 10-of-149 coverage.
- **FR-023**: System MUST mark scanned trinkets and items whose effects are not modelled.
- **FR-024**: The advisor MUST NOT block the UI thread; results MUST appear within 3 seconds on a
  mid-range device or show progress [NEEDS VERIFICATION: `uncertainty-register.md` KU-6].

### Functional Requirements — run state and correction

- **FR-025**: System MUST persist the current run's state across scans and app restarts.
- **FR-026**: System MUST detect newly acquired trinkets and items by diffing successive readings,
  without requiring the player to open the trinket tab.
- **FR-027**: Users MUST be able to correct any read value, and corrections MUST persist for the run.
- **FR-028**: Every displayed figure MUST trace to readings the user can inspect and override.
- **FR-029**: ROI definitions, sprite hashes and the corpus MUST be updatable without shipping a new
  binary.

### Functional Requirements — boundaries

- **FR-030**: System MUST NOT inject input, modify, or interact with the game process in any way.
- **FR-031**: System MUST NOT make network requests to the game's backend, and MUST NOT handle game
  credentials.
- **FR-032**: System MUST function fully offline except for corpus/ROI refresh (FR-029).

### Key Entities

- **BoardReading** — one scan's result. Grid slots → (species, level, shiny, confidence); bench;
  trinkets; items; trainer; gold; day; optional opponent board; source frame reference; timestamp.
  The single contract between the native perception layer and the application layer, and the seam
  the whole app hangs on. **Design it first.**
- **RunState** — the reconciled view of the current run, built from successive `BoardReading`s plus
  user corrections. Maps onto the existing `TeamConfiguration` plus run-scoped additions (gold, day,
  acquisition history, banked manual-trigger presses).
- **Calibration** — per device and orientation: letterbox bounds and the derived ROI set, with the
  game version they were authored against.
- **AssetFingerprints** — the sprite template / hash set used for identification, versioned
  independently of the binary.
- **GoldenFrame** — a stored screenshot paired with its hand-labeled expected `BoardReading`. The
  perception layer's test corpus (`port-inventory.md` §7).

---

## Success Criteria *(mandatory)*

- **SC-001**: A player goes from "game on screen" to "DPS displayed" in **under 5 seconds** and
  **zero typed characters**, on an already-consented session.
- **SC-002**: Sprite identification is **correct on ≥ 98%** of slots across the golden-frame corpus,
  and every error is either flagged low-confidence or correctable in one tap.
- **SC-003**: Numeric reads are **correct on ≥ 95%** of fields across the golden-frame corpus.
- **SC-004**: Team DPS computed from a scan **matches the web calculator exactly** for the same team
  entered by hand — the engine is shared, so any divergence is a perception bug and must be
  detectable as one.
- **SC-005**: Placement advice appears within **3 seconds** on a mid-range device.
- **SC-006**: A 30-minute play session with on-demand scanning costs **under 5%** additional battery
  versus the game alone.
- **SC-007**: A scan taken on an unreadable frame is reported as failed **100%** of the time — zero
  silent wrong boards. This is the one criterion with no acceptable failure rate.
- **SC-008**: Trinkets acquired between scans are detected **without the player opening the trinket
  tab** in ≥ 90% of cases.
- **SC-009**: The app installs and runs on **Android 11 through the current release**, across at
  least three OEM skins.

---

## Phasing

Each phase ends at something independently useful and shippable. This is deliberate: the realistic
risk on a hobby project of this size is not technical failure but abandonment at month three
(`uncertainty-register.md`, unknown-unknowns §6).

| Phase | Delivers | Gated on |
|---|---|---|
| **0 — Go / no-go** | Answers: does the game block capture or overlays? Will berrymint permit this? Does the Godot layout calibrate? Is RN earning its keep? | Nothing. ~2 weeks, mostly not coding. KU-1 first, in under an hour. |
| **1 — Extraction** | The workspace: engine + corpus as shared packages, web app still green, 207 tests still passing. | Phase 0 go. `project-setup.md` §3. |
| **2 — Read and report** | US1. Capture, overlay, calibration, sprite matching, digit reading, DPS panel, correction UI, golden-frame corpus. The whole risky path, end to end. | Phase 1. **The real project.** |
| **3 — Advise** | US2 + US3. Placement advisor on the phone, run-state tracking, trinket/item diffing. | Phase 2. Cheapest phase — the engine already exists. |
| **4 — Opponent** | US4. Modeled target: real EHP, shields that absorb, cleanse priced against measured debuffs. | Phase 3. New engine work; highest value. |
| **5 — Deferred** | Animation-based pickup detection; iOS screenshot-import companion. | Evidence that Phase 3's diffing is insufficient; an iOS build of the game existing. |

Corpus coverage work (widening ability tags, trinket and item effects) runs **in parallel from Phase
1**, because it is the engine's real ceiling (`port-inventory.md` §6.1) and it benefits the web app
immediately whether or not the mobile app ever ships.

---

## Open Decisions

These need the project owner, not more research.

1. **Repository topology.** One private monorepo with the web app moved in, or two repos with a
   published private engine package? `project-setup.md` §1 lays out the trade; the deciding question
   is whether the calculator staying public matters.
2. **Ask berrymint, and about what.** (a) Is a read-only overlay companion acceptable? Worth asking
   before building. (b) Would you share the stat tables and ability data? Worth asking at leisure —
   it improves advice quality on both platforms but blocks nothing, since the sprites the perception
   layer needs are already vendored in the calculator (`research.md` A1c,
   `uncertainty-register.md` KU-3).
3. **Whether to chase the remaining corpus gaps at all.** 60 species with no damage line, 139 with
   no ability tags, 87 of 93 trinkets unmodelled. This is the recommendation engine's real ceiling
   (`port-inventory.md` §6.1), and it is a data-gathering project independent of the mobile app —
   it improves the web calculator immediately whether or not any of this gets built.
4. **Distribution channel.** Google Play means a reviewed `specialUse`/capture/overlay combination
   and a demo video. A GitHub release APK for a Discord-native community removes that entirely. Worth
   choosing deliberately; "Play-ready" is a real architectural constraint that may be worth declining
   (`uncertainty-register.md` KU-8).
5. **React Native vs. native Kotlin.** Recommended RN, with a one-week spike that could overturn it.
   The iOS payoff that normally justifies the framework tax may never arrive (KK-6, KK-8), and the
   engine has an unusually narrow interface that a JNI boundary would accept as readily as a
   `postMessage` one (`project-setup.md` §5).

---

## Assumptions

- Android only for v1. iOS is blocked twice over — no game build, and no overlay primitive on the
  platform — and when it arrives it will be a screenshot-import companion, not this app.
- The game's UI layout is stable in normalized viewport coordinates after letterbox calibration.
  **Unverified**; the whole ROI strategy depends on it (KU-2).
- The game does not set `FLAG_SECURE` or `HIDE_OVERLAY_WINDOWS`. **Unverified, and fatal if wrong**
  (KU-1).
- The engine and corpus port to React Native without modification. Well evidenced (`port-inventory.md`
  §2), but unproven on a device (KU-6).
- Users are willing to grant screen capture and overlay permissions to a fan tool. The Calcy IV and
  Poke Genie precedent says yes for this audience.
- Read-only, pixels-only, offline operation is sufficient to keep the tool legitimate, following the
  established precedent (`research.md` F1) — pending the developer's own view (Open Decision 2).
- The realistic user ceiling is in the hundreds. Scope accordingly.

---

## Out of Scope

- Any interaction with the game process: input injection, memory reading, packet inspection,
  modification. This is a hard architectural boundary (FR-030/031), not a deferral.
- Accounts, cloud sync, leaderboards, a backend of any kind.
- Reading or handling the player's game credentials.
- Automating play. The app advises; the player acts.
- iOS, until the game ships there.
- Animation-based pickup detection, until diffing is shown insufficient.
- Porting the web app's desktop builder UI. The phone product is an overlay plus a focused app, not
  a two-column builder with a 22rem detail panel.
