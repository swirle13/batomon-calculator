# Engine handoff: resolution-order and stat-model findings from a recorded battle

Source recording: `3fcb5165-2e5e-4712-8ce2-771461ec77c1.mp4` — 13.31 s, 2316x1080, 111.488 fps
(one frame = 8.97 ms). Captured 2026-10-06. Team: Toxic comp with Link Cable.

This document is the handoff brief for an agent working on `src/engine/`. It is written to be
actionable without watching the video: every claim below is stated with the on-screen numbers
that prove it, the frame timestamps where it was read, and the specific file and line in the
engine that currently disagrees.

**Read M0 and the "How to re-derive any claim" section first.** Everything else is organised as
numbered findings, each tagged with a confidence level, because about a quarter of this cannot be
proven from this recording and must not be implemented as though it can.

---

## M0. The board, confirmed

Battle starts at video t ≈ 1.99 s. Team HP 68000, enemy 63000. Six mons, all Toxic-typed:

| Slot | Row / Col | Species | Lv | Base CD | Base effect | Engine `abilityTags`? |
|---|---|---|---|---|---|---|
| (0,0) | back, left | Thorntail | 3 | 6 s | 50 Direct dmg, Poison 1; `When allies inflict Poison, this gains +24 Damage permanently.` | **none — inert** |
| (0,1) | back, centre | Puffloon | 2 | 10 s | Heal 10, Poison 1, multicast 2; `Trigger this when adjacent Toxic allies trigger.` | **none — inert** |
| (0,2) | back, right | Noxnimbus | 2 | 4 s | Poison 1; `Adjacent Toxic allies gain +6 Poison for this battle.` | **none — inert** |
| (1,0) | front, left | Fumungus | 2 | 3 s | Poison 6; `Has additional Damage equal to 200% of the Poison stacks on the enemy.` | **none — inert** |
| (1,1) | front, centre | Miasmaw | 1 | 3 s | Poison 10; `Gain Poison for this battle equal to 1x the total Poison of your allies.` | `battleStartStatusFromAllies` |
| (1,2) | front, right | Cobrex | 2 | 15 s | Poison 600; `Whenever an ally inflicts Poison, Charge this by 1 second(s).` | `chargeOnAllyStatus` |

**Four of six mons are completely inert in the current engine**, and the two that aren't are the
two that depend on the other four. That framing matters more than any individual bug below: for
this team the engine is not slightly wrong, it is modelling a different team.

Run modifiers in play, inferred from their effects (the battle UI shows only a trinket *count* —
10 mine, 4 theirs — never the individual trinkets):

- **Link Cable** — all allies count as adjacent. Drives both Puffloon's reaction scope and
  Noxnimbus's buff scope.
- **A flat +4 Poison on every mon** — every mon's pre-battle Poison badge is its listed value + 4.
- **A +70% stat effect on mons with cooldown >= 5 s** — hits Puffloon (10 s) and Cobrex (15 s) only.
- **A leftmost-column battle-start effect** — `-COOLDOWN` popups over Thorntail and Fumungus at
  t=1.9948.

---

## How to re-derive any claim

Three on-screen signals act as free instrumentation. Each finding below cites which one it came from.

1. **Fumungus's red damage badge = 2 x (Poison stacks on its target).** Fumungus Lv2 has no base
   damage, so its badge is a live readout of enemy Poison stacks. Every delta observed over the
   whole battle matched a known ally Poison value exactly, which is what validates the reading.
2. **Thorntail's red damage badge is an ally-infliction event counter.** It moves in exact +24
   steps. 7082 -> 7994 across the measured window = 38 inflictions.
3. **Each mon's cooldown bar** is a 4 px-wide, 71 px-tall track that fills bottom-up, normalised so
   71 px = that mon's full cooldown regardless of its length. Scanned numerically for every frame,
   this yields cast times (resets), cooldown periods (reset-to-reset), and Cobrex's charge grants
   (mid-fill jumps) directly.

The reusable extraction pipeline is the `battle-capture-analysis` skill in
`.cursor/skills/battle-capture-analysis/`. To reproduce the dataset behind this document:

```bash
.cursor/skills/battle-capture-analysis/scripts/analyze.sh /path/to/recording.mp4 /tmp/out
```

That writes `/tmp/out/frames.csv` (one row per frame, every badge and bar) and
`/tmp/out/events.csv` (derived cast / charge / stat-change / status-delta events). Every number
quoted in this document can be grepped out of those two files.

---

## A critical caveat that constrains every timing claim

**The recording was made with FAST FORWARD engaged.** Video time is compressed by roughly 2.6x
relative to battle time. Every ratio and every ordering claim below survives this unharmed, but
**no absolute second-count from this footage is usable**. Where a battle-time figure is given it is
derived from a ratio against a known base cooldown, never read off the clock.

A second, independent limit: **no two of my mons ever became ready on the same frame.** The
tightest gap anywhere in the battle was 2 frames (17.9 ms video, ~47 ms battle). So this capture
**cannot prove a tie-break rule by exhibiting a tie.** What it does instead, and what makes it
worth acting on, is pin down *which values each effect reads* — which is where the engine's errors
actually are.

---

## Finding 1 — Battle start runs in three ordered phases, and pass 2 reads the wrong snapshot

**Confidence: high. Proven by arithmetic.**

At t=1.95 (pre-start) Cobrex's Poison badge reads **604** and Miasmaw's reads **14**.
By t=2.04 Cobrex reads **1027** and Miasmaw reads **1080**.

- 604 x 1.7 = 1026.8 -> **1027**. The +70% multiplier has already been applied.
- Miasmaw's 1080 = its own 14 + 1066, where
  1066 = Thorntail 5 + Puffloon 19 + Noxnimbus 5 + Fumungus 10 + Cobrex **1027**.

Miasmaw summed the **post-multiplier** Cobrex. Had it summed base values it would have landed on
14 + 643 = **657**, and had it summed post-multiplier-but-pre-trinket values it would have landed
somewhere else again. 1080 is only reachable one way.

So battle start has three phases, in this order:

1. **Percentage / multiplier stat scaling.**
2. **Position-based battle-start effects** (the `-COOLDOWN` popups over the leftmost column appear
   at t=1.9948, before Miasmaw's badge changes at t=2.0396).
3. **Dynamic battle-start abilities that read team state** (Miasmaw's copy), over a fully buffed board.

### What the engine does instead

`src/engine/effects.ts` lines 149-151 state the opposite as a deliberate design decision:

> every battle-start effect that reads *other* creatures' values must read their BASE values, or
> the result would depend on which creature happened to resolve first

Pass 2 (lines 165-184) then sums `other.appliesStatus` off the **pass-1 base snapshot**. Pass 2b
(lines 186-305) accumulates its deltas against that same base snapshot and applies them only
afterwards, for the same stated reason.

The instinct behind that comment is sound — order-dependence *is* a hazard — but the game solves
it by **phase ordering**, not by reading base values. The fix is not to make pass 2 read pass-2b's
output (that just moves the hazard); it is to split resolution into explicit phases where each
phase reads the completed output of the previous one, and to classify every tag by which phase it
belongs to. Writers before readers.

**Impact for this team: Miasmaw's Poison is 1080 in-game vs. 657 modelled, a 39% understatement on
the single largest Poison application on the board**, which then propagates into Fumungus's
damage term (Finding 5) and Cobrex's charge rate (Finding 6).

---

## Finding 2 — Percentage multipliers are re-evaluated on every change, not baked in once

**Confidence: high. Proven by arithmetic, two independent mons.**

When Noxnimbus casts, it grants +6 Poison to all allies (Link Cable). The badges move:

| Mon | Before | After | Delta |
|---|---|---|---|
| Thorntail | 5 | 11 | +6 |
| Fumungus | 10 | 16 | +6 |
| Miasmaw | 1080 | 1086 | +6 |
| Noxnimbus | 5 | 5 | **+0 — excludes self** |
| Puffloon | 19 | 29 | **+10** |
| Cobrex | 1027 | 1037 | **+10** |

Puffloon and Cobrex are exactly the two mons carrying the +70% effect, and they gained 10 rather
than 6. Only one model produces those numbers:

- Cobrex: `(604 + 6) x 1.7 = 1037.0` -> **1037**
- Puffloon: `(11 + 6) x 1.7 = 28.9` -> **29**

Compare the alternatives, both of which are wrong:
- Snapshot-then-add: `1027 + 6 = 1033` and `19 + 6 = 25`.
- Snapshot-then-add-scaled: `1027 + 10 = 1037` happens to match for Cobrex, but gives `19 + 10 = 29`
  for Puffloon only by coincidence of rounding; it diverges on the second Noxnimbus cast
  (observed Cobrex 1047, this model gives 1047 — but observed Thorntail 17 vs. modelled 17, and
  the models separate once any non-integer multiplier compounds).

The compounding is visible across the battle: Thorntail 5 -> 11 -> 17, Fumungus 10 -> 16 -> 22,
Cobrex 1027 -> 1037 -> 1047.

### What the engine does instead

There is **no multiplier concept in the resolver at all.** `applyEffect` (effects.ts:213-228)
handles only flat `effect.statChange.amount`, and `ResolvedPlacement` carries plain numbers with
no record of which part is base, which is flat-additive, and which is multiplicative.

### Required change

`ResolvedPlacement` must stop being a bag of final numbers and become a small evaluable structure:

```ts
// per stat, per status type
{ base: number, flatAdd: number, multiplier: number }   // value = (base + flatAdd) * multiplier
```

with a single `read()` helper used everywhere. Multipliers must apply to the running
`base + flatAdd` total at read time. A `statMultiplier` effect kind needs adding to the tag
vocabulary (`RESOLVED_TAG_KINDS`, effects.ts:78-88) to express the +70% trinket at all.

This is the load-bearing refactor. Findings 1, 3 and 4 all depend on it existing.

---

## Finding 3 — Reactive flat gains are added *after* multiplicative scaling, and are never scaled

**Confidence: high.**

Thorntail entered the battle at **7082** displayed Damage against a listed base of 50, so it is
carrying very large damage modifiers. Every single increment across the whole fight was
nevertheless exactly **+24** — its listed Lv3 value, unmultiplied.

7082 -> 7130 -> 7178 -> 7202 -> 7226 -> ... -> 7994. Every step is 24, or a multiple of 24 when
several inflictions land inside one badge refresh.

So `+24 Damage permanently` lands in the `flatAdd`-after-multiplier position, not in `base`. An
engine that adds it to base and then multiplies will inflate Thorntail by its whole modifier
factor on every stack — here, by roughly 140x per stack.

In the structure from Finding 2 this needs a fourth slot: `postMultiplierFlatAdd`, read as
`(base + flatAdd) * multiplier + postMultiplierFlatAdd`.

> **Unresolved:** Thorntail's 7082 entry value is not explained by its base stats plus anything
> visible in the footage. It does not affect the +24 finding, but it means we cannot yet reproduce
> this board's damage numbers end-to-end, and somebody should work out where 7082 comes from.

---

## Finding 4 — Recurring on-cast ally buffs are a missing mechanism family

**Confidence: high for the mechanism, medium for exact timing.**

Noxnimbus's `Adjacent Toxic allies gain +6 Poison for this battle` is `abilityTrigger: "On Cast"`
and fires **every time Noxnimbus casts**, compounding for the rest of the battle. With a 4 s base
cooldown over a long fight this is a large and accelerating effect, and it is the input to
Miasmaw, Fumungus and Cobrex all at once.

The engine treats `"On Cast"` as unresolvable by design (effects.ts:245-251 only acts on
`OnBattleStart`, with the comment that OnCast "depend[s] on battle state this engine either
schedules itself"). But `simulate()` *does* schedule casts — that is precisely what the event loop
at simulate.ts:397 does. The information needed is available; the resolver just runs before it and
never runs again.

### Required change

Resolution must become **time-varying**: a mutable resolved state that `simulate()` can mutate
mid-battle when an on-cast or reactive ability fires, rather than a `ResolvedPlacement[]` computed
once up front. Concretely, `resolveEffects` should produce the *initial* state plus a set of
registered handlers keyed by trigger, and the event loop should invoke them.

Also confirmed here: **self-exclusion is real.** Noxnimbus's own badge never moves.
`Adjacent Toxic allies` excludes the caster even under Link Cable, which matches
`selectTargets`'s existing `others` filter (effects.ts:111) — that part is already right.

---

## Finding 5 — Damage scaled off the *target's* status is the team's main damage source, and is unmodelled

**Confidence: high.**

Fumungus Lv2's `additional Damage equal to 200% of the Poison stacks on the enemy` is recomputed
live, per cast, from the current stack count. Its badge is literally `2 x stacks` and tracks every
stack change within ~2 frames.

This is not a rounding-error mechanism. Fumungus's badge reaches **14K+ by t≈6.3** — against
Thorntail's 7994, it is the largest single damage term on the board, and it grows superlinearly
because Poison stacks only ever accumulate.

The engine has no vocabulary for it. `statFromStat` (effects.ts:269-281) reads from a
`sourceSelector` over **allies** only; there is no selector for "the enemy target", and no concept
of the target's accumulated status at cast time. `Fumungus.baseDamage` is `null` and stays `null`.

### Required change

A new tag kind — call it `statFromTargetStatus` — plus the `read()`-time evaluation to go with it,
since the value changes every cast. Note this interacts with Finding 3: a dynamic damage term is
neither `base` nor a flat add; it is recomputed per cast and must not persist.

Related confirmation of something the engine already gets right: a floating `1166` damage number
appears at t=4.28, equal to the stack count at that tick. **Poison tick damage = current stacks**,
matching `POISON_TICK_SECONDS = 1` and `applyStatusTick`.

---

## Finding 6 — Cobrex's charge, calibrated exactly

**Confidence: high. Independently cross-checked.**

Cobrex's cooldown bar jumps in discrete steps that are not part of its fill rate:

```
t=3.2544  10 -> 16   (+6)     after Fumungus's cast
t=3.3710  17 -> 22   (+5)     after Puffloon hit 1
t=3.4338  23 -> 29   (+6)     after Puffloon hit 2
t=3.4876  29 -> 35   (+6)
t=4.0258  52 -> 58   (+6)
t=4.1603  53 -> 71   (+18)    three grants inside one frame
```

One `Charge this by 1 second(s)` = **6 px**. The bar is 71 px for a full cooldown, so
71 / 6 = **11.83 s** effective cooldown — exactly 15 s x 0.79, the same ~21% cooldown reduction
measured independently for Fumungus from its cast interval. Two unrelated measurements agreeing to
three significant figures is what makes the 6 px calibration trustworthy.

Two behaviours fall out:

- **Charge grants stack additively within a single tick** (+18 = 3 x 6). The engine already does
  this correctly — `appliedThisInstant` accumulates and simulate.ts:520-528 sums per rule.
- **Charge applies to remaining cooldown**, and when it pushes the bar to full the cast fires.
  Cobrex's first cast lands at t≈4.19 after ~13 grants.

### Where the engine's choice is now testable

simulate.ts:373-380 deliberately defers a charge-completed cast to `T + 0.1` rather than firing it
at `T`, and the comment is admirably honest that this is "the arbitrary half of the choice". The
footage shows Cobrex firing on the tick its bar reaches full (full at t=4.1603, reset at t=4.2231,
with the ~60 ms gap matching every other mon's fill-to-reset render lag) — which **favours firing
at `T`, not `T + 0.1`**. This is suggestive rather than conclusive, because 0.1 s battle-time is
~38 ms of video and sits inside the render-lag noise floor. Flagging it as the cheapest thing to
settle with a purpose-built recording.

---

## Finding 7 — Reactive triggers: Puffloon's exact semantics

**Confidence: high for 7a/7b/7c.**

The first cascade, read off Fumungus's badge (enemy Poison stacks in parentheses):

| t | Badge | Stacks | Delta | Attribution |
|---|---|---|---|---|
| 3.294 | 20 | 10 | — | Fumungus's own cast (Poison 10) |
| 3.384 | 58 | 29 | +19 | Puffloon hit 1 |
| 3.473 | 96 | 48 | +19 | Puffloon hit 2 |
| 3.518 | 2256 | 1128 | +1080 | Miasmaw's cast |
| 3.608 | 2294 | 1147 | +19 | Puffloon hit 3 |
| 3.697 | 2332 | 1166 | +19 | Puffloon hit 4 |

Thorntail's counter over the same span: 7082 -> 7226 = +144 = **exactly 6 inflictions**, matching
the six rows above. The window is fully accounted for with nothing left over, which is why this
cascade is the strongest evidence in the capture.

**7a — Puffloon reacts to each ally trigger independently.** Four hits = two reactions of multicast
2. Fumungus triggered it, then Miasmaw triggered it again 233 ms later.

**7b — a reactive trigger does not reset or consume the reactor's own cooldown.** Across this entire
cascade Puffloon's cooldown bar climbs monotonically 13 -> 19 px with no reset, and Puffloon later
casts off its *own* cooldown at t=6.1606 (bar 71 -> 1). Its base 10 s cycle runs independently of,
and in addition to, its reactions.

**7c — multicast is N separate infliction events, not one event of N x magnitude.** Each Puffloon
hit produced its own +19 stacks, its own +24 on Thorntail, and its own charge grant to Cobrex. An
engine modelling multicast as a single scaled event undercounts every downstream reactive trigger
by the multicast factor.

The engine handles 7c correctly already (simulate.ts:428-432 queues real repetitions, and
simulate.ts:477-485's note on why Burn forces separate applications is exactly right). 7a and 7b
have no implementation at all — Puffloon has no tags. A `triggerOnAllyTrigger` tag kind is needed,
and it must not touch the reactor's cooldown.

> **Open, and it matters for Thorntail:** whether a mon's *own* Poison infliction counts toward its
> own `when allies inflict Poison` counter. One densely-packed frame (t=4.2745, a +40 stack delta
> that can only decompose as Thorntail's 11 + a Puffloon 29) implies Thorntail's own infliction
> *does* count, which would contradict the ability text. simulate.ts:521-526 currently excludes
> self for charge rules, which the Cobrex data supports. Do not change the exclusion on the
> strength of one ambiguous frame — settle it with a two-mon recording.

---

## Finding 8 — Tie-break order is reversed relative to every observed pairing

**Confidence: medium. Consistent with all evidence, proven by none of it.**

Three clusters are tight enough to be informative. Order is taken from cooldown-bar resets,
cross-checked against the order the Poison deltas land.

| Cluster | Events | Slots involved |
|---|---|---|
| Cascade 1, t≈3.29-3.53 | Fumungus 3.2993, Miasmaw 3.5325 | (1,0) then (1,1) |
| Cluster A, t≈4.14-4.31 | Fumungus 4.2052, Cobrex 4.2231, Noxnimbus ~4.22 | (1,0), (1,2), (0,2) |
| Cluster B, t≈5.70-5.81 | Miasmaw 5.7928, Cobrex 5.8107 | (1,1) then (1,2) |

Every pairing is consistent with **front row before back row, left-to-right within a row** —
`(1,0), (1,1), (1,2), (0,0), (0,1), (0,2)`.

The engine does the reverse. `STABLE_SLOT_ORDER` in `src/engine/grid.ts:14-21` lists
`back 0,1,2` then `front 0,1,2`, and both tie-break sorts in `simulate.ts` — the `dueCasts` sort at
line 415 and the final `timeline` sort at line 522 — key off `stableSlotIndex`.

**I want to be explicit about the limit here.** Because every gap was 2 frames rather than 0, each
pairing could equally be explained by the later mon simply being ready later. Front-row-first is
the simplest hypothesis that fits all three clusters and contradicts none of them, and it is worth
*testing*, but it should not be committed as a confirmed rule on this evidence. See the experiment
in "What to record next".

---

## Finding 9 — Same-tick consumers read pre-buff values

**Confidence: low. Documented because the observable is firm even though the cause is not.**

In cluster A, Noxnimbus's cooldown bar resets at ~4.04, but its Poison lands at 4.2195, its +6 buff
reaches Fumungus at 4.2207, and reaches Cobrex / Miasmaw / Puffloon only at ~4.38. Meanwhile
**Cobrex casts at 4.2231 applying 1027 — its pre-buff value — even though Noxnimbus had already cast.**

Zoomed badge reads confirm the sequence beyond doubt:
`2332 -> 2332 -> 2352 -> 4406 -> 4406 -> 4416`, i.e. +10 (Fumungus), +1027 (Cobrex, **pre-buff**),
+5 (Noxnimbus).

Two explanations fit and the footage cannot separate them:

1. Buff application genuinely propagates with travel time, so a mon casting in the same window as a
   buffer uses the old value.
2. Noxnimbus's logical cast is later than its bar reset suggests. Its bar readings between 4.05 and
   4.45 are visibly corrupted by overlapping VFX — non-monotonic, and pinned at 0 for 117 ms — so
   the 4.04 reset may be a false positive.

**Do not implement a propagation delay on this evidence.** The actionable part is narrow and
certain: Cobrex used 1027, not 1037. If the engine applies Noxnimbus's buff instantaneously at cast
time and then resolves Cobrex in the same instant, it produces 1037 and diverges. Note that
`simulate()`'s existing FR-040 snapshot rule (simulate.ts:438-443: "every event at this instant
resolves against the state as it stood when the instant began") would *already* produce 1027 if
both landed in one instant — so the engine's current semantics may well be right here for the
right reason. Worth a test that locks the behaviour in either way.

---

## Suggested sequencing

The findings are not independent. A rough dependency order:

1. **Finding 2's stat structure** (`base` / `flatAdd` / `multiplier` / `postMultiplierFlatAdd` with
   a single `read()`). Nothing else can be done properly first.
2. **Finding 1's phase split** in `resolveEffects`, with every tag kind classified by phase.
3. **Finding 3** falls out of 1 once `postMultiplierFlatAdd` exists.
4. **Finding 4's time-varying resolution** — the structural change that unblocks on-cast and
   reactive abilities. Largest piece of work.
5. **Findings 5 and 7a/7b** as new tag kinds on top of 4.
6. **Finding 8** is a one-line change to `STABLE_SLOT_ORDER`, but gate it behind the experiment
   below rather than shipping it on medium confidence.
7. **Findings 6 and 9** are test-locking exercises, not implementation.

A note on honesty in reporting, since this codebase already tracks it carefully (see research.md
L2/L3 on "100% support" and effects.ts:69-77 on what "supported" means): adding tags for
Thorntail, Puffloon, Noxnimbus and Fumungus will move the coverage counter by four, but the
mechanisms behind them — time-varying resolution, target-status scaling, reactive triggers — are
each new families, not instances of existing ones. The counter should not be allowed to imply
otherwise.

---

## What to record next

The gaps in this document are all gaps the *recording* has, not gaps in the analysis. Four
purpose-built captures would close almost all of them:

1. **A genuine tie (Finding 8).** Two mons with provably identical effective cooldowns and no
   leftmost-column effects, recorded **at 1x with fast-forward off**. Read the bar resets. This is
   the single highest-value recording.
2. **Buffer + consumer (Findings 4 and 9).** A two-mon board: Noxnimbus plus one mon whose Poison
   value is large enough to read unambiguously, cooldowns matched. Settles whether same-tick
   consumers see the buff.
3. **Self-infliction (Finding 7's open item).** Thorntail plus exactly one Poison-applying ally,
   so the +24 steps can be attributed one at a time.
4. **Charge-completion timing (Finding 6).** Cobrex plus a single fast Poison applier, at 1x, to
   see whether the charge-completed cast fires on the tick or one step later.

For all four: **turn fast-forward off.** It cost this capture every absolute timing it could have
provided, and it is the one variable that was free to control.
