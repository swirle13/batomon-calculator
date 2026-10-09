# Port Inventory & Gap Analysis

**Created**: 2026-10-08
**Source repo**: `batomon_calculator` @ `928206f` (181 commits, 2026-10-05 → 2026-10-08)
**Question answered**: for every artifact in the existing calculator — does it transfer, does it
need work, or does it die? And what has to be built that does not exist anywhere yet?

Line counts are `wc -l` on production files, tests excluded unless stated.

---

## 1. Headline numbers

| Bucket | LOC | Fate |
|---|---:|---|
| Engine (`src/engine/`, excl. worker) | ~3,960 | **Reuse unchanged** (RN) |
| Corpus + data layer (`src/data/`) | ~6,500 (948 KB) | **Reuse unchanged** |
| Engine tests (`src/engine/__tests__/`) | ~3,792 / 207 cases | **Reuse**, change one import |
| Portable non-UI helpers scattered in `src/ui/` | ~600 | **Reuse**, ~half |
| State layer (`src/context/`) | ~373 | **Extract then reuse** |
| Share / library | ~530 | **Reuse**, swap 3 platform calls |
| UI components (`src/ui/*.tsx`) | ~6,757 | **Rewrite** |
| Styling (CSS modules + tokens + globals) | ~4,180 | **Rewrite** (values survive, files don't) |
| **New: perception, capture, overlay, calibration** | 0 today | **Build from scratch** |

Roughly **half the production codebase transfers**, and it is the half that took the most effort to
get right: the simulation engine, its 207 pinned numeric test cases, and a hand-adjudicated corpus
of 149 species × 4 levels that went through a documented off-by-one disaster and a value-for-value
repair. The half that does not transfer is presentation, which is the cheaper half to rebuild and
the half that *should* be rebuilt anyway, because a phone overlay is not a desktop builder.

**The calculator's constitution is why this is true.** Principle I — "the engine MUST be a pure,
deterministic function of (roster data + board layout + a fixed tick/time model) with zero
dependency on React, the DOM, or any UI state" — was written for testability in October 2026 and is
now paying out as portability. The discipline is the asset.

---

## 2. Reuse unchanged

### 2.1 `src/engine/` — the whole directory except one file

Verified free of DOM, `window`, `document`, `localStorage`, `crypto`, `Intl`, `performance`,
`structuredClone`, `import.meta.env` and `Date.now` in production code.

| Module | LOC | What it computes |
|---|---:|---|
| `simulate.ts` | 1,268 | Full battle timeline: validation, trinket modifiers, event-driven casts, status ticks, Shock procs, heals, DPS and cumulative series |
| `effects.ts` | 668 | Pre-battle effect resolver: target selection, battle-start grants, knockout/revive, `StatValue` pipeline |
| `rosterAdvice.ts` | 410 | Bench swap search; two-stage lineup search (combinations then top-3 permutation refine) |
| `optimize.ts` | 287 | Time-weighted scoring, positional coverage, 6! permutation search |
| `survivability.ts` | 221 | Shield/heal/cleanse mitigation → half-life multiplier |
| `roster.ts` | 178 | Grid/bench moves with modifier-scope rules |
| `itemEffects.ts` | 108 | Item targets and grants |
| `grid.ts` | 98 | 2×3 geometry, adjacency, branded placement keys |
| `modifiers.ts` | 90 | Four-slot stat merge into per-cast output |
| `placementAdvice.ts` | 92 | Aggregates the advisor's output as one plain-data value |
| `timeToKill.ts` | 81 | TTK vs. day enemy HP, doubling probe to 3600s |
| `statValue.ts` | 79 | `(base + flat) × multiplier + postMultiplierFlat` |
| `selfScaling.ts` | 75 | `statFromOwnStat` tags, on the card path as well as the engine's |
| `status.ts` | 71 | Burn/Poison tick damage, decay, Shock proc ordering |
| `trainerEffects.ts` | 62 | Per-placement trainer modifiers |
| `evolution.ts` | 48 | `evolvesInto` / `evolvesAtLevel` resolution |
| `manualTriggers.ts` | 42 | Manual-trigger press recipients |
| `shield.ts` | 34 | Shield absorption, 15% status reduction |
| `cooldown.ts` | 32 | `base / (1 + speed) + flat`, clamped at 0.1s |
| `errors.ts` | 13 | Typed validation error |

`placementAdvice.ts` deserves a specific note: it was *already* refactored out of a React `useMemo`
into a pure `computePlacementAdvice(config, corpus)` so it could run in a Web Worker, and its
interface is documented as structured-clone-safe plain data. **That refactor is exactly the one a
mobile port needs**, and it is already done. The worker is a 5-line adapter over it, not an
architectural commitment.

### 2.2 `src/data/` — the corpus

948 KB across 25 modules. `creatures.ts` alone is 135 KB / 4,213 lines holding all 149 species with
level-2/3/4 overrides; `shiny.ts` is another 78 KB. Pure data and pure functions throughout; the
only non-trivial runtime construct is a `WeakMap` cache in `corpus.ts` (fine in Hermes).

For sizing: the built Web Worker chunk — which contains the engine *plus* the full corpus — is
**238 KB uncompressed, ~57 KB gzipped**. That is a trivial payload for a mobile app.

### 2.3 Engine tests

22 files, ~3,792 LOC, 53 `describe`, **207 `it()`**. Uniform `import { describe, expect, it } from "vitest"`,
standard `expect` / `toBeCloseTo` / `objectContaining`. No `vi.mock`, no `vi.fn`, no snapshots.

Two exceptions to handle:
- `timeToKill.test.ts:80-82` uses `performance.now()` as a timing guard — drop or gate it.
- `selfScaling.test.ts` imports from `src/ui/shared/BatomonCard/perCastOutput` — a cross-layer test
  dependency that should be broken when the engine is extracted.

These tests are the reason an RN port is credible and a Flutter port is a leap: they pin **exact
numeric expectations** (specific creatures' DPS to the decimal) derived from frame-by-frame gameplay
captures. Under RN they keep running and prove nothing drifted. Under Dart they all have to be
rewritten, and a rewritten test cannot prove the port is faithful — it can only prove the port
agrees with itself.

### 2.4 Pure helpers currently living under `src/ui/`

These are portable today and should move into the shared package during extraction:

| File | LOC | Note |
|---|---:|---|
| `shared/BatomonCard/perCastOutput.ts` | 140 | Builds the `PerCastOutput` stat lines |
| `CumulativeChart/decadeAxis.ts` | 43 | Axis tick computation |
| `CumulativeChart/enemyThreshold.ts` | 59 | Enemy-HP reference line placement |
| `CumulativeChart/sameSeries.ts` | 54 | Series equality for memoization |
| `CumulativeChart/yAxisWidth.ts` | 33 | Label width measurement |
| `TeamLibrary/teamPreview.ts` | 84 | DPS preview per saved build |
| `shared/TrainerCard/setDesignatingTrainers.ts` | 49 | Trainer target sets |
| `GridPicker/dragActivation.ts` | 47 | Constants only; the dnd-kit coupling is nominal |

Plus `src/data/abilityHighlight.ts` (243 LOC) — the ability-text keyword highlighter is pure logic
returning styled runs; only the rendering of those runs is web-specific.

---

## 3. Reuse with changes

| Artifact | LOC | Change required | Effort |
|---|---:|---|---|
| `data/share.ts` | 282 | `canonicalize`, FNV-1a build id, base64url codec and `importBuild` are all portable. Replace `btoa`/`TextEncoder` with an RN base64 shim and `window.location` with deep-link parsing. | Small |
| `data/library.ts` | 253 | Already accepts an injectable `Storage \| null`. Supply an MMKV or AsyncStorage adapter; the CRUD is untouched. | Small |
| `context/TeamConfigContext.tsx` + `teamConfig.ts` | 373 | Not a reducer — `useState` plus ~12 named actions in a `useMemo`. Most rules already delegate to `engine/roster.ts`, `resolveLevelUp` and `modifiersAfterWrite`. Extract the action bodies into a plain module, then wrap in whatever store the mobile app uses. | Medium |
| `engine/placementAdvice.worker.ts` | 36 | Web Worker entry. Replace with a direct call, a worklet, or a native thread. The computation it wraps needs no change. | Trivial |
| `ui/shared/Sprite.tsx` path resolution | ~10 lines of 120 | `${import.meta.env.BASE_URL}sprites/${kind}/${file}` → RN asset registry or a bundled asset map. | Small |

### One concrete cleanup to do *before* extraction

`src/engine/effects.ts:18` imports `TYPE_COLORS` from `src/data/typeColors.ts`, and uses it at
`effects.ts:586-591` purely as the canonical list of creature-type names for unique-type counting.
That is a **presentation module being imported by the resolver** — harmless today, but it means the
engine package would drag a colour table across the boundary. Replace with an `ALL_CREATURE_TYPES`
constant derived from the `CreatureType` enum. Small, isolated, and it is the only such violation
found in the whole engine.

---

## 4. Rewrite

### 4.1 UI components — ~6,757 LOC across 28 production `.tsx` files

Every one depends on CSS Modules and/or native HTML elements. The larger ones:

| Component | LOC | Why it can't come along |
|---|---:|---|
| `TeamLibrary.tsx` | 675 | Fixed drawer, `window` pointer listeners, `document` keydown, `matchMedia` via `useSyncExternalStore`, `localStorage` |
| `primitives/index.tsx` | 589 | `Surface`, `Chip`, `Modal` (document keydown), `Disclosure` (`<details>`), `TypeSplit` (nested divs + CSS grid) |
| `GridPicker.tsx` | 540 | `@dnd-kit` `DndContext`/`useDraggable`/`useDroppable`/`DragOverlay` + 499 LOC of companion CSS |
| `ItemPicker.tsx` | 432 | Modal + search grid |
| `PlacementAdvisor.tsx` | 426 | The feature being ported, but as a desktop panel |
| `ModifierEditor.tsx` | 389 | DOM form controls |
| `SeriesChart.tsx` | 335 | Recharts SVG |
| `TrinketPicker.tsx` | 339 | Modal + search grid |
| `TriggerButtons.tsx` | 299 | Manual-trigger controls |
| `primitives/controls.tsx` | 282 | `<button>`, `<select>`, `<input>`, `<textarea>` |
| `AffectedCreaturePicker.tsx` | 285 | Modal picker |

This is not a loss. A phone companion's primary surface is a **floating panel showing three numbers
and one suggestion**, with a secondary full-screen app for browsing and manual correction. Porting a
desktop two-column builder with a 22rem detail panel onto a phone would be the wrong product even if
it were free.

### 4.2 Styling — ~4,180 LOC

22 CSS Module files (~3,501 LOC), `tokens.css` (445), `index.css` (170), `App.css` (64).

The token *values* transfer directly into an RN theme object or a NativeWind config — spacing scale,
radii, surface colours, type scale, and in particular the game-extracted stat and type colours in
`statColors.ts` / `typeColors.ts`, which are published game values and must not be re-picked by eye.

The token *mechanics* do not. `tokens.css` computes layout with `calc()` over `rem`/`px`:

```
--team-column-width: calc(3 * var(--grid-slot-size) + 2 * var(--grid-gap));
--builder-row-width: calc(var(--team-column-width) + var(--column-gap) + var(--detail-panel-width));
--detail-panel-width: 22rem;
```

and `index.css` sets `#root { width: max(1126px, …); min-height: 100svh; }`. Those are
desktop-document concepts with no mobile analogue.

Features in use with no RN equivalent: `mask-image` (the painted-sprite overlay in
`CreatureSprite.module.css` — needs a masked `Image` or precomposed assets),
`image-rendering: pixelated` (→ nearest-neighbour scaling, and it matters: the mobile-responsiveness
findings record that a 112px sprite box caused visible blur and they settled on 96px to keep integer
multiples of 48), `position: fixed`, `100svh`. Not in use, so not a problem: container queries,
`:has()`.

The existing `mobile-responsiveness-findings.md` is worth reading before designing the mobile UI —
it already identified the fixed 22rem detail column, the 7rem type-chip min width, the 880px modal
call site, and the lack of a unified breakpoint system, and it establishes the 48px sprite grid
discipline that a mobile UI must also respect.

### 4.3 Third-party UI dependencies

| Dep | Blast radius | Replacement |
|---|---|---|
| `@dnd-kit/core` | 1 file (`GridPicker.tsx`, 540 LOC) + `dragActivation.ts` (47) + ~499 LOC CSS | `react-native-gesture-handler` + Reanimated. No drop-in. |
| `recharts` | 1 file (`SeriesChart.tsx`, 335 LOC); the other 3 charts are thin adapters | Victory Native, gifted-charts, or RN Skia |

Both are **well localized** — one screen each — which is good containment. But they anchor the two
highest-effort UX surfaces (drag-and-drop board editing, and time-series charts), so "localized"
does not mean "cheap to replace." It means the replacement is a bounded project rather than a
diffuse one.

### 4.4 Assets

445 PNGs, ~1.7 MB, under `public/sprites/{monster,trinket,trainer,item}/`, documented as 48×48
source art, vendored from the batodex fan dex rather than hot-linked, and described in the README
as "the **game's own artwork**."

These transfer as files and need only a new resolution mechanism (asset registry or bundled map
instead of a URL base path). More importantly, **they are also the mobile app's sprite-matching
template set** — the perception layer's largest single input requirement is satisfied by an asset
this repo already ships. That is a rare piece of luck and it removes asset acquisition from the
critical path entirely (`research.md` A1c, A1d).

---

## 5. Build from scratch — the actual new project

Nothing below exists in any form today. This is the real cost of the mobile app, and it is mostly
Kotlin.

| Component | Language | Sketch | Risk |
|---|---|---|---|
| **Capture service** | Kotlin | Foreground service (`mediaProjection` type), consent flow, `VirtualDisplay` + `ImageReader`, session lifecycle, graceful stop | Medium — contract is well documented, UX of per-session consent is the hard part |
| **Overlay window** | Kotlin | `SYSTEM_ALERT_WINDOW` panel, draggable handle, edge snap, collapse/expand, opacity ≥ 0.8 for touch, hosted from the capture service to avoid a second `specialUse` FGS | Medium — plugins exist but all add the `specialUse` service we want to avoid |
| **Calibration** | Kotlin | Detect Godot letterbox bounds once per device/orientation; derive ROI rectangles in normalized coords; persist | **High — unproven** (see KU-2) |
| **Sprite matcher** | Kotlin (+OpenCV?) | NCC or perceptual hash of each slot ROI against the known sprite set; confidence threshold → "unknown, ask user" | Low-medium if assets are exact; medium if using fan-dex sprites |
| **Digit reader** | Kotlin | Fixed-ROI binarize + 10-glyph classifier for gold, HP, levels, counts | Low if the font is obtainable; medium otherwise |
| **Text OCR fallback** | Kotlin | ML Kit Text Recognition v2 bundled model, confidence-gated | Low |
| **`BoardReading` contract** | TS + Kotlin | The one data structure crossing the bridge: slots → (species, level, shiny), trinkets, items, trainer, gold, day, opponent board. Codegen'd or hand-mirrored. | Low, but **design it first** — it is the seam the whole app hangs on |
| **Reconciliation UI** | TS/RN | Show what was read, let the user correct it, remember corrections. Non-optional: vision will be wrong sometimes and silent wrongness is worse than no tool. | Medium |
| **Run/session state** | TS/RN | Persist the current run across scans: team, bench, trinkets, items, gold, day, banked manual-trigger presses. Diff-based trinket/item acquisition (research D3). | Medium |
| **Golden-frame test corpus** | — | Directory of real device screenshots, hand-labeled with expected `BoardReading`. | **Must exist from day one**, see §7 |
| **Opponent modelling** | TS | New engine work: a real target with HP/shield, so `applyShieldReduction` finally does something (research G) | High value, high effort, **not v1** |

---

## 6. Gap analysis

### 6.1 Gaps the mobile app inherits from the calculator

These are documented in the calculator's own README as intentional deferrals. They do not get worse
on mobile, but they do get **more visible**, because a screen reader will show the user a real board
containing creatures the engine has no model for.

| Gap | Current state | Mobile impact |
|---|---|---|
| Ability coverage | **10 of 149** level-1 creatures carry any `abilityTags`; the rest are prose-only and inert | A scanned board will frequently contain mostly unmodelled creatures. The UI must say so — the web app already does this honestly and mobile must too. |
| Positional modelling | The engine acts on **one** positional ability in the whole corpus (Formiqueen's `cooldownSpeedModifier`). Onsetra's `behind` tag is recorded and read by nothing. Six trinkets have slot-scoped effects with no tags. Link Cable ("all monsters considered adjacent") would invalidate the one interaction that is visible. | **This is the feature being ported.** "No improvement found" usually means "the effects that make position matter aren't modelled," not "your layout is optimal." Porting the advisor without widening coverage ports a mostly-empty search. |
| Trinket effects | **6 of 93** wired into simulation | Scanning trinkets is easy; acting on them is not |
| Item effects | **11 of 40** have a modelled `effect`; 29 are shop/economy | Same |
| Shield absorption | Implemented, unit-tested, **wired to nothing** | Closable by G — the opponent board is on screen |
| Survivability / cleanse | Priced against an *assumed* incoming debuff rate | Same — closable |
| Branching evolutions | Recorded, not resolved by leveling (Ignit→Flarilisk is "On Victory"; `resolveLevelUp` can't know a battle was won) | A mobile app **can** know: it sees the victory screen. Closable later. |
| Level-up value | Not modelled at all (the user's own stated next want) | Needs shop contents + gold, both on screen. Enabled by mobile, not blocked by it. |
| Damage data | `baseDamage: null` for 60 of 149 species — "not published by our sources," **not** "deals no damage" (a screenshot shows Brimtoad dealing 5 where every source omits it) | Getting the game's own tables (research A1c) would close this outright |

**The honest conclusion:** the recommendation engine's ceiling today is corpus coverage, not search
quality. A port that does not also widen coverage delivers a fast, well-tested search over a corpus
that mostly cannot be acted on. Getting the game's own stat and ability tables is the single
intervention that moves this most, and it is worth pursuing on its own merits — it improves the web
calculator immediately, whether or not the mobile app is ever built.

### 6.2 Gaps that are new to mobile

| Gap | Why it's new |
|---|---|
| Per-session capture consent | Unavoidable system dialog, once per session (research B1) |
| Device/orientation calibration | No equivalent problem on web |
| Read failure is now possible | The web app's inputs are typed by the user and therefore correct. A scan can be wrong, and the app must make wrongness visible and correctable. |
| Run state persistence | The web app is stateless per page load plus a saved library. A companion tracks a live run across many scans. |
| Battery and thermals | Captured during active gameplay on a device already rendering a game |
| Play Store review | The web app ships to GitHub Pages with no gatekeeper. `specialUse` FGS + overlay + screen capture is a reviewed combination (research B2). |
| OEM behaviour | Samsung/Xiaomi/etc. aggressively kill foreground services and restrict overlays in ways stock Android does not |

---

## 7. What replaces the 207 tests for the half that is new

The engine's credibility rests on 207 unit cases pinning exact numbers against cited sources and
frame-by-frame captures. The vision layer has no equivalent and will not acquire one by accident.

**Build a golden-frame corpus from the first week.** A directory of real device screenshots — across
devices, aspect ratios, orientations, game states, and game versions — each paired with a
hand-labeled expected `BoardReading`. Every perception change runs against all of them. This is the
vision layer's version of Constitution Principle III, and without it the perception code is
untestable and will rot silently the first time the game patches its UI.

Corollary: **the perception layer must be callable on a stored PNG, never only on a live device.**
That is an architectural constraint, not a testing convenience, and it should be a principle in the
new project's constitution.

---

## 8. If Flutter is chosen anyway

Recorded for completeness, since the brief named it. Beyond rewriting the engine's algorithms, these
TypeScript constructs have no direct Dart equivalent and each needs a decision:

| Construct | Where | Dart approach |
|---|---|---|
| `AbilityTag` — 22-member discriminated union on `kind` | `types.ts:143-362`, switched on in `effects.ts:543+` | Sealed classes or `freezed`; no structural narrowing |
| Branded `PlacementKey` | `types.ts:860`, built at `grid.ts:96` | No brands — wrapper class, or typedef plus discipline |
| Structural typing in signatures | `windowAverageDps` takes `{ perCreatureDps: Record<string, number>; … }` (`simulate.ts:235`) | Explicit interface |
| `Partial<Record<2\|3\|4, CreatureLevelOverride>>` | `CreatureSpecies.levels` (`types.ts:517`) | `Map` or three optional fields |
| `Record<StatusEffectType, number>` | `modifiers.ts:36` and throughout `SimulationResult` | `Map` or fixed fields per enum member |
| Literal unions (`1\|2\|3\|4`) | `evolution.ts:17`, `CreatureRecord.level` | `int` + assert, or an enum |
| Type predicates | `isDirectDamage` (`status.ts:69`), `isResolvableTag` (`effects.ts:177`) | Manual checks |
| `as const` tuples | `RESOLVED_TAG_KINDS` (`effects.ts:126-174`) | `const` lists |

Plus: the 948 KB corpus has to be re-expressed (as Dart source, or as JSON loaded at runtime — the
latter loses the compile-time guarantees that Constitution Principle II exists to provide), and all
207 tests rewritten with no way to prove the rewrite is faithful to the original.

Estimate: **4–8 weeks of engine/corpus porting before the first mobile feature exists**, versus
roughly zero on React Native.
