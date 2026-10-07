# Round 2 validation

## Validation pass 1 (2026-10-06)

**Verdict: FAIL** — 6 COVERED, 3 PARTIAL (WI-001, WI-004, WI-009), 0 MISSING, plus overreach.

### Findings confirmed and remediated

| Finding | Status |
|---|---|
| **Cobrex fires at t=9, not t=4** | **Confirmed, and my error twice over.** 9 allied applications land strictly before t=15 (t = 3,3,6,6,8,9,9,12,12); the draft counted the two at t=15 to get 11, then computed `15 − 11 = 4`, crediting charges that have not happened by the proposed fire time. Solving `t + charges(t) ≥ 15` gives t=9. T199 is test-first, so this would have been written into the suite as the acceptance criterion. |
| **T202 permitted a no-op round** | **Confirmed.** `perCreatureEffectiveStats` is built in Phase A and read by nothing downstream; Phase B recomputes damage from `creature.baseDamage` (`simulate.ts:388`) and status from `creature.appliesStatus` (`:413-427`). The task now names both call sites. |
| **WI-001 diagnosis disproved** | **Confirmed.** The container is `flexWrap: "wrap"` so a rigid sibling wraps rather than squeezing; `Sprite` has fixed dimensions with `flexShrink: 0` and no `max-width`, so it clips rather than scales. Real cause: round 8's T183 deleted the per-slot `<select>` that gave `.grid` its intrinsic width. The prescribed flex fix would have changed nothing. |
| **Shield inflates a naive headline** | **Confirmed.** `perStatusPerSecond.Shield` is Shield *granted*, never damage, and never enters `facilitatedDamage`. T204 now forbids summing the status record. |
| **T200 under-specified; 3 of 4 families are time-dependent** | **Confirmed.** ⚠️ This remediation **silently failed to apply in pass 1** (a bad string anchor, no-opped without erroring) and was only actually written after pass 2 caught it. See the pass 2 section. |
| **T201's honesty statement falsified itself** | **Confirmed.** ⚠️ Also failed to apply in pass 1; landed after pass 2. |
| **T198 referenced but never existed** | **Confirmed.** Traceability rerouted to T204/T205. |
| **T203 will invert an existing assertion** | **Confirmed.** `optimize.test.ts` pins `actionable).toEqual(["Formiqueen"])`. Re-derivation now mandated. |
| **plan.md had no round-9 amendment** | **Confirmed.** Added. |
| **"Scenarios 32-38 are unwritten"** | **INCORRECT — the one finding that did not hold.** They exist in `quickstart.md` (7 scenarios, written by round 8's T194b). Recorded so the audit's accuracy is judged on evidence, not deferred to. |

## Validation pass 2 (2026-10-06)

**Verdict: FAIL** — 6 COVERED, 3 PARTIAL (WI-004, WI-008, WI-009), 0 MISSING.

Pass 2 confirmed the *reasoning* corrections from pass 1 all held up against source — the Cobrex
t=9 arithmetic, T202's two Phase B call sites, the WI-001 root cause, and T204's Shield exclusion.
**The failure was follow-through, not analysis**: three of the remediations I reported as applied
had **silently not landed**, because `str.replace()` with a stale anchor no-ops without erroring and
I did not verify the result.

| Finding | Status |
|---|---|
| **T200b was a phantom task** — cited in traceability and plan, with no body | Real. The identical error class pass 1 caught with T198, repeated one step later. Now written, including the event-driven scheduler scope. |
| **The "three ambiguities" existed nowhere** | Real. Now decided in writing in T200: allies' per-application amounts (not accumulated stacks), "ally" excludes self, and **Fumungus is explicitly left unmodelled** because granting it damage needs a modelled target that does not exist. |
| **Superseded t=4 / 11-applications survived in 4 places**, including **T207**, which writes the acceptance scenarios | Real and the most dangerous: it would have pinned the wrong number into validation, the same failure mode pass 1 caught in T199. All corrected; the three remaining mentions are retrospective ("not t=4") and intentional. |
| **T201's honesty figure half-fixed** | Real — the fix landed in plan.md but not in the task that ships it. Now states 6 → 10 and requires computing it. |
| **NEW: the t=9 derivation has an unstated tie-break** | Legitimate and a genuine catch. At t=9 progress is 14 *before* that timestamp's two applications and 16 *after*, so t=9 vs t=10 depends on intra-timestamp ordering. Round 6 already set the precedent (pre-timestamp snapshot, FR-040), which implies **t=10**. T200b now requires the rule be stated and pinned consistently across T199 and T207. |
| **NEW: T197 had nothing to verify against** | Real. Now specifies `width: 30rem` (the existing cap becoming the actual width), removal of the orphaned `.slot select` rule, and a component assertion on the 64px sprite. |

### Lesson recorded

Blind `str.replace()` across design artifacts is unsafe: a stale anchor fails silently and the
remediation log then *overstates* what was fixed, which is worse than an open finding because the
next pass has no reason to re-check it. Every edit in this remediation was applied through a helper
that reports whether the anchor matched, and the pass-1 report above has been corrected in place.
