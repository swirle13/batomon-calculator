# Round 5 work items

Source: /speckit-orchestrate invocation, 2026-10-06
Branch: 001-batomon-dps-calculator

> Item 1 of the user's list is "with the content inside
> `specs/001-batomon-dps-calculator/orchestration/engine-handoff-gameplay-capture.md`". That
> document contains nine separately-evidenced findings at differing confidence levels, so it is
> decomposed into WI-001..WI-009 — one per finding — to make each individually checkable. The
> `Ask` for each quotes the handoff verbatim. No finding is added, dropped, or merged.
>
> **The handoff's own confidence gates are part of the ask and are recorded with each item.** It
> states plainly that about a quarter of its content "cannot be proven from this recording and must
> not be implemented as though it can."

## WI-001
- **Ask** (verbatim, handoff Finding 1): "Battle start runs in three ordered phases, and pass 2 reads the wrong snapshot" — "battle start has three phases, in this order: 1. Percentage / multiplier stat scaling. 2. Position-based battle-start effects… 3. Dynamic battle-start abilities that read team state… over a fully buffed board."
- **Type**: bug fix (engine)
- **Confidence (handoff)**: high — "Proven by arithmetic."
- **Done means**: `resolveEffects` resolves in explicit ordered phases where each reads the completed output of the previous; Miasmaw on the captured board resolves to Poison **1080**, not 657.

## WI-002
- **Ask** (verbatim, handoff Finding 2): "Percentage multipliers are re-evaluated on every change, not baked in once" — `ResolvedPlacement` must become "{ base: number, flatAdd: number, multiplier: number } // value = (base + flatAdd) * multiplier" with "a single `read()` helper used everywhere", plus "A `statMultiplier` effect kind needs adding to the tag vocabulary".
- **Type**: refactor (engine)
- **Confidence (handoff)**: high — "two independent mons". Called "the load-bearing refactor. Findings 1, 3 and 4 all depend on it existing."
- **Done means**: stats are an evaluable structure, not final numbers; `(604 + 6) × 1.7 = 1037` and `(11 + 6) × 1.7 = 29` both reproduce.

## WI-003
- **Ask** (verbatim, handoff Finding 3): "Reactive flat gains are added *after* multiplicative scaling, and are never scaled" — "this needs a fourth slot: `postMultiplierFlatAdd`, read as `(base + flatAdd) * multiplier + postMultiplierFlatAdd`."
- **Type**: bug fix (engine)
- **Confidence (handoff)**: high
- **Done means**: Thorntail's `+24 Damage permanently` adds exactly 24 per infliction regardless of its multipliers.
- **Open item carried from the handoff**: "Thorntail's 7082 entry value is not explained by its base stats plus anything visible in the footage… somebody should work out where 7082 comes from."

## WI-004
- **Ask** (verbatim, handoff Finding 4): "Recurring on-cast ally buffs are a missing mechanism family" — "Resolution must become **time-varying**: a mutable resolved state that `simulate()` can mutate mid-battle… `resolveEffects` should produce the *initial* state plus a set of registered handlers keyed by trigger, and the event loop should invoke them."
- **Type**: behavior change (engine)
- **Confidence (handoff)**: "high for the mechanism, medium for exact timing". "Largest piece of work."
- **Done means**: on-cast ally buffs fire on every cast and compound; self-exclusion preserved.

## WI-005
- **Ask** (verbatim, handoff Finding 5): "Damage scaled off the *target's* status is the team's main damage source, and is unmodelled" — "A new tag kind — call it `statFromTargetStatus` — plus the `read()`-time evaluation to go with it, since the value changes every cast."
- **Type**: behavior change (engine)
- **Confidence (handoff)**: high
- **Done means**: Fumungus's damage equals 200% of the enemy's current Poison stacks, recomputed per cast and not persisted.

## WI-006
- **Ask** (verbatim, handoff Finding 6): "Cobrex's charge, calibrated exactly" — "One `Charge this by 1 second(s)` = **6 px**… 71 / 6 = **11.83 s** effective cooldown". And: the footage "**favours firing at `T`, not `T + 0.1`**".
- **Type**: question to answer + test-locking
- **Confidence (handoff)**: high for the calibration; the T vs T+0.1 point is "suggestive rather than conclusive".
- **Done means**: charge stacking is test-locked. The handoff classifies Findings 6 and 9 as "test-locking exercises, not implementation", so the T vs T+0.1 change is NOT to be shipped on this evidence.

## WI-007
- **Ask** (verbatim, handoff Finding 7): "Reactive triggers: Puffloon's exact semantics" — "7a — Puffloon reacts to each ally trigger independently." "7b — a reactive trigger does not reset or consume the reactor's own cooldown." "7c — multicast is N separate infliction events". "A `triggerOnAllyTrigger` tag kind is needed, and it must not touch the reactor's cooldown."
- **Type**: behavior change (engine)
- **Confidence (handoff)**: "high for 7a/7b/7c"; 7c already correct in the engine.
- **Done means**: `triggerOnAllyTrigger` exists, fires per ally trigger, and leaves the reactor's own cooldown untouched.
- **Open item carried from the handoff**: whether a mon's own infliction counts toward its own "when allies inflict" counter — "Do not change the exclusion on the strength of one ambiguous frame."

## WI-008
- **Ask** (verbatim, handoff Finding 8): "Tie-break order is reversed relative to every observed pairing" — "Every pairing is consistent with **front row before back row, left-to-right within a row**".
- **Type**: question to answer (explicitly gated)
- **Confidence (handoff)**: **medium** — "Consistent with all evidence, proven by none of it." The handoff says: "it should not be committed as a confirmed rule on this evidence" and "gate it behind the experiment below rather than shipping it on medium confidence."
- **Done means**: the finding and its gate are recorded; `STABLE_SLOT_ORDER` is **NOT** changed this round.

## WI-009
- **Ask** (verbatim, handoff Finding 9): "Same-tick consumers read pre-buff values" — "**Do not implement a propagation delay on this evidence.** The actionable part is narrow and certain: Cobrex used 1027, not 1037… Worth a test that locks the behaviour in either way."
- **Type**: test-locking (explicitly gated)
- **Confidence (handoff)**: **low**
- **Done means**: a test locks same-instant snapshot behaviour; no propagation delay is implemented.

## WI-010
- **Ask** (verbatim): "please update ability triggers to be Enums so we're not relying on string parsing."
- **Type**: refactor
- **Done means**: `abilityTrigger` is a closed union/enum rather than a free string, and no code matches it by string parsing.

## WI-011
- **Ask** (verbatim): "please add all missing ability text values, I've noticed a few are missing."
- **Type**: data correction
- **Done means**: creatures with absent or placeholder ability text have real text, or are reported as unavailable with a count.

## WI-012
- **Ask** (verbatim): "we need to add all shiny ability text to all mons and use those in calculations."
- **Type**: data correction + behavior change
- **Done means**: shiny ability text is stored per species and used when the placement is shiny.

## WI-013
- **Ask** (verbatim): "This should integrate with the shiny selector toggle from the cardFixedBrowser."
- **Type**: behavior change (UI)
- **Done means**: the existing shiny toggle drives the shiny ability text and its calculations.

## WI-014
- **Ask** (verbatim): "All shiny mons get better stats/abilities than their normal counterpart."
- **Type**: data correction
- **Done means**: the claim is checked against the data and either upheld or the discrepancy reported.
- **CONFLICT ON RECORD**: round-11 measurement over all 536 shiny level-records found **7 stat records at ratio 0.8 — shiny strictly WORSE** (`src/data/shiny.ts` header; `shiny.test.ts` has a guard asserting at least one downgrade exists). This item as stated contradicts committed, tested data. It must be re-measured and resolved, not assumed either way.

## WI-015
- **Ask** (verbatim): "We need to grab all shiny sprites from batodex.com/monsters"
- **Type**: data correction
- **Done means**: shiny sprites are vendored locally and rendered for shiny placements.

## WI-016
- **Ask** (verbatim): "we need to grab all trainers sprites from batodex.com/trainers and use these in the trainer card from the previous round (that should've been created)"
- **Type**: data correction + behavior change (UI)
- **Done means**: trainer sprites are vendored and rendered in the trainer card.
- **Note**: the trainer card WAS created in round 4 (`src/ui/shared/TrainerCard/TrainerCard.tsx`); the user's parenthetical doubt should be confirmed rather than ignored.

## WI-017
- **Ask** (verbatim): "Both graphs should indicate that the increments are on 0.5s increments and remove the timing info from each's hover card"
- **Type**: behavior change (UI)
- **Done means**: both charts state the 0.5s increment, and the per-point timing is removed from the tooltip.

## WI-018
- **Ask** (verbatim): "Both graphs should use the same graph module and have data provided to it in the form of arguments and values for aspects such name, list of values, color of line, x axis scale, x axis max amount, y axis scale, y axis max amount, and any more, as I notice the UI/UX for them is inconsistent, especially the hover tooltip representing different values. Another DRY UI component violation."
- **Type**: refactor (UI)
- **Done means**: one shared chart component parameterised by name, values, line colour, and both axes' scale and max; both charts use it; tooltips are consistent.
