# Round 6 validation

Ledger: `round-6-items.md` (WI-001..WI-003). Auditor: read-only `generalPurpose` subagent, one fresh
launch per pass.

## Validation pass 1

### Verdict table

| Item | Verdict | Evidence (task IDs / file:line) |
| --- | --- | --- |
| WI-001 | **COVERED** | T259 (tasks.md:2394) rebuilds `AffectedCreaturePicker` on `Modal`/`FilterBar`/`TextField`/`ResultCount`/`PickerSection`+`OVERLAY_COLUMNS`/`PickerCard`/`SpriteTile`/`EmptyNote` — the exact set the trinket picker composes from (TrinketPicker.tsx:6-19, 231, 247-253) and the set the ask's done-means names (round-6-items.md:19). T260 (tasks.md:2401) deletes `.pickerList`, `.pickerItem`, `.pickerItemOn`, `.pickerName`, `.pickerMeta`, `.pickerEmpty`, `.pickerSearch`, exactly the bespoke set present today (TrainerCard.module.css:93, 102-112) with no leftover. Round-4 behaviours pinned by T264 (tasks.md:2423): FR-088 opposite-region (e), FR-090 persistence (f), select/deselect (c)(d). Scenario 45 (quickstart.md:798-807) walks it. |
| WI-002 | **COVERED** | 3-column browse grid from T259; the cap made structural rather than a counter by T261 (tasks.md:2406-2411) — nine slots including empty placeholders, heading `N/9`, mirroring the Modifiers overlay's empty-cell pattern (ModifierEditor.tsx:183-195). The "must be decided explicitly and recorded" clause is answered, not deferred: enforce for both, refusal with a reason (plan.md:504-508; T262; data-model.md:1063-1067). The "checked against the corpus/sources rather than assumed" clause is answered by research.md Q1, verified against `src/data/trainers.ts` (Painter's "Nine random species" at trainers.ts:200-202; Smuggler's text with no count at trainers.ts:264, `unconfirmedFields: ["abilityText"]` at trainers.ts:268). T263 records the split provenance; T264 (b)(c)(d) tests it; scenario 46. |
| WI-003 | **COVERED** | T266 (tasks.md:2440-2445) puts `StatLines` in two balanced columns, first column filling first, in the ask's order, and bars a third. T265 requires browser measurement. T267 checks FR-043 (spec.md:281-283) for both fixed-height variants and for the "Effective this battle" band, which is real — that band calls the same `StatLines` (PlacedCreatureDetails.tsx:122-125; BatomonCard.tsx:113-126). T268 is the structural test; scenarios 47-48. The ask's example is reachable exactly as written: Shelldra publishes damage 15 / heal 15 / multicast 3, and `applyModifiers` appends created statuses in Burn->Poison->Shock->Shield order (modifiers.ts:63-77). |

### Gaps

None — no item PARTIAL or MISSING.

### Overreach / vagueness

1. **research.md's census is wrong in two rows, and it is the artifact the round calls "measured".**
   research.md reported 1 line = 348 records and 2 lines = 206. Recomputed exactly as `buildStatLines`
   does over all 596 records: **0 = 16, 1 = 373, 2 = 181, 3 = 26**. The load-bearing conclusions
   survive (no published record reaches 4 lines; 7 is the true ceiling), but T265 extends this table,
   so the error would propagate.
2. **T267's 7-line check is unreachable for the `browser` variant.** `CorpusBrowser` renders
   `BatomonCard` with no `modifiers` prop (CorpusBrowser.tsx:83), so without modifiers that variant
   tops out at 3 lines in the running app.
3. **T266's switch threshold is never defined and T265 does not say how to derive it.** T265 also asks
   for "the reserved heights of both fixed-height variants", which means two different things: the
   panel reserves a whole-card 29rem (BatomonCard.module.css:37) with its `.output` reservation
   commented out (line 40), while the browser reserves `.output { min-height: 4.5rem }` (line 53).
4. **T260 keeps the rarity-shape row and calls it "unaffected", but that row is already broken.**
   `PAINTER_RARITY_SHAPE` is keyed `"Super Rare"` (AffectedCreaturePicker.tsx:27-33) while the corpus
   and `RARITIES_DESC` use `"SuperRare"` (statColors.ts:41-50), so the filter at
   AffectedCreaturePicker.tsx:100 drops the Super Rare chip and the guidance row sums to **7 of 9** —
   visible in the ledger's own screenshot, which lists only four chips.

### Summary

COVERED 3 / PARTIAL 0 / MISSING 0 — **FAIL** (non-empty overreach section).

### Remediation applied by the orchestrator

- **(1)** Census corrected in research.md Q2 to 16 / 373 / 181 / 26, recomputed by running the real
  `buildStatLines(perCastOutputOf(creature))` over `corpus.creatures` via `vite-node` rather than by
  regex over the source text, which is what produced the wrong figures. The 7-line ceiling is now
  recorded as the exact rendered strings from that run rather than as arithmetic.
- **(2)** T267 restated: the `browser` variant is checked at its real in-app maximum of 3 lines, and
  the 7-line case is verified on the `panel` variant and in T268's render test.
- **(3)** Threshold decided in plan.md and named in T265/T266: **two columns at 4 or more lines**,
  because 3 is the published maximum (research.md Q2) and 4 is therefore the first count that only
  modifiers can produce. T265 now names which reservation it is measuring and that the panel's
  `.output` reservation is currently commented out.
- **(4)** New task T270 fixes the `"Super Rare"` vs `"SuperRare"` key mismatch. Recorded as a
  **validation finding, not a ledger item** — the user did not ask for it; it was found in the file
  WI-001 rebuilds, and carrying it across silently is what the remediation avoids. T259 now also states
  what becomes of `.pickerIntro`, `.pickerWarn` and the shape row.

## Validation pass 2

All three items **COVERED** again, and the census was independently re-derived and confirmed
(16 / 373 / 181 / 26 over 596 records; the 7-line ceiling holds structurally). All four pass-1
remediations verified LANDED. Verdict **FAIL** on five new overreach/vagueness findings:

1. **The 7-line example did not follow from its stated inputs.** research.md said "Shelldra Lv1 with
   four status modifiers" and recorded `Deal 20 damage`; Shelldra Lv1 publishes 15, and the 20 came from
   an unmentioned fifth modifier (`damageFlatAdd: 5`) in the orchestrator's scratch script. The 7-line
   count was right; the setup and the damage figure were not.
2. **T266's central instruction was a verb-less fragment** — it named two files and a CSS property but
   never said what to add.
3. **T261's `N/9` heading is not expressible through `PickerSection`**, whose `count: number` renders
   `({count})`. No task extended the primitive or said to bypass it.
4. **Nothing acted on T265's measurement.** No task could change a height reservation if the measured
   two-column band did not fit — and the panel variant's `.output` reservation is commented out.
5. **Hygiene**: the scratch `.census.ts` was left untracked in the repo root, where T269's `tsc` and
   lint would pick it up.

### Remediation applied by the orchestrator

- **(1)** Re-ran the real code path with exactly the modifiers named and recorded both strings:
  `Deal 15 damage | Burn 2 | Poison 3 | Shock 3 | Shield 4 | Heal 15 | Multicast ×3` (7 lines) and the
  ask's 6-line example. The withdrawn `Deal 20 damage` is noted rather than quietly replaced.
- **(2)** T266 restated with the action and both locations.
- **(3)** T261 now names the blocker and widens `PickerSection`'s `count` to `number | string`, rather
  than adding a parallel heading component.
- **(4)** T265 now requires acting on the measurement: raise the reservation (including un-commenting
  `.cardFixedPanel`'s `.output`) if a two-column 7-line band does not fit, or state explicitly that it
  fits and change nothing.
- **(5)** `.census.ts` deleted; `git status` clean apart from the round's spec artifacts.

## Validation pass 3 (final pass the loop allows)

All three items **COVERED**. Census and both Shelldra strings re-derived through the real code path and
reproduced character-for-character. All five pass-2 remediations verified LANDED, including the deleted
scratch file. Verdict **FAIL** on one finding:

- **The two-column mechanism as specified could not produce two columns.** T266, plan.md Decision 3 and
  research.md Q2 all said `columns: 2`, but `.statLines` is `display: flex; flex-direction: column`
  (BatomonCard.module.css:167-174) and CSS multi-column does not apply to a flex container. A class
  carrying only `columns`/`column-gap` is inert, the flex `gap` would keep applying where a multicol
  gutter was intended, and T268's class assertion would have passed a no-op — only the browser walk in
  T269 would have caught it.

### Remediation applied by the orchestrator

The mechanism is now a **column-flow grid**, in all three artifacts: `display: grid; grid-auto-flow:
column; grid-template-rows: repeat(var(--stat-rows), auto)`, with `--stat-rows = ceil(n / 2)` set inline
by `StatLines`. Beyond working at all, this keeps the band's existing `gap` token, fills the first
column before the second **by construction** instead of trusting a balancer, makes a third column
arithmetically unreachable (n items over ceil(n/2) rows), and is assertable in jsdom — T268 now checks
that 7 lines produce 4 rows and 6 produce 3, which a balancer's result could not have been.

**The three-pass validation budget is now spent.** Every work item has been COVERED in all three
passes; each FAIL was an artifact or task-wording defect in the orchestrator's own output, and each was
fixed. The pass-3 finding is corrected but, by the loop's own rule, not re-audited — so implementation
proceeds on the user's explicit go-ahead rather than on a fourth PASS.
