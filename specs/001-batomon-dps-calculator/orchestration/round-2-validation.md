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
| **T200 under-specified; 3 of 4 families are time-dependent** | **Confirmed.** Only Miasmaw's battle-start grant fits a static pass. Split into T200 (static) + **T200b** (event-driven scheduler). The three ambiguities are now decided in writing. |
| **T201's honesty statement falsified itself** | **Confirmed.** It mandated stating "6 of 149" inside a task that makes it 10 of 149. Now states both and requires computing the figure. |
| **T198 referenced but never existed** | **Confirmed.** Traceability rerouted to T204/T205. |
| **T203 will invert an existing assertion** | **Confirmed.** `optimize.test.ts` pins `actionable).toEqual(["Formiqueen"])`. Re-derivation now mandated. |
| **plan.md had no round-9 amendment** | **Confirmed.** Added. |
| **"Scenarios 32-38 are unwritten"** | **INCORRECT — the one finding that did not hold.** They exist in `quickstart.md` (7 scenarios, written by round 8's T194b). Recorded so the audit's accuracy is judged on evidence, not deferred to. |
