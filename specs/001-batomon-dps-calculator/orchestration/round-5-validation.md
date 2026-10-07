# Round 5 validation

Ledger: `specs/001-batomon-dps-calculator/orchestration/round-5-items.md`

## Validation pass 1

**FAIL — 10 COVERED, 8 PARTIAL (WI-001, 003, 006, 007, 012, 013, 017, 018), 0 MISSING**, plus 7
overreach/vagueness findings.

The confidence gates were handled correctly and are NOT gaps: T247 declines the `T` vs `T+0.1`
change, T248 declines the propagation delay, T249 declines the `STABLE_SLOT_ORDER` flip, and
`grid.ts:14-21` is untouched.

### Orchestrator verification — every load-bearing claim checked against source

All findings **accepted**; none rejected. Four were errors in my own plan:

1. **"Four of six mons are inert" is wrong — it is three.** Verified: Noxnimbus resolves at every
   level via a round-11 `buffOnCast` tag. The handoff's board table predates that tagging. T258 is
   required to report the coverage delta honestly, so an off-by-one here matters.
2. **The charts are not on 0.5s increments.** Verified: `cumulativeSeries` samples irregular event
   timestamps; `dpsRateSeries` uses 1-second buckets with a comment defending the choice. Labelling
   them "0.5s" would have stated something the data contradicts.
3. **My own `triggerOnAllyCast` violates Finding 7b.** Verified: it sets the listener's `nextAt` to
   `tSeconds + STEP` and firing then resets its cooldown. 7b is a bug report against existing code,
   not merely a constraint on the new tag kind.
4. **Two published figures did not reproduce.** Verified: the shiny-text figure is **343 of 508**,
   not "315 of 470", and the trigger table's `(none)` bucket is **53**, not 36. Root cause: both
   were computed from an uncommitted `/tmp` extract that kept RSC `$17:props:…` reference strings
   as though they were ability text.

### Remediation applied

- Committed `scripts/extract-batodex.mjs` and `scripts/audit-batodex.mjs`, plus the snapshot
  fixtures, so every batodex-derived figure is regenerable. This is the root cause of findings 4
  and of `vendor-sprites.mjs` already referencing an extractor that did not exist.
- Corrected research.md N1 and N2 in place, marked as corrections rather than silently edited.
- Added N6 (three inert mons, the double-application hazard, the 7b bug), N7 (the charge
  calibration answer WI-006 asked for), N8 (open items carried forward), N9 (the false 0.5s premise).
- T242: the Miasmaw=1080 pin is **withdrawn** as unbuildable — it needs four unmodelled run
  modifiers, and two terms of the handoff's own decomposition do not reproduce from our corpus.
  Phase ordering is pinned on synthetic values instead.
- T252b added for the "use those in calculations" half of WI-012, which T252 had narrowed to
  display. T256's prop contract restated as a LIST of series. T257 must resample before labelling.
- FR-105 and FR-106 added.

## Validation pass 2

**FAIL — 17 COVERED, 1 PARTIAL (WI-011), 0 MISSING**, 4 numeric-integrity findings. All verified
against source and all accepted:

1. `data-model.md` still carried the retracted "315 of 470" shiny figure.
2. "20 stat records worse" re-derived as **28 across 7 species** — my count checked damage,
   multicast, heal and cooldown but **not status amounts**, missing Aristobat, Lignite,
   Steamscuttle and Blazewing.
3. T258 said "four newly-tagged mons" where T246 says three.
4. WI-011's named source contains **none** of the three records it was supposed to fill:
   `bambudo|1`, `emperooze|1`, `sunsage|1` are absent from the snapshot by id and by name.

Remediated by correcting all three figures, committing `scripts/audit-shiny.mjs` so the shiny stat
figures are regenerable (research.md had claimed "every figure in this section is regenerable" when
these were regenerable by nothing), designing `ShinyStatLine.abilityTags` for T252b, and rewriting
N3/T251 to report the three records as unavailable rather than fillable.

## Validation pass 3

**FAIL — 15 COVERED, 3 PARTIAL (WI-014, WI-015, WI-016), 0 MISSING. NO OVERREACH.**

All three confidence gates verified honored in code, not merely asserted: `STABLE_SLOT_ORDER`
unchanged at `grid.ts:14-21`, no propagation delay anywhere in `simulate.ts`, and the `T + 0.1`
deferral intact at `simulate.ts:378-380`. Every regenerable figure reproduced except one.

Gaps, all accepted and remediated:

- `data-model.md:912` still said "20 stat records are worse" — the same defect class as pass 2's,
  one line below the block that pass-2 remediation had corrected.
- WI-015/WI-016 were the only data items this round with no measured shortfall and no designed
  storage field. Added `ShinyStatLine.spriteFile`, `TrainerRecord.spriteFile`, a `"trainer"` case
  for `Sprite`, and the ceilings: shiny sprites exist for **139 of 144**, against 149 species.
- **Trainer id-matching is worse than the audit reported**: it said 3 of 23 diverge; re-derivation
  gives **12 of 23**. All resolve by name (research.md N11).
- Stale Phase 17 header (N1-N5 → N1-N9, FR-104 → FR-106), FR-105/FR-106 cited by no task, T250's
  "remove string-parsing matches" having no referent, and a missing `plan.md` entry — all fixed.
- Recorded but out of scope: `creatures.ts` cites `batodexExtracted` for two species absent from
  the snapshot (research.md N10), a false citation that misled two passes.

**Three passes used; stopping before implementation per the skill.**
