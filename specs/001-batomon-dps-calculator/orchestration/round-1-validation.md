# Round 1 validation

## Validation pass 1 (2026-10-06)

**Verdict: FAIL** — 14 COVERED, 4 PARTIAL (WI-001, WI-006, WI-016, WI-018), 0 MISSING,
5 overreach/vagueness findings.

### Gaps found

| Item | Gap |
|---|---|
| WI-001 | Tasks said "the shared token", but the picker's token is `--sprite-picker: 48px`. The most natural implementation would change nothing and the user's "still not 64×64" complaint would survive. |
| WI-006 | T179 removed only the *marker*; `Cost $unknown` still renders, leaving an unexplained "unknown" — strictly less information than before. |
| WI-016 | FR-067 scoped to "lists of corpus records", narrower than the ask's "anywhere in this site". Missed the browser's own hard-coded, non-alphabetical **Type filter**, plus `TeamSummary`'s DPS and status row orders. |
| WI-018 | The ask named "trinkets make effects for certain slots"; no task mentioned trinkets. Link Cable ("all monsters considered adjacent") would silently invalidate the optimiser's only visible interaction. |

### Overreach / vagueness

1. **T193 asserted a false number.** "Only one creature has an engine-readable positional
   `AbilityTag`" — **Onsetra also carries one** (`behind`, and its ability text is literally one of
   the chaining effects the user described). Verified: two creatures have positional tags; only
   Formiqueen's is actionable, because `simulate.ts:108` reads only `cooldownSpeedModifier`. This
   mattered because FR-069's entire honesty mechanism is a count shown to the user — implemented as
   "has a positional tag" it would report a reassuring 2.
2. **T180 asserted a layout mechanism the DOM does not support.** It claimed the column's width
   drives the chart's width via `ResponsiveContainer`. `#root` is a fixed `1126px` and the chart is
   not a sibling of that flex row, so the chart's width is already independent. The fix is still
   right for FR-062; the justification was not, and the redraw may have another cause.
3. **Scenarios 32–38 did not exist.** Both the phase's Independent Test and T195 cited them;
   quickstart ends at 31. The phase had no acceptance criteria.
4. **No round-8 amendment** to `plan.md`, `data-model.md`, or `contracts/engine-api.md`, despite
   T190 adding a `SimulationResult` field and T192 adding a whole new engine module.
5. **Two tasks unexecutable as written.** T180 used a `<token>` placeholder for a token that does
   not exist; T185 asked to pass a boolean `fixedHeight` *and* size it differently, which the
   boolean cannot express.

### Remediation applied (orchestrator, not the subagent)

- WI-001: T175/T177 and FR-060 now name **64px explicitly** and set `--sprite-picker: 64px`, with the
  reason the "use the token" wording was insufficient recorded inline.
- WI-006: new **T179b** — source the real cost or stop rendering a Cost line when unconfirmed; never
  fabricate one.
- WI-016: FR-067 widened to **every list rendered in the UI**; T189 now names the Type filter and
  both `TeamSummary` row orders.
- WI-018: T193 extended to disclose unmodelled positional **trinkets**, naming Link Cable.
- Overreach 1: T193 and the spec amendment corrected to "two carry tags, one is actionable", and the
  UI count is now mandated to derive from what the engine can act on.
- Overreach 2: T180's causal claim retracted inline; the task now says not to assume the redraw is
  fixed and to investigate separately if it persists.
- Overreach 3: new **T194b** writes Scenarios 32–38 before T195 walks them.
- Overreach 4: new **T194c** adds the round-8 amendments to plan/data-model/contracts.
- Overreach 5: T180 now defines `--detail-panel-width`; T185 now changes `fixedHeight` to a variant
  prop rather than forcing 33rem onto 149 browser cards.

## Validation pass 2 (2026-10-06)

**Verdict: FAIL** — 17 COVERED, 1 PARTIAL (WI-008), 0 MISSING, 7 overreach/vagueness findings.

Pass 1's four coverage gaps all closed. Two of its disputed claims verified as correctly fixed
(the positional count, now "two carry tags / one actionable"; Scenarios 32-38, now written by
T194b). The remaining findings:

| Finding | Status |
|---|---|
| **research.md J3/J7 still carried the retracted claims verbatim** | Real and important. Pass 1's corrections were applied to tasks.md and spec.md only, leaving the planning set self-contradictory — the research artifact the others derive from still asserted the chart-width mechanism and "only one creature … no `AbilityTag`". Now corrected in place, as retractions rather than silent edits. |
| **WI-008 is a COLOUR problem, not weight** | Real. All four edges are already 1px: three come from the global `th, td { border: 1px solid #ccc }` (`App.css:19-20`), and `TeamSummary.module.css:33` overrides only `border-bottom` with `#2c2f3b` — dark-on-dark. FR-063 and T181 both said "weight", so an implementer would have measured uniform 1px, changed nothing, and shipped the same screenshot. Both restated as colour-and-weight. |
| **T175's "default to the token" is inert** | Real. `spriteSize` is a numeric prop (`<img width={size}>`); a CSS custom property cannot supply it, and `--sprite-picker` is read by nothing in `src/` — only `--sprite-grid` has a reader. Task now requires adding a reader and verifying the rendered `<img width>`. |
| **T179 and T179b contradicted each other** on the same line | Real. T179b now explicitly supersedes T179 for the Cost line; traceability row updated. |
| **Link Cable singled out when six slot-scoped trinkets exist** | Real. Several alter Cooldown Speed or Damage — the optimiser's own objective — so placement already affects DPS independently of creature abilities. Disclosure must count all, not name one. |
| **T180's "not a sibling" literally false** | Real but cosmetic: they are siblings in the `.App` tree; the correct point is that the chart is not a flex *item inside* the row. Reworded. |
| **T195 still `[P]`** despite depending on T194b | Real. Marker removed. |

### Decision after pass 2

Every finding is remediated. Rather than spend the third permitted pass re-auditing planning
artifacts, the orchestrator proceeds to implementation: the one PARTIAL item (WI-008) was a wording
defect now corrected, and the remaining findings were artifact-consistency issues, not missing
coverage. All 18 items have tasks; the implementation itself is the next meaningful check.
