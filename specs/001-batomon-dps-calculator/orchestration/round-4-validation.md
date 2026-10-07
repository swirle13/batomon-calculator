# Round 4 validation

Ledger: `specs/001-batomon-dps-calculator/orchestration/round-4-items.md`

## Validation pass 1

**Result: FAIL — 8 COVERED, 4 PARTIAL (WI-002, WI-004, WI-005, WI-012), 0 MISSING**, plus 6
overreach/vagueness findings.

### Verdict table

| Item | Verdict |
|---|---|
| WI-001 Painter ability correction | COVERED |
| WI-002 Trainer card + optional button | **PARTIAL** |
| WI-003 Which trainers designate a set | COVERED |
| WI-004 Both surface a 9-set; Smuggler adds to pool | **PARTIAL** |
| WI-005 Region as first-class concept | **PARTIAL** |
| WI-006 User picks the 9 | COVERED |
| WI-007 Rainbow type chip | COVERED |
| WI-008 Scrolling SE rainbow overlay | COVERED |
| WI-009 Pebbler 20/35/50 | COVERED |
| WI-010 Bonshell (0,100)/(80,180)/(160,260) | COVERED |
| WI-011 Pyrokami 5/15/25 | COVERED |
| WI-012 Execute the ten deferred tasks | **PARTIAL** |

### Gaps

- **WI-002**: no task says what the card or the button *renders*; existing trainer UI is a bare
  `<select>` (`TrainerPicker.tsx:9-22`) and no task says it is replaced.
- **WI-004**: "added to the creature pool" is recorded but has no effect — the pool is not
  region-aware (`corpus.ts:130` filters name/type/rarity only), so smuggling is a no-op.
- **WI-005**: the ask says "the player chooses a region before they choose anything else"; no task
  adds that selection, and `TeamConfiguration` gains no region field. T229 says "attribute
  creatures" with no source for the mapping.
- **WI-012**: all ten IDs exist and are unchecked, but three are not executable as written — T220
  (no list, no target, no stopping criterion), T222 (cites quickstart Scenarios 45-50 that do not
  exist), T227 (instructs modelling what research.md itself calls unmodellable).

### Overreach / vagueness

1. T230 + data-model assert "four `types.includes` tests in `effects.ts`" — **verified wrong**.
2. The 2/2/2/2/1 rarity shape is sourced for Painter but applied to Smuggler too.
3. M2's "scanned all 23" states its conclusion without recording why Mad Scientist and Monster
   Ranger are excluded.
4. T228 requires a `supersededText` note but `TrainerRecord` has no such field.
5. `smuggledCreatureIds` is written by T235 but added by no task.
6. Phase 16 cites no FR numbers; spec.md stops at FR-084 with no round-4 amendment.

### Orchestrator verification of the findings

Each load-bearing claim was checked against source before being accepted:

- `types.includes` sites: **6 total** — `effects.ts:122,279`, `simulate.ts:118,121`,
  `corpus.ts:130`, `CreatureSearchModal.tsx:58`. The audit is right and my own figure was wrong.
- Quickstart scenarios: the audit said "none past 44"; the real maximum is **Scenario 31**. T222 is
  worse than reported, not better.
- `spec.md` maximum is **FR-084**, no round-4 FRs. Confirmed.
- Mad Scientist ("On day 7, transform monsters on your active team into random level 1 Legendary
  monsters") and Monster Ranger ("Start with an Uncommon monster…") do designate creature sets.
  Confirmed; they are day/economy-scoped and excluded under research.md B6, but the boundary was
  unstated.

All six overreach findings and all four PARTIAL verdicts are **accepted**. None rejected.

## Validation pass 2

**FAIL — 11 COVERED, 1 PARTIAL (WI-012), 0 MISSING**, 5 overreach findings. All four pass-1
PARTIALs except WI-012 closed; 5 of 6 pass-1 overreach findings fixed and verified.

Remaining: T227(a) asserted the engine "already represents" a flat +8s cooldown penalty — **false**,
verified: `EffectDescriptor.statChange.stat` has no flat-seconds option (`types.ts:117`) and the
`buffOnCast` applier ignores cooldown entirely (`simulate.ts:565-574`). Also: T220 said 14 where its
source enumerates 15; research M6's region tally summed to 139 against 149 species; the Phase 16
design pointer still said "M1-M5"; and `"All"` already exists as a type with Omnichrome carrying it,
leaving painted-vs-native semantics undecided.

All five accepted. Remediated by deciding the `cooldownFlatSeconds` schema rather than leaving it to
the implementer, correcting both counts, and ruling that painted and native `"All"` mean the same
thing — which incidentally fixes a pre-existing bug where Omnichrome matched no type filter.

## Validation pass 3

**FAIL — 11 COVERED, 1 PARTIAL (WI-012), 0 MISSING**, 5 overreach findings.

Every pass-1 and pass-2 remediation verified as holding against source. The residue is narrow and
concentrated in **T220**: it contradicted itself on 14 vs 15, pointed to "the list below" when the
list was above, and directed tagging **petrirex** (knockout — explicitly deferred by T219 as needing
a death/HP system) and **prismagon** (counts unique types, which `statFromCount` structurally cannot
express). Also flagged: T228's `supersededText` was declared in data-model but owned by no task;
T229 ignored M6's instruction not to conflate "in neither set" (13) with "absent from the payload"
(10), cited an uncommitted external source, and quoted the "before they choose anything else"
ordering constraint without implementing it.

All accepted and remediated. Bambudo's level-1 omission was checked and is **correct** — its level-1
record reads "No ability text transcribed in sources reviewed.", so there is no ability to tag; that
is now recorded so the count does not read as an oversight.

**Three passes used. Per the skill, stopping before implementation for a user scope decision.**
