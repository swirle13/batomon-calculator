# Research: Batomon Showdown Screen-Reading Companion

**Created**: 2026-10-08
**Status**: Research complete, no implementation
**Scope**: Everything that had to be established before the spec could be written. Findings are
numbered so the spec, the port inventory and the uncertainty register can cite them.

This document follows the convention of the calculator's own `research.md`: where a question was
settled, the reasoning is recorded here rather than carried inline in the spec; where a question
is still open, it says so and names the experiment that closes it.

---

## A. The target game

### A1. Batomon Showdown is a Godot game, and that fact drives most of this document

The itch.io demo page for Batomon Showdown lists **"Made with: Godot"** in its metadata, alongside
the tags `2D`, `Auto Battler`, `Pixel Art`. The Android build is `com.batomon.showdown` by
berrymint: released 2026-09-15, currently 1.2.0 (updated 2026-09-29), a **250 MB APK**, **paid at
$5.09**, roughly **16K installs and ~10K monthly active users**, 4.71★.

Four consequences follow, and they are the spine of every architectural decision in the spec.

**A1a — There is no accessibility tree to read. The app must work on pixels.**

Godot 4.5 (2025) added screen-reader support via AccessKit, and AccessKit does have an Android
adapter that constructs real `AccessibilityNodeInfo` objects. So the capability nominally exists.
In practice it does not help us:

- Godot's own release notes call the integration **"still in its experimental phase."**
- Developers report it **not working on Android at all**: a Godot forum thread from 2025-09-17 asks
  whether AccessKit is supposed to work on Android exports because TalkBack does nothing; a
  2025-12-26 thread on Android embedded mode reports Godot's view is **not focusable** under
  TalkBack and the author gave up and shipped a TTS plugin instead; a follow-up in January 2026
  confirms the same problem is still unsolved.
- Even where it works, exposure is **opt-in per node** — a developer has to set accessibility roles
  in `NOTIFICATION_ACCESSIBILITY_UPDATE`. A shipped indie autobattler will not have done this.

So: whatever Batomon Showdown draws, it draws into a single surface with no semantic structure
behind it. **Pixels are the only interface.** This is a *closed* question, and closing it is
valuable — it deletes an entire branch of the design space before any code is written.

**A1b — Godot's stretch model makes UI positions predictable, which is unusually good news.**

Godot projects declare a base viewport resolution and a stretch mode, and the engine letterboxes or
scales to fit the device. Unlike an Android app built from native views — where layout is
device-dependent and a hardcoded crop rectangle is hopeless — a Godot game's UI sits at **fixed
positions in normalized viewport coordinates** on every device. Find the letterbox bounds once per
device, and every region of interest (team grid slots, trinket tray, gold counter, shop row) is a
constant rectangle inside it.

This converts the hardest part of screen reading — "where on screen is the thing" — from a vision
problem into an arithmetic problem, with one calibration step. It is the single biggest reason this
project is tractable. It is also **not yet verified on real hardware** (see `uncertainty-register.md`
KU-2).

**A1c — The game's data is inside the APK and extractable — but the art we already have.**

Godot ships resources in a `.pck` archive, embedded in the APK for Android builds. **GDRE Tools**
(`gdsdecomp`, MIT-licensed, actively maintained — v2.6.0 released 2026-07-16) performs full project
recovery directly from an APK:

```
gdre_tools --headless --recover=game.apk --output=dir
```

It extracts the PCK, converts imported textures back to source formats, restores `.import` mappings
so atlas entries land at their original source paths, and **decompiles GDScript bytecode**. Lighter
alternatives exist for extraction only (`GodotPckTool`, `gdex`).

**Correction (2026-10-09, project owner).** An earlier draft of this section listed ground-truth
sprites as the primary prize. That was wrong, and the mistake is instructive: **we already have
them.** The calculator vendors all 445 sprites — 149 monsters, 93 trinkets, trainers and items —
obtained via the batodex.com fan dex, which in all likelihood extracted them from the Steam build's
own files by this same route. The README already describes them as "the **game's own artwork**."
So the asset problem that would normally dominate a perception project is *already solved*, and
extraction is not on the critical path for it.

What extraction would still yield, narrowed accordingly:

1. **The game's actual font**, from which a 10-glyph digit classifier can be trained in an
   afternoon. This is the one perception input we do not already hold. It is also the smaller half
   of the problem — digits in a known ROI are tractable with a hand-labeled sample from real
   captures, so this is a convenience rather than a dependency.
2. **The stat tables and ability implementations** — the real remaining prize, and it has nothing
   to do with screen reading. It would close most of the corpus gaps the calculator documents in its
   own README: 60 of 149 species with no published damage line, 139 of 149 with no `abilityTags`,
   87 of 93 trinkets with unmodelled effects, 29 of 40 items the same. Per `port-inventory.md` §6.1,
   corpus coverage — not search quality — is the recommendation engine's actual ceiling, so this is
   the single intervention that would most improve the advice on *both* platforms.

The asterisk stands, and now applies to a narrower thing. It is a **paid** indie game by an active
solo developer, and the remaining ask is for their balance data rather than their art. That is a
conversation, not a tooling decision: see the spec's Open Decisions, and note that asking is also
the path with the best upside — a 10K-MAU game with an engaged Discord and a theorycraft-heavy
design is exactly where a developer sometimes just hands the tables over.

**A1d — Pixel art makes recognition nearly exact.**

The calculator already vendors 445 sprite files (~1.7 MB) at a documented 48×48 source size, scaled
only by integer multiples to stay crisp. Pixel art rendered with nearest-neighbour upscaling means
a captured monster sprite is a **deterministic integer-scaled copy** of a known bitmap, not a
photograph of one. Normalized cross-correlation or a perceptual hash over ~149 candidates should
approach 100% accuracy with no model training at all — a completely different reliability regime
than OCR on stylized text.

And per A1c, these are very probably the game's own files rather than re-drawn or re-captured
approximations, which is what makes "deterministic copy" more than a hopeful phrase. The cheap
confirmation is to pixel-diff a vendored sprite against a crop from a real capture (KU-11) — if
they match exactly, the matcher is a lookup rather than a classifier.

### A2. Market size should set the effort budget

~16K installs and ~10K MAU, for a paid game, on Android only. A companion tool reaching an
enthusiastic 5–10% of that is **500–1,000 users**. The spec is written for a high-craft hobby
project with a realistic ceiling, not a product. This is stated plainly because the alternative —
discovering it after building an iOS broadcast-extension pipeline — is the expensive way to learn it.

---

## B. Android platform capabilities

### B1. Screen capture: MediaProjection, and its per-session consent tax

The only sanctioned way to read another app's pixels. The contract, for Android 14+ targets:

- Manifest needs `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PROJECTION`, plus a service
  declared `android:foregroundServiceType="mediaProjection"`.
- The service must be **started with that type before** `getMediaProjection()` is called, or the
  call throws `SecurityException`.
- **Consent is required before every session.** The `Intent` from `createScreenCaptureIntent()` is
  single-use; passing it to `getMediaProjection()` twice throws, and `createVirtualDisplay()` may be
  called only once per `MediaProjection` instance.

That last point is the defining UX constraint: **the system dialog appears every time capture
starts.** It cannot be suppressed. The mitigation is the one Calcy IV uses — hold the projection
open in a foreground service for an entire play session and capture frames on demand within it, so
the user sees the dialog once per sitting rather than once per scan.

Android 14 introduced the single-app vs. entire-screen choice at the consent dialog. A real Calcy IV
user report from 2024-09 captures the trap exactly: the user launched the companion before the game,
so the game wasn't in the app list and **only full-screen capture was selectable**. Our launch flow
must therefore require the game to be running *first*. Android 16 adds
`OVERRIDE_DISABLE_MEDIA_PROJECTION_SINGLE_APP_OPTION` (change ID 316897322), which forces the choice
to be offered — disabled by default, but it exists and could flip.

One helpful detail from the `MediaProjectionManager` docs: from Android R onward, if the app has
requested `SYSTEM_ALERT_WINDOW` and the user hasn't explicitly denied it, **that permission is
auto-granted for the duration of the projection**, specifically so the app can draw controls over
the captured screen. The two permissions we need are designed to be used together.

### B2. Overlay: SYSTEM_ALERT_WINDOW, and a Play-review hazard in the plumbing

The floating-icon pattern the user described is `SYSTEM_ALERT_WINDOW` plus a foreground service to
keep it alive. Every cross-platform plugin surveyed (`flutter_overlay_window`,
`flutter_screen_overlay`, `react-native-android-floating-bubble`, `expo-draw-over-apps`) implements
it the same way, and they all declare:

```xml
<service android:foregroundServiceType="specialUse">
  <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
            android:value="explanation_for_special_use"/>
</service>
```

**This is the Play-review hazard.** `specialUse` is the catch-all type, and Google reviews every
declaration: the subtype string is free-form but must justify why no named type fits, the Play
Console requires a description plus a **demo video**, and the Device and Network Abuse policy
requires the service to be user-initiated, user-perceptible, and core to the app. A plugin's stock
`explanation_for_special_use` placeholder shipped as-is is a likely rejection.

**Mitigation worth designing in from the start:** we already require a `mediaProjection` foreground
service, which is a *named* type with an obvious justification. A single service can declare
multiple types (`android:foregroundServiceType="mediaProjection|specialUse"`, and `startForeground`
takes a bitmask — the docs note the type defaults to the bitwise OR of the manifest's declared
types). Hosting the overlay from the capture service rather than standing up a second `specialUse`
one would reduce the review surface to the single type we can most easily defend. Every off-the-shelf
plugin stands up its own service, so this likely means **writing the overlay module by hand rather
than taking a plugin** — a cost, but a known one, and small (an overlay window is a few hundred lines
of Kotlin).

### B3. Overlay restrictions that constrain the design

- **Touch passthrough (Android 12+):** touches are blocked through non-trusted overlays from another
  UID, *except* that for `SYSTEM_ALERT_WINDOW` only layers with **opacity ≥ 0.8** are blocked. A
  mostly-transparent interactive overlay therefore behaves differently from an opaque one. Design
  the overlay as a compact opaque panel plus a draggable handle, not a full-screen translucent HUD.
- **`HIDE_OVERLAY_WINDOWS` (Android 12+):** any app can opt out of being overlaid, with one manifest
  line. If berrymint ever adds it, the overlay stops rendering over the game and there is no
  workaround. Low probability for an indie game with no fraud surface, but it is **a kill switch in
  someone else's hands** and belongs in the risk register.
- **`FLAG_SECURE`:** if the game ever sets it, MediaProjection yields black frames. Same shape of
  risk. Both are testable in under an hour against the shipping build and that test should be the
  very first thing anyone does (`uncertainty-register.md` KU-1).
- Secure system surfaces (permission dialogs, payment sheets) block overlay touches by design. Not
  a problem in-game, but it affects onboarding: an active overlay can block the very permission
  prompts we need granted, which is the classic "Screen overlay detected" failure. Onboarding must
  request all permissions **before** the overlay is ever shown.

### B4. The AccessibilityService route is closed, on two independent grounds

Worth recording explicitly, because it is the obvious-looking approach and it is a dead end.

1. **Policy.** Google Play's updated sensitive-permissions policy, **effective 2026-01-28**, bars the
   Accessibility API for "an app that autonomously initiates, plans, and executes actions or
   decisions," with screen-reading-plus-acting automation named as prohibited. Non-accessibility use
   requires a Play Console declaration, prominent in-app disclosure and affirmative consent, and
   must use "more narrowly scoped APIs in lieu of the Accessibility API when possible" — which
   MediaProjection plainly is for our purpose. Android 17's Advanced Protection removes accessibility
   access from all apps not labeled accessibility tools, and Play Protect's new dynamic signal
   monitoring explicitly flags "accessibility overlay" behavior as suspicious.
2. **Technology.** Per A1a, a Godot canvas exposes nothing to read even if policy allowed it.

Either reason alone settles it. Together they make it a non-decision. The spec does not model it.

---

## C. iOS: a different product, not a port

### C1. There is no floating overlay on iOS, and there is not going to be one

No third-party iOS app can draw an arbitrary always-on-top window over another app. This is not a
permission that can be requested; the capability does not exist. The only cross-app surfaces are
**system-rendered**:

- **Custom-content Picture-in-Picture** (`AVPictureInPictureController` with
  `AVSampleBufferDisplayLayer`, iOS 15+) — public, sanctioned, and genuinely floats over other apps.
  It is a video surface, so the "UI" has to be rendered into sample buffers, and PiP has its own
  lifecycle and user controls.
- **Live Activities / Dynamic Island** (ActivityKit, iOS 16.1+) — public, but small, template-bound,
  and the Island is Pro-hardware only. Suited to a few numbers, not an advisor panel.

### C2. iOS capture today is a Broadcast Upload Extension, with a 50 MB ceiling

System-wide capture that survives app switching requires a ReplayKit **Broadcast Upload Extension**,
started from `RPSystemBroadcastPickerView`. Capture happens out-of-process in `replayd`; the
extension receives sample buffers over XPC. Constraints that matter:

- **50 MB hard memory cap** on the extension process (the main app's ceiling is 1–2 GB). An image
  pipeline doing template matching has to live inside that.
- Needs App Group + IPC to reach the main app.
- Cold-start latency ~1–2s, a system countdown ring before frames flow.
- A cited practitioner estimate puts it at **7–14 developer days including QA**, versus 1–2 days for
  in-app-only capture.

### C3. ScreenCaptureKit is coming to iOS — in iOS 27, not now

Apple's ScreenCaptureKit documentation now covers iOS, with `SCContentSharingPicker` offering a
`singleDisplay` mode and the explicit note that "a broadcast extension is no longer necessary."
This would be a large simplification. But the availability annotations are **`ios = 27.0`**, the
sample explicitly "requires a device running iOS 27 or later," and the pages are flagged *Beta
Software — preliminary information about an API in development*. As of October 2026 this is a future
capability, not a shippable one.

### C4. Therefore iOS is doubly deferred, and that is fine

Two independent blockers, either sufficient: **the game has no iOS build** (berrymint: "iOS coming
soon," no date), and **the overlay interaction model does not exist** on the platform. When iOS does
arrive, the honest design is not a port of the Android experience — it is a **screenshot-import
companion**: the user screenshots mid-run and shares into the app, which reads it and shows advice
in-app. That is exactly what Poke Genie shipped on iOS for years, and it needs no capture
entitlement at all.

The practical instruction for the spec: **do not let iOS constrain the Android architecture**, but
do keep the engine, the corpus and the perception *contract* platform-neutral so an iOS surface can
be bolted on later without touching them.

---

## D. Perception: how to actually read the board

### D1. General OCR is the fallback, not the foundation

Benchmarks are consistent that Android is the weak platform for OCR. A field-level F1 comparison
through a real React Native pipeline: **Apple Vision 85.4%, ML Kit v2 75.5%, PaddleOCR PP-OCRv4
74.7%, tesseract.js 59.0%** — and tesseract.js "cannot run inside React Native at all, because its
WASM build has no home in the Hermes runtime." An academic study of OCR on *game screens*
specifically found Tesseract inadequate (highly sensitive to text/background contrast and unusual
fonts), EasyOCR best at detection, PaddleOCR best at accuracy, and recommended binarization plus
region extraction as the main accuracy lever.

If this project depended on general OCR of stylized game text, 75% field accuracy would make it
unusable — a board reading is six monsters plus trinkets plus items, so per-field errors compound.

### D2. It does not have to depend on general OCR

The reads the app needs decompose into three kinds, and only the third wants OCR:

| What | Technique | Why it's reliable |
|---|---|---|
| **Which monster / trinket / item is this?** | Template match or perceptual hash against the known sprite set | Pixel art, integer-scaled, ~149/93/40 candidates. Near-exact (A1d). |
| **What number is in this box?** | Bespoke digit classifier over a 10-glyph alphabet in a fixed ROI | Known font, known position, binarizable. Trivially trainable; far above general OCR. |
| **What does this ability text say?** | ML Kit Text Recognition v2, bundled model | Only needed for unrecognized/new content, and only as a hint. |

ML Kit stays in the stack as the fallback and for free text. It needs ~16×16 px per character and
returns boxes plus confidence, which is enough to gate low-confidence reads into "ask the user"
rather than guessing. **The architecture should be ROI-first, template-match-second, OCR-last.**

Note what this depends on, and what it does not. The **sprite** row is cheap because the
calculator's 445 vendored assets are already in hand and are very probably the game's own files
(A1c, A1d) — no extraction required, and the project's single biggest perception dependency is
satisfied on day one. The **digit** row is cheap because the ROI and the glyph set are tiny; having
the game's font would make it cheaper still, but a few hundred hand-labeled digits from real
captures gets there without it.

### D3. Event detection from animations is a genuinely harder problem, and should not be in v1

The user specifically raised detecting that an item or trinket was *taken*, from the UI animation,
rather than requiring a trip to the trinket tab. This is a real need and a real step up in
difficulty:

- It requires **continuous** capture, not on-demand. Calcy IV's pitch includes "Power-saving: only
  takes a screenshot when you instruct it to," and that is not an accident — continuous
  `VirtualDisplay` + `ImageReader` at any useful frame rate costs battery and thermal headroom
  during a game that is already rendering.
- It requires temporal state: a classifier over frame *sequences*, with debouncing, false-positive
  suppression during other animations, and recovery when frames are dropped.
- It fails silently and asymmetrically: a missed pickup leaves the model stale, and the user has no
  signal that the advice is now wrong.

**There is a much cheaper 90% solution:** *state diffing*. Scan the trinket tray (or the team pane)
on each user-initiated scan and diff against the last known state. A newly present trinket is a
newly acquired trinket, regardless of whether the animation was seen. This gets the same information
with no continuous capture, no temporal model and no battery cost — at the price of the state being
correct only as of the last scan, which for a game with **no timers** ("Play at your own relaxed
pace") is an acceptable trade.

Recommendation: **state diffing in v1; animation detection as an explicitly separate later phase**
with its own feasibility spike, gated on evidence that diffing is actually insufficient in play.

### D4. The pixel pipeline should never cross into JavaScript

An important architectural consequence: capture → crop to ROIs → template match → digit classify can
all run in Kotlin (with OpenCV or hand-rolled NCC), returning a small structured `BoardReading`
object. Frame bitmaps never need to enter the JS/Dart side. That keeps the bridge cheap, keeps the
50 MB-class memory concerns native, and — critically — **means the choice of cross-platform framework
barely affects the vision pipeline at all.** The native work is the same either way.

---

## E. Framework selection

### E1. The decisive asymmetry is the existing engine, not the UI

Both frameworks are mature and the performance debate is largely settled (RN's New Architecture —
JSI, Fabric, TurboModules — default since 0.76; Flutter's Impeller mandatory since 3.29). Neither
has a UI advantage that matters for a mostly-forms-and-cards app with one floating panel.

What is *not* symmetric is the asset being ported. From the engine analysis:

- `src/engine/` is **~3,960 LOC of pure TypeScript** with **zero** DOM, `window`, `localStorage`,
  `crypto`, `Date.now`, `Intl` or `import.meta.env` usage in production code. The only browser hook
  in the whole directory is `placementAdvice.worker.ts` (36 lines), and it is a thin adapter over the
  real API, `computePlacementAdvice(config, corpus)`.
- It is backed by **22 test files, ~3,792 LOC, 207 `it()` cases**, with no `vi.mock`, no snapshots —
  portable to any Jest-like runner by changing one import line.
- `src/data/` is **~948 KB** of typed corpus, keyed by 22-member discriminated unions.

**React Native runs all of that unchanged in Hermes.** Flutter requires transliterating the
algorithms *and* reimplementing the type system they are written in: the 22-member `AbilityTagKind`
discriminated union (sealed classes or `freezed`), the branded `PlacementKey` (no equivalent —
needs a wrapper class or discipline), structural typing in function signatures, `Partial<Record<2|3|4, …>>`
level overrides, and `Record<StatusEffectType, number>` maps. Then it needs the 207 test cases
re-expressed to prove the port didn't drift. That is the difference between "import it" and "spend
several weeks and hope."

### E2. RN's bridge is also the better fit for what this app does across it

- **JSI/TurboModules** give synchronous host-object bindings and efficient `ArrayBuffer` transfer;
  `CallInvoker` is the sanctioned way to get from a native capture thread onto the JS runtime.
- Flutter platform channels are **async-only**, with `Uint8List` through `StandardMessageCodec`.
- Flutter's compensating strength — isolates for Dart-side compute — is aimed at a problem we don't
  have, because the expensive work (vision) is native and the other expensive work (the 720-permutation
  placement search, measured at 60–95 ms on desktop) is small enough to run inline or on a worklet.

Flutter's genuine advantages (custom rendering, gesture-driven canvas work, consistent 60fps
animation) are real and simply not what this app is.

### E3. Recommendation, and the option worth a spike

**Recommend React Native via Expo with a development build** (`expo prebuild` / dev client — not
Expo Go, which cannot load custom native code), plus a **hand-written Kotlin module** for capture,
overlay and vision. Rationale: it is the only option where the engine and corpus are *imported
rather than rewritten*, and the native work it does require would have to be written in Kotlin under
any framework.

**The option that deserves a spike before committing:** a **native Kotlin app** that embeds the
engine as a JS bundle in a JS runtime (Hermes or QuickJS standalone), or calls it over a thin
interface. The quoted heuristic — "if more than a third of the app needs native bridging, reconsider
cross-platform entirely" — is close to binding here: capture, overlay, foreground-service lifecycle,
permission flows and the image pipeline are all native, and the only cross-platform payoff is a
hypothetical future iOS build that **cannot share the interaction model anyway** (C4). A single-platform
app paying a cross-platform framework tax for a port that will never happen is a real possibility
worth one week of investigation rather than an assumption.

---

## F. Precedent and permission

### F1. Calcy IV and Poke Genie define the legitimate pattern

Both are IV calculators for Pokémon GO that have operated for years at large scale. Their shared
architecture is exactly the one proposed here: **a movable overlay button, an on-demand screenshot,
OCR/image analysis of known regions, and calculation entirely offline.** Calcy IV's own store listing
is unusually explicit about the boundary: *"No login and no interaction with other applications."*

Niantic's ToS bars "accessing Services in an unauthorized manner (including using modified or
unofficial third party software)," and both tools are understood to comply because they never touch
the service — only the user's own screen. Reports cite Niantic confirming both apps comply.

The extractable principle: **read-only, pixels-only, no process interaction, no network calls to the
game's backend, no credentials.** That line is what keeps these tools legitimate, and the spec treats
it as a hard architectural boundary rather than a policy preference.

### F2. Our situation differs in two ways that both point to "ask the developer"

1. Batomon Showdown is **paid**, from a **solo indie developer** with an active Discord — not a
   corporation with a published third-party-tools stance. There is no precedent to rely on.
2. The remaining high-value ask (A1c — the stat and ability tables) is the kind of thing a solo
   developer may feel differently about than Niantic would. Note this is an *advice-quality* ask,
   not a feasibility one: the sprites the perception layer needs are already vendored.

A direct conversation with berrymint costs an afternoon and resolves more risk than any amount of
analysis. It may also go *better* than neutral: a 10K-MAU game with an engaged Discord and a
theorycrafting-heavy design is the kind of community where a developer sometimes just hands over
the data tables. **Recommended early, though only the "is a companion acceptable" half needs to
precede any code.**

---

## G. The strategic finding the brief did not ask for

Worth stating separately, because it reframes the project.

The calculator's single largest structural limitation, repeated throughout its README, its
`types.ts` and its engine comments, is that **there is no modeled opponent**:

- `applyShieldReduction` is implemented and unit-tested but **wired to nothing**, because there is
  no enemy HP/shield pool for it to reduce.
- `healPerSecond` and `perStatusPerSecond.Shield` are computed and then "neither reduces any damage
  in this simulation, because there is no modelled incoming side."
- `CleanseDebuffs` — the only defensive mechanic in the corpus — is priced in `survivability.ts`
  against an **assumed** incoming debuff rate, which that module itself calls "the one tag whose
  value depends on an assumption about the opponent."
- `StatFromTargetStatus` (Fumungus, the captured team's largest damage term) needs a modeled target
  the engine does not have.
- Time-to-kill falls back to a static day-indexed HP table.

Batomon Showdown is an **asynchronous PvP autobattler**: you load a saved opponent board, and *that
board is on screen*. A screen reader that reads the opposing side converts every one of those
assumptions into measured data. EHP and survivability stop being a half-modelled estimate and become
a real computation against a real enemy.

The same shape applies to the user's own note about "expecting level-ups as potential benefits over
just raw upgrades" — that comparison needs shop contents, gold, and current levels, all of which are
on screen and none of which the web app can ever know.

**So this is not a port with a camera bolted on. The mobile app is the only form of this tool that
can see the inputs the engine has always been missing.** The spec is written around that, because
it changes which features are worth building first.

---

## H. Source index

Platform and policy:
- Android Developers — Media projection (foreground service type, per-session consent, single-use token)
- Android Developers — `MediaProjectionManager` reference (SAW auto-grant during projection)
- Android Developers — Compatibility framework changes, Android 16 (`OVERRIDE_DISABLE_MEDIA_PROJECTION_SINGLE_APP_OPTION`, change ID 316897322)
- Android Developers — Foreground service types are required (Android 14), `specialUse` subtype review
- Android Developers — Tapjacking (Android 12 touch blocking, opacity ≥ 0.8 for SAW)
- Android Developers — Secure sensitive activities (`HIDE_OVERLAY_WINDOWS`, `FLAG_SECURE`)
- Play Console Help — Device and Network Abuse (FGS justification, demo video)
- Play Console Help — Use of the AccessibilityService API; Preview: Permissions and APIs that Access Sensitive Information (2026-01-28 enforcement)
- Google Security Blog — New Android Security and Privacy Features in 2026 (Android 17 Advanced Protection, dynamic signal monitoring)
- Apple — ReplayKit security in iOS and iPadOS; ScreenCaptureKit; Capturing screen content on iOS (iOS 27, beta)
- Apple — `SCContentSharingPicker`, `SCContentSharingPickerMode`, `presentForCurrentApplication()`

Tooling and ecosystem:
- GDRETools/gdsdecomp (v2.6.0, 2026-07-16); hhyyrylainen/GodotPckTool; arkive-games/gdex
- Godot Engine — 4.5 release notes (AccessKit, "experimental"); Godot Forum threads on Android TalkBack (2025-09, 2025-12, 2026-01)
- Google — ML Kit Text Recognition v2 (Android guide, 16×16 px/char guidance)
- On-device OCR benchmark (Vision / ML Kit / PaddleOCR / tesseract.js field-level F1)
- Academic study of OCR engines on game screens (Tesseract/EasyOCR/PaddleOCR)
- Shorebird — Flutter vs React Native in 2026; high-performance native bridges comparison
- Flutter docs — Concurrency and isolates; `flutter_background_service`
- `flutter_overlay_window`, `flutter_screen_overlay`, `react-native-android-floating-bubble`, `expo-draw-over-apps`
- pnpm + Turborepo monorepo guidance; Expo monorepo Metro configuration and `nodeLinker: hoisted`

Game and precedent:
- berrymint — Batomon Showdown (itch.io demo metadata, Steam, Google Play, batomon.com FAQ)
- Google Play / APKMirror listings for Calcy IV; r/CalcyIV (Android 14 single-app capture report)
- Reporting on Poke Genie / Calcy IV ToS compliance
