# Uncertainty Register

**Created**: 2026-10-08

Three categories, per the brief: **known knowns**, **known unknowns**, and the **surface area where
unknown unknowns live**. There is no fourth category — you cannot have an unknown known; the phrase
is an oxymoron and it is not used here.

The third category cannot be enumerated by definition. What it *can* do is name the regions where
surprises historically come from in projects of this shape, so that when one arrives it is at least
recognized as the kind of thing that was expected to happen rather than treated as a novel crisis.

---

## Known knowns

Established by the research, with enough confidence to design against.

| # | Fact | Evidence |
|---|---|---|
| KK-1 | **The game is Godot.** Pixel art, 2D, `com.batomon.showdown`, 250 MB, v1.2.0, paid $5.09, ~16K installs / ~10K MAU. | itch.io "Made with: Godot"; Play/AppBrain/Steam listings |
| KK-2 | **There is no accessibility tree to read.** Godot's AccessKit integration is experimental, reported broken on Android TalkBack, and opt-in per node. | Godot 4.5 notes; three forum threads 2025-09 → 2026-01 |
| KK-3 | **The AccessibilityService route is also closed by policy**, independently of KK-2, as of 2026-01-28; Android 17 Advanced Protection removes it entirely for non-accessibility tools. | Play Console sensitive-permissions policy; Google security blog |
| KK-4 | **MediaProjection is the only sanctioned read path**, requires a `mediaProjection` foreground service started *before* the token is obtained, and demands **fresh user consent per session** with a single-use token. | Android Developers media projection + `MediaProjectionManager` |
| KK-5 | **`SYSTEM_ALERT_WINDOW` is auto-granted while a projection is active** (Android R+), if not previously denied — the two permissions are designed to pair. | `MediaProjectionManager` reference |
| KK-6 | **iOS cannot draw over other apps.** Only system-rendered surfaces (custom-content PiP, Live Activities) cross app boundaries. | Apple docs; no public API exists |
| KK-7 | **iOS system-wide capture today means a ReplayKit Broadcast Upload Extension**, with a 50 MB process cap and App Group IPC. ScreenCaptureKit's iOS picker is **iOS 27, beta** — not shippable in 2026. | Apple ReplayKit security; ScreenCaptureKit availability annotations |
| KK-8 | **The game has no iOS build.** berrymint: "iOS coming soon," no date. | batomon.com FAQ |
| KK-9 | **The engine ports for free to React Native.** ~3,960 LOC with zero platform coupling outside a 36-line worker adapter; 207 tests with no Vitest-specific machinery. | Direct code audit |
| KK-10 | **Flutter costs an engine rewrite**: 22-member discriminated unions, branded types, structural typing, 948 KB corpus, and 207 unrepeatable test cases. | Direct code audit |
| KK-11 | **General OCR is too weak to be the foundation** (~75% field F1 on Android), but **does not have to be**: pixel-art template matching plus a fixed-ROI digit classifier covers the reads that matter. | OCR benchmarks; game-screen OCR study; sprite characteristics |
| KK-12 | **The legitimate precedent is well established**: overlay + on-demand screenshot + offline calculation, no login, no API, no injection. Calcy IV and Poke Genie have run this way for years. | Store listings; Niantic ToS commentary |
| KK-13 | **The recommendation engine's ceiling is corpus coverage, not search quality.** 10/149 creatures have ability tags; the positional search can act on exactly one creature's ability. | Calculator README; `optimize.ts`; `effects.ts` |
| KK-14 | **The mobile app can see inputs the web app never can** — most importantly the opponent's board, which is what `shield.ts`, `survivability.ts` and `StatFromTargetStatus` have always been missing. | Game is async PvP; engine source comments |
| KK-15 | **`specialUse` foreground services are reviewed by Google** with a required justification and demo video; generic descriptions are rejected. Every off-the-shelf overlay plugin uses one. | Play Device and Network Abuse policy; plugin manifests |

---

## Known unknowns

Each has a named experiment, an estimated cost, and a statement of what it would mean if the answer
is bad. **Ordered by information-per-hour, not by importance** — the point is to buy the cheapest
decisive information first.

### KU-1 — Does the game block capture or overlays at all? ★ do this first

`FLAG_SECURE` makes MediaProjection return black frames. `HIDE_OVERLAY_WINDOWS` makes the overlay
invisible over the game. Either one, set by berrymint in one line, ends the project.

- **Experiment:** Install the game. Start any screen recorder — is the game's content visible or
  black? Install any floating-bubble app — does the bubble render over the game?
- **Cost:** under one hour, today, with zero code.
- **If bad:** the entire approach is dead and nothing else in this spec matters.

This is the cheapest decisive test in the register and it gates everything. Nothing else should be
started before it runs.

### KU-2 — Is the Godot UI layout actually stable in normalized coordinates?

The whole ROI strategy (research A1b) rests on it. Godot's stretch mode and aspect-ratio handling
need to produce predictable element positions across devices after one letterbox calibration.

- **Experiment:** Capture the same game state on 3+ devices with different aspect ratios (e.g.
  20:9 phone, 16:9 phone, tablet) and both orientations. Measure UI element positions. Determine
  whether one letterbox detection plus fixed normalized rectangles locates everything.
- **Cost:** 2 days including device access.
- **If bad:** ROIs become per-device, requiring either a per-device calibration UI (user drags boxes
  — ugly but workable) or feature-based localization (anchor detection, much harder). Adds weeks,
  does not kill the project.

### KU-3 — Will berrymint permit a companion tool, and share the balance data?

- **Experiment:** Ask, on the Discord. Two questions, separately: (a) is a read-only overlay
  companion acceptable? (b) would you share the stat tables and ability data?
- **Cost:** an afternoon.
- **If (a) is no:** reconsider the project. A solo dev's objection to a tool for their own paid game
  carries weight that Niantic's boilerplate does not.
- **If (b) is no:** nothing in the perception pipeline is blocked — the sprites are already in hand
  (research A1c). The existing corpus gaps simply persist, exactly as they do on the web app today.
- **If (b) is yes:** the largest single improvement available to the advice quality on *both*
  platforms — potentially closing the damage-data gap for 60 species, the ability-tag gap for 139,
  and the trinket/item effect gaps (`port-inventory.md` §6.1).

Note what changed from the first draft: this **no longer gates the mobile app**. The sprites the
perception layer needs were already obtained via batodex. (b) is an advice-quality question, not a
feasibility one, which also means it can be asked at leisure rather than up front.

### KU-11 — Are the vendored sprites pixel-identical to what the game draws?

Decides whether sprite identification is a hash lookup or a tolerance-based classifier.

- **Experiment:** Capture one frame, crop a monster at its native scale, pixel-diff against the
  corresponding file in `public/sprites/monster/`.
- **Cost:** under an hour, once KU-1 passes.
- **If identical:** matching is an exact hash over ~149 candidates. Effectively free and effectively
  perfect.
- **If not:** normalized cross-correlation with a confidence threshold, which is the design already
  assumed. Slower and needs a tuned threshold, but not a problem.

### KU-4 — Can one foreground service host both `mediaProjection` and the overlay?

Determines whether we can avoid a reviewed `specialUse` declaration (research B2). The docs imply
yes (a service's type defaults to the bitwise OR of its manifest-declared types), but implication
is not verification.

- **Experiment:** Minimal Kotlin app declaring `android:foregroundServiceType="mediaProjection|specialUse"`,
  or `mediaProjection` alone, hosting a `SYSTEM_ALERT_WINDOW` panel. Does the overlay survive?
- **Cost:** half a day.
- **If bad:** a second `specialUse` service with a carefully-written subtype and a demo video for
  Play review. Adds review risk, not engineering risk.

### KU-5 — Are the in-game numbers legible at phone capture resolution?

ML Kit wants ~16×16 px per character. A digit classifier can go lower, but not arbitrarily low.
Damage values in this game reach five figures (the calculator records Thorntail at 7,994 and
Fumungus at 14K+), so the digits are small and numerous.

- **Experiment:** Capture real frames at native device resolution; measure glyph height in pixels
  for every numeric field we need; attempt binarization and classification on a sample.
- **Cost:** 1 day (depends on KU-1 passing).
- **If bad:** fall back to reading only what's legible and asking the user for the rest; or
  capture at a higher `VirtualDisplay` density than the physical screen, which may or may not help
  since the source is already rasterized.

### KU-6 — Does the placement search hold up on a mid-range phone?

720 permutations, each a full `simulate()`, measured at 60–95 ms **on desktop**. Hermes on a budget
Android chip is a different machine, and the bench/lineup search in `rosterAdvice.ts` is heavier
still (combinations plus a top-3 permutation refine).

- **Experiment:** Bundle the engine into a bare RN app, run `computePlacementAdvice` on a full
  six-creature board plus four bench entries, on a low-end device. Measure.
- **Cost:** 1 day, and it doubles as the proof that KK-9 is real.
- **If bad:** move the search to a Kotlin thread via a native module, cap the search (the two-stage
  refine already exists as a pattern), or compute advice asynchronously and show it when ready. All
  tractable; none free.

### KU-7 — What does continuous capture cost in battery and thermals?

Only matters if animation-based event detection (research D3) is pursued. The state-diffing
alternative avoids the question entirely.

- **Experiment:** Run `VirtualDisplay` + `ImageReader` at 2/5/10 fps alongside the game for 30
  minutes; measure drain and whether the game's own frame rate degrades.
- **Cost:** 1 day.
- **If bad:** the state-diffing design was already the recommendation. This spike's real purpose is
  to decide whether animation detection is ever worth revisiting.

### KU-8 — Will Google Play approve it?

Screen capture + overlay + a foreground service is a reviewed combination, and policy around
exactly this cluster has been tightening (research B4 is the proof: the accessibility rules changed
materially in January 2026).

- **Experiment:** There is no pre-check. Submit to a closed track early with the full declaration
  and demo video, well before the app is finished.
- **Cost:** ongoing; measured in review cycles, not days.
- **If bad:** distribute outside Play — a GitHub release APK, or F-Droid. For a ~10K MAU game whose
  theorycrafting audience already uses Discord, sideloading is an acceptable channel, and it also
  removes the `specialUse` review problem entirely. **Worth deciding deliberately rather than by
  default**, since "Play-store-ready" is a real constraint on the architecture that may be worth
  declining.

### KU-9 — Is React Native earning its keep, or should this be native Kotlin?

The heuristic that "if more than a third of the app needs native bridging, reconsider cross-platform"
is close to binding here, and the iOS payoff that normally justifies the framework tax may never
materialize (KK-6, KK-8).

- **Experiment:** Timebox one week. Build the same thin slice twice: capture → crop → match one
  sprite → show a number in an overlay. Once in RN + Kotlin module, once in pure Kotlin with the
  engine behind a minimal interface. Compare friction honestly.
- **Cost:** 1 week.
- **If RN loses:** the engine still needs a home. Options are a JS runtime embedded in the Kotlin
  app (Hermes or QuickJS standalone) or a Kotlin port. This is the fork in the road that is most
  expensive to take late, which is why the spike is worth its week.

### KU-10 — How fast does the game patch, and how much does that break?

Released 2026-09-15, already at 1.2.0 by 2026-09-29. That is a **fast cadence**, and the calculator
already documents a balance change ("1.3.0 patch" script) within its own three-day history. Every
patch can move a UI element (breaking ROIs), change a sprite (breaking templates), or rebalance a
number (breaking the corpus).

- **Experiment:** Observe the next 2–3 patches. Which of the three breaks, and how often?
- **Cost:** passive, weeks of calendar time.
- **If bad:** the app needs an over-the-air data/ROI update channel rather than shipping them in the
  binary. **That is a v1 architecture decision, not a later fix** — ROI definitions, sprite hashes
  and the corpus should all be remotely refreshable from the start, because retrofitting that is
  expensive and shipping a store update per game patch is not viable.

---

## Where the unknown unknowns live

Not enumerable. But the regions are nameable, and naming them is how a surprise gets recognized for
what it is instead of treated as a one-off.

**1. OEM Android is not Android.** Samsung, Xiaomi, OPPO and others ship aggressive battery managers
that kill foreground services, extra overlay permission layers beyond stock, and modified
`MediaProjection` consent flows. This region reliably produces bugs that are unreproducible on a
Pixel and that arrive as user reports rather than crash logs. Budget for it; do not plan it.

**2. Policy drift.** The accessibility policy change of 2026-01-28 is the existence proof that this
moves, and it moved in a direction that deleted an entire technical approach. Android 17 is already
adding dynamic signal monitoring that flags overlay behavior. Assume the rules for overlays and
capture will be *stricter* in two years than today, and prefer designs that would survive that.

**3. The game as a moving target.** Not just patches (KU-10) but structural change: new UI screens,
a redesigned team pane, new entity kinds the corpus has no type for, a localization pass that
changes text layout, an anti-overlay measure added for unrelated reasons. The calculator has already
lived this once — its own research log records that a round-4 conclusion of "level 2–4 data is a
hard blocker" was **retracted in round 5** as a tooling artifact. Findings in a fast-moving domain
expire.

**4. The gap between a demo and a tool used mid-run.** Every screen-reading project works on the
curated screenshot and then meets reality: mid-animation frames, popups over the board, a scan taken
during a transition, a partially-scrolled list, an unexpected modal. These do not show up until
someone plays with it for an hour, and they are the difference between a convincing prototype and
something anyone keeps installed.

**5. The engine meeting boards it was never tested on.** 207 tests pin numbers for teams that were
constructed by hand. A scanner will feed it arbitrary real boards, including the 139 creatures with
no ability tags, knockout-at-battle-start combinations, and whatever the current meta has converged
on. Expect to find engine bugs that the web app's usage pattern never surfaced — the knockout crash
documented in `SimulationResult.knockedOutAtBattleStart` is precisely this class of bug, found once
already.

**6. Your own interest over time.** A hobby project for a ~10K MAU game, where the realistic user
ceiling is in the hundreds. The calculator reached 181 commits in four days, which is a sprint pace,
not a sustainable one. The honest risk is not technical failure but a half-finished native capture
pipeline abandoned at month three. The mitigation is in the spec's phasing: **each phase has to be
independently useful and shippable**, so that stopping early still leaves something that works.
