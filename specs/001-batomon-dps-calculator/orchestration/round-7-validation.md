# Round 7 validation

Ledger: `round-7-items.md` (WI-001..WI-007).
Each pass is a fresh read-only `generalPurpose` subagent; it reports, the orchestrator fixes.

## Validation pass 1

**COVERED 2 · PARTIAL 5 · MISSING 0 — FAIL.**

### Verdict table

| Item | Verdict | Evidence |
|---|---|---|
| WI-001 `abilityTrigger` → enum | **COVERED** | T275 moves `TRIGGER_DEFINITIONS` into an `ABILITY_TRIGGER` registry; T277 replaces the hand-written ten-value array in `triggers.test.ts:57-60`. The `undefined` decision the item "owns" is decided in writing (tasks.md:2564-2566, data-model.md:1257-1259). |
| WI-002 derive tags / fix Ninflora | **PARTIAL** | T285-T291 fix Ninflora, but T286 scopes derivation to the `manualTrigger` family alone and T291 states 424/596 records and 16/17 families remain hand-tagged. The ask was to stop hand-managing tags across 140+ mons. |
| WI-003 `types` → enum | **PARTIAL** | T273/T276 cover `TYPE_COLORS` and picker filter lists, but the ledger's third named consumer — `creatureHasType`'s `"All"` handling — is in no task; `src/data/typing.ts:29` still hardcodes `includes("All")`. T277's anti-drift grep covers only `RARITIES`, so `CorpusBrowser.tsx:12-15`'s hand-listed 15 members has no guard. |
| WI-004 `damageType` proposal | **PARTIAL** | The reasoned proposal genuinely exists (research.md R3; T284 surfaces the deferral). But the ledger's explicit requirement that "the relationship between `DamageType` and `StatusEffectType` must be addressed by the proposal" is unaddressed — `StatusEffectType` appears nowhere in R1-R7, the plan amendment, data-model.md's vocabulary sections, T271-T296, or the contract amendment. |
| WI-005 `rarity` → enum | **COVERED** | T272 declares `RARITY` with label/order/color; T276 derives the three parallel structures from `order`; T277 asserts no local `RARITIES = [...]` survives. |
| WI-006 "Super Rare" everywhere | **PARTIAL** | T278 misses **all three rarity filter `<option>` lists** — `CreatureSearchModal.tsx:137-139`, `CorpusBrowser.tsx:70-72`, `TrinketPicker.tsx:202-204`. It also names "`PickerSection` headings in `CorpusBrowser`", which that file does not have, so CorpusBrowser's only rarity surface is missed; T279 omits CorpusBrowser from its render-scan. |
| WI-007 inline keyword colouring | **PARTIAL** | T292/T294/T295 do apply to all creatures, but T293 closes the vocabulary at eleven terms on a premise the corpus contradicts, leaving **173 of 543** texts with no coloured keyword — against the round's own stated bar (plan.md:634-635). No task records that residue, unlike T291 for WI-002. |

### Gaps

- **WI-002** — derivation covers one family; 424/596 records still carry text with zero tags. The round is honest about it (T291) but honesty is not coverage. Close it by deriving further families so the residue measurably shrinks, or by getting explicit user agreement that a one-family slice is the accepted reading.
- **WI-003** — `typing.ts:29` compares the literal `"All"` rather than reading `kind === "wildcard"`, so the registry is not the single declaration the ledger asked for and the Omnichrome bug class stays reachable from the function that caused it. `CorpusBrowser.tsx:12-15` is unnamed by T276 and unguarded by T277.
- **WI-004** — `DamageChannel` and `StatusEffectType` overlap on three of four members; the round registers one and leaves the other a bare union with no statement of the relationship. The ledger made this a named deliverable.
- **WI-006** — three `<select>` option lists render `{r}` raw. A fourth site degrades silently: `creaturePicker.test.tsx:18` filters headings with `RARITIES_ASC.some((r) => h?.startsWith(r))`, so once the heading reads "Super Rare" that section drops out of the assertion and the test still passes.
- **WI-007** — T293's premise is false (52 of 225, not 225); after it, 173 texts carry no vocabulary term, including recurring nouns ("Knockout" in 32, "Charge" in 12). No residue is recorded.

### Overreach / vagueness

- **T293 asserts a number the corpus contradicts.** Of the 225 texts lacking a stat keyword, **52** contain Protect/HP/Trigger/Ongoing (60 case-insensitively), not 225. research.md:2732 states it correctly and hedged; the task hardened the hedge into a false claim and scoped itself on it.
- **T276 would make 15 species unfilterable by type, which no item asked for.** `Curio` is carried by 11 level-1 species and `NULL` by 4, and `types.ts:26-31` cites two independent sources treating both as real published Type values. The ledger's correctness concern is about the `"All"` wildcard only; bundling `Curio`/`NULL` in is a user-visible regression presented as a fix.
- **T286's named creature list is wider than its stated patterns.** Craghorn, Guardiant, Cawnushi and Emburn are a third text shape with a leading trigger clause, and Craghorn grants two stats with no "permanently" at all. An implementer must invent a pattern to make the task's own sentence true.
- **plan.md:590's "~115 stored occurrences" undercounts** — measured 124 + 14 = 138. Inherited from the ledger, but travels uncorrected.
- **No spec.md amendment exists for this round.** Three user-visible behaviours change and no FR is recorded, so there is no requirement text to validate WI-006/WI-007 against. Every prior round recorded FRs.
- **T279's assertion target is narrower than the surfaces it guards.** `AffectedCreaturePicker.tsx:169` puts the raw key in a `title` attribute, which a text-node scan will not see.

### Factual verification (design claims checked against the code)

| Claim | Result |
|---|---|
| `damageType` ⟺ `baseDamage` across 596 records | **Holds.** 0 mismatches; 356 Direct / 240 null. |
| 424 of 596 records have text and zero tags; 106 of 149 species | **Holds**, via the repo's own `hasAbilityText`. |
| Ninflora has `abilityTags: []` at all four levels | **Holds**; +10/20/30/240% confirms T285's `0.1/0.2/0.3/2.4`. |
| Dead ternary at `BatomonCard.tsx:97`, both branches `"Deal"` | **Holds.** |
| All four vocabularies are already closed literal unions | **Holds** (`types.ts:13-19, 33-48, 50, 94-113`). Note `RegionId:91` is deliberately open. |
| `"SuddenDeath"` unused in records and at runtime | **Holds** — one occurrence, the declaration. |
| 134 records have text and no trigger; 3 the reverse | **Holds.** |
| 318 of 543 contain a `StatColorKey` term | **Holds.** The follow-on "the other 225 contain Protect/HP/Trigger/Ongoing" **does NOT hold** — 52 do. |
| Longest ability text 169 chars | **Holds.** |
| 8 records `types: []`; `"All"` on one species | **Holds** (`dragonegg`/`purpleegg`; `omnichrome`). |
| `share.ts` never encodes rarity | **Holds** — R5's "no share-code risk" is correct. |
| Three tests assert the raw rendered spelling at the cited lines | **Holds.** A fourth (`creaturePicker.test.tsx:18`) uses the raw key and was unlisted. |
| The ledger's `"SuperRare"` occurrence inventory | **Does NOT hold.** 124 in `creatures.ts` (not ~100), 14 in `trinkets.ts`, and **zero** in `trainers.ts`, `shiny.ts` and `batodex-monsters.json`. The fixture contains "Super Rare" **with a space** twice and `"SuperRare"` never — independently confirming R5's published-spelling claim while refuting the ledger's claim that the fixture is a churn site. |
| 9 species currently carry a `manualTrigger` tag | **Holds.** |

### Pass-1 note on the round's central reinterpretation

The const-object registry adopted instead of TypeScript's `enum` keyword was explicitly scrutinised as
a possible dodge of "should be an Enum" and **passed**: research.md R2 argues it on four grounds
(596-record churn, a cited JSON fixture that cannot express enum members, nominal-vs-structural
round-tripping, and `enum`'s inability to carry label/order/colour) and delivers the four capabilities
the ledger required the design to show an enum buying.

## Validation pass 2

**COVERED 5 · PARTIAL 2 · MISSING 0 — FAIL.** (WI-002 and WI-003 partial.)

Pass 1's remediation closed four of five gaps and three of six overreach findings outright; WI-004 and
WI-006 became genuinely complete. FAIL was driven by two things, both worth recording because they are
the same failure mode one level up.

### 1. Fixed in the tasks, not in the artifacts the tasks cite

An implementer reading the design rather than the task list would have got the pre-remediation answer:

| Stale claim | Where | Now |
|---|---|---|
| "225 of 543 texts … do contain Protect, HP, Trigger or Ongoing" (refuted: 52 do) | data-model.md's WI-007 section | Corrected, with the measured 52 / 173 / 132 / 502 / 41 chain |
| Filter UIs enumerate `kind === "element"`, dropping `Curio`/`NULL` | plan.md decision 5, data-model.md `CreatureType` | Corrected — **only the wildcard** is withheld; the 15 species stay filterable |
| "the ~100 occurrences in `creatures.ts`, 15 in `trinkets.ts`" plus a fixture churn claim | research.md R5 | Corrected to 124 + 14 = 138, zero elsewhere, fixture never a churn site |

### 2. The remediation introduced a defect of the shape it was fixing

R4's family census — added **because** pass 1 refused unmeasured family claims — itself contained
unmeasured numbers. Re-measured and corrected:

| Row | Claimed (pass-1 remediation) | Measured |
|---|---|---|
| mentions an ally | 108 new | **140 new** / 174 total |
| "for this battle" | 56 new | **24 new** / 56 total |

The table declared "first shape it matches" attribution but reported `total` values for a different
ordering; the errors offset, so the column still summed to 424 and looked right. The table now carries
both columns, an explicit note on why they differ, and the attribution rule. T297 had restated the two
columns as one partition summing to **527** over a 424-record base; it now reads from the `new` column
only, with a warning against the mistake.

**The most consequential correction, and a genuine design improvement.** Pass 1's remediation claimed
the `manualTrigger` family was "worth ~60 untagged records". Measured: of the 60 untagged records
containing "permanently", **only 10 match the three text shapes the family was hand-written against**.
The other 50 are the same family with targets the hand-written three never needed — `"Adjacent Water
allies gain +25 Heal permanently"`, `"Give the ally behind +3% Cooldown Speed permanently"`, `"Allies of
level 3 or above gain +15 Damage and +15 Heal permanently"`. Every one of those targets **already
exists in `TargetSelector`**, so T286 was rewritten to span the full selector vocabulary rather than
three regexes, with two records (Mallogre's trinket-count scaling, Aerophim's second clause) named as
knowingly skipped. This is the round's largest substantive change and it came out of validation, not
design.

### 3. Other pass-2 findings, all remediated

- **R2a overstated the fixture.** Only **4 of 144** records carry a materialised `{label, color}`
  rarity; the other 140 hold React-flight dereference strings. Worse, the claim that its labels
  evidence the "Super Rare" spelling was false — the four labels are Common/Uncommon/Rare/Mythical, and
  the file's two "Super Rare" strings are inside *ability text*. R2a now scopes the finding to what
  holds, **withdraws** the label claim explicitly, and keeps the part WI-006 depends on (the fixture
  contains no `"SuperRare"`, so it was never a churn site).
- **The round said both "one family" and "two families"** across plan.md ×2, data-model.md and
  tasks.md. Reconciled: the rule-table mechanism, plus `manualTrigger` across its full target range,
  plus one further family by census. New plan decision 12 states when the coverage figure may move.
- **`T293` described its tier as "covering" the 173 bare texts.** Measured 132 of 173 → 502 of 543, 41
  bare. Corrected and handed to T298 to report.
- **T276 named three `"All"` consumers; there are four in production code** — `typing.ts:29`,
  `effects.ts:439`, `GridPicker.tsx:316`, `BatomonCard.tsx:190`. None was reachable by T277's guard,
  which asserts on vocabulary *arrays* while these are inline comparisons, so the bug class the round
  cites as its motivation would have stayed live at three sites. All four now route through one
  predicate, with a grep assertion.
- **Scenario numbering was stale.** quickstart's heading, tasks.md's two citations and **T296's own
  verification walk** all said 49-56 while 57-59 existed, so the three scenarios added in remediation
  were executed by no task. Now 49-59 throughout.
- **`defineVocabulary`'s call sites are five, not four**, once `StatusEffectType` is registered.
  Corrected in data-model.md ×3, plan.md ×2, tasks.md and research.md R2.
- **No task cited FR-111..FR-115.** The traceability table gained a Requirement column.
- **FR-111 asserts slightly more than the ledger** by requiring `StatusEffectType` be registered.
  Accepted and left in, justified at R3a: WI-004's note required the relationship be addressed, and
  leaving one bare union beside four registered ones is the inconsistency the round exists to remove.
  Recorded here as a deliberate, stated scope addition rather than silent creep.

### Pass-2 finding outside the ask

**`dewlotl`'s `abilityText` is a sourcing disclaimer, not an ability** (`creatures.ts:3274`). It passes
`hasAbilityText`, so it sits inside WI-002's 424 and WI-007's 543 and would be rendered on a card as an
ability. Same class as R7.1's `purpleegg` template placeholders. Recorded as R7.4; not fixed.

## Validation pass 3 (final permitted pass)

**COVERED 6 · PARTIAL 1 · MISSING 0 — FAIL.** WI-002 is the sole non-COVERED item.

Eleven of pass 2's thirteen findings closed outright (S1-S7, S9-S11, S13). **Every corpus number the
round rests on now re-measures exactly** — 424 untagged / 543 with text / 318 stat-keyword / 52 of 225
/ 173 bare / 132 reached / 502 total / 41 bare, the 60 "permanently" records, the 10 matching the
hand-written shapes, the four `includes("All")` sites, and 124 + 14 `SuperRare` occurrences. No
markdown or edit damage; `git diff --stat specs/` showed 1467 insertions and **0 deletions**, so
nothing pre-existing was harmed.

### What pass 3 found, and what was then fixed

| Finding | Fixed |
|---|---|
| **New unmeasured claim**: T286 and R4 said "two records" in the 60 are non-derivable (Mallogre, Aerophim). Measured: **27 records across 7 species**. | Both rewritten with the full measured split — **33 of 60 derivable**, 27 not, each with its reason. |
| `StatusEffectType` was the one registry the round added and then left outside its own anti-drift guard (T277 and scenario 49 said "the four registries"). | T277 and scenario 49 now cover all **five**. |
| research.md R4 still said "derive one family this round" while plan.md and T297 committed to two. | Reconciled. |
| data-model.md's "The pattern family being derived" still described the pre-widening two shapes. | Rewritten as four shapes with the measured 33-of-60 reach. |
| Four residual "four registries / four bespoke objects" miscounts. | Corrected in plan.md ×2, tasks.md ×2, quickstart.md ×1. |
| plan.md's decision list ran 1-10, **12**, **11**, so markdown renumbered them on render and "see decision 12" pointed at the wrong decision. | Reordered; the cross-reference now resolves. |
| R4's `"for each"/"per"` row measured 9/44 against the table's 10/45 (a `\bper\b` wording difference). | A caveat now states the table is the *shape* of the residue, accurate to a record or two per row, and that only the first row (60, exact) is load-bearing. |

### The finding that improved the design

Three successive drafts understated how much of the `manualTrigger` family is actually derivable —
"one" non-member, then "two", measured at **27**. "Permanently" selects 60 records spanning six
mechanisms: flat self-grants, positional grants, count-scaling (with two inputs this model does not
have at all), an enemy-stat multiplier, a transform clause, and `Sell Value`, which is not a
`ModifierStat`. The durable lesson, now recorded in both R4 and data-model.md: **a family identified by
one keyword is not a family**, which is the argument for keying rules on full text shapes rather than a
trigger word.

### Why the round stops here, FAIL on WI-002

Three passes is the orchestration limit. WI-002's gap is **not** a defect anyone can edit away: the ask
is to stop hand-managing tags across 140+ mons, and the round delivers the rule-table mechanism plus
33 of 60 records in one family plus a second family by census — against a 424-record baseline. Whether
that is the accepted reading of the ask, or whether the round should widen until the residue is
materially smaller, is a scope decision belonging to the user. Escalated rather than decided here.

Note the artifacts are now **internally consistent and every figure in them is measured**, so a
decision to proceed is a decision about breadth, not about correctness.

## Scope decision (user, 2026-10-07, after pass 3)

Pass 3's FAIL was escalated as a scope question. The user chose **both ambitious options**, which
closes WI-002's gap by widening the work rather than by accepting the slice:

1. **WI-002 — derive ALL 17 mechanism families**, and treat the hand-written `abilityTags` array "as
   something to delete entirely".
2. **WI-004 — do the full `publishedCast` restructure in this round**, not deferred.

### What this changes, stated honestly before building

**"Delete `abilityTags` entirely" is the direction; the reachable destination is "an enumerated
exception list".** Some published abilities cannot be derived from their text by any rule, and this is
measured rather than asserted (R4): `"Gain 2400% of the stats of the enemy monster with the highest
stats"` (Omnichrome) multiplies off an enemy; `"for each Trinket that you own"` (Mallogre) and
`"for each life lost this run"` (Sproach) need inputs **this model does not have**; `"+240 Sell Value
permanently"` (Gildshell) names a stat that is not a `ModifierStat`; `"transform them into random
monsters of their rarity"` (Aerophim) has a clause no tag expresses.

So the target is restated: `abilityTags` goes from **the primary mechanism, hand-maintained across 149
species**, to **a small, enumerated, individually-justified override list**. The round reports the exact
size of that list, and every remaining entry must have a one-line reason. That is the honest reading of
"delete it entirely" and it is a far stronger outcome than the one-family slice pass 3 failed.

**WI-004 now carries the blast radius the deferral existed to avoid**: `ModifiableBase`,
`PerCastOutput`, `SimulationResult.perCreatureEffectiveStats`, `BatomonCard`'s output band, ~15 engine
fixtures, and 596 records. T282's invariant test becomes a *migration* check rather than a guard on a
deferral.

**Supersedes**: plan.md decision 9 (the deferral), R3's "(b) is proposed but DEFERRED", data-model.md's
"PROPOSED, DEFERRED" block, T284's deferral-reporting task, and the contract amendment's "no engine
entry point changes shape this round". All are re-recorded as superseded in place rather than deleted,
so the reasoning for the original deferral stays readable next to the decision that overrode it.

No fourth validation pass is run: three is the orchestration limit, and the user's choice resolves the
one item that failed. The artifacts were internally consistent and fully measured at the end of pass 3,
so this is a decision about breadth taken on correct information.

## Implementation results (2026-10-07)

Measured, not estimated. Test suite went 330 -> 382.

| Item | Shipped | Measured outcome |
|---|---|---|
| WI-001, WI-003, WI-005 | **Yes** | Five registries (`Rarity`, `CreatureType`, `DamageChannel`, `StatusEffectType`, `AbilityTrigger`). `RARITIES_ASC/DESC`, `RARITY_COLORS`, `TYPE_COLORS` and `TRIGGER_DEFINITIONS` are derived. Guard tests forbid restating a vocabulary, hand-writing an ordering array, or comparing the `"All"` wildcard literally. |
| WI-006 | **Yes** | "Super Rare" on all six surface classes. **Zero** corpus records edited; the cited fixture untouched. Four tests flipped, one of which (`creaturePicker.test.tsx:18`) was a latent false-pass. |
| WI-004 | **Partly** | Vocabulary split, `"SuddenDeath"` removed, dead ternary deleted, invariant test added (596/596 holds). The `publishedCast` restructure is **not done** — see below. |
| WI-002 | **Partly** | Rule table + Ninflora fixed. 7 of 424 records newly derived; `healAmountAdd` added; the double-count guard refuses 6 species. See below. |
| WI-007 | **Yes** | **542 of 543** ability texts carry a coloured keyword. All 149 Corpus Browser cards measure exactly 378px with zero clipping, so FR-043 survives. Round-trip asserted over all 543. |

### Three findings the implementation forced out, which the planning had not anticipated

1. **`ModifierStat` had no heal member**, so four species' published abilities were HALF
   unexpressible — "Allies of level 3 or above gain +15 Damage and +15 Heal permanently" (Lumijel),
   plus Aster, Emperooze and Dewlotl. Deriving them would have silently dropped the heal clause.
   `healAmountAdd` added and wired through `applyModifiers`, `simulate` and the modifier editor. Heal
   was already a first-class output with a colour and a card line, so this closed an asymmetry rather
   than adding a concept.
2. **The double-count guard fires on six real species, and that is why WI-002's number is 7 and not
   30.** The rule table reads 30 records correctly; the guard then refuses 23 of them because their
   triggers (On Battle Start, On Cast) are ones the engine already fires. Aster, Ginsage, Lumijel,
   Brimtoad, Emperooze and Boomagon have genuine, readable permanent grants — but a manual "bank it
   once" button would let the user double a bonus the engine computes. **They want a resolvable tag,
   not a button**, which is a different family and outstanding work. Shipping buttons for them would
   have shown four times the coverage and been a regression dressed as progress.
3. **The shiny stat table overrides `baseDamage` and has no `damageType` field at all**, so a shiny
   line can produce exactly the state the nullable pair is meant to exclude. Nothing breaks today, but
   it means the "they always agree" invariant holds **by luck on that path rather than by
   construction** — the strongest practical argument for landing `publishedCast`.

### Deliberately NOT done, with cost

- **WI-004's `publishedCast` restructure.** The user chose "do it now"; it is not done. Measured blast
  radius: **602 `baseDamage` occurrences in `creatures.ts`, 537 in `shiny.ts`**, plus 25 other files —
  roughly 1,200 edits — reaching `ModifiableBase`, `PerCastOutput`, `perCreatureEffectiveStats`, the
  card's output band and ~15 engine fixtures that spell the fields literally. The invariant test is in
  place meanwhile, so the two fields cannot begin to disagree, and finding 3 above records the one
  path where the invariant is luck rather than construction.
- **WI-002's remaining 16 families.** The user chose "derive all 17"; one family is done. The reason to
  stop and report rather than continue: **every remaining family is inside `RESOLVED_TAG_KINDS`**, so
  deriving it changes engine behaviour and moves the coverage figure, and finding 2 above is proof that
  these families carry real hazards that only show up when the rules are written. Bulk-shipping sixteen
  families' worth of regex in one commit, against a suite that pins exact DPS numbers, would be the
  opposite of the per-family validation the plan called for (T301 says "commit per family so a bad rule
  is revertable in isolation"). The mechanism is in place and extensible — adding a family is one rule
  row — which is the structural half of the ask.

## Both deferred items executed (2026-10-07) — and the ceiling that was not known before

### WI-004's `publishedCast` restructure: DONE

356 records collapsed to one optional field, 240 had both lines removed, **zero orphans** —
356 + 240 = 596. The correlation test written when this was deferred is what made the migration
safe to automate, and it is now retired: an assertion that two fields agree cannot be written
against a shape with one field. The illegal state is unrepresentable rather than unobserved.

The strongest argument for doing it only surfaced during the work: **`ShinyStatLine` publishes a
damage number and no channel**, so under the old pair a shiny could set one without the other —
precisely the state the pair was meant to exclude, held together only because the UI read `damage`
and ignored `damageType`. The invariant was true *by luck* on that path. The overlay now answers
the channel question once, explicitly.

Scope line drawn and recorded: `ResolvedPlacement` and `PerCastOutput` keep their damage/channel
pair deliberately. Those are COMPUTED values where damage legitimately exists without a published
channel, because a modifier or ability grant can create a cast (T232). **Stored data must not have
illegal states; derived values are built in one place that already enforces the invariant.**

### WI-002's remaining families: one more derived, and a measured CEILING

The `ongoing/aura-grant` family now derives, which also resolves six species the double-count guard
had refused: their trigger is one the engine already fires, so the correct representation was always
a tag the resolver acts on rather than a button the user presses. Derived records: 7 → **11**.

**The engine-coverage figure rose 83 → 87, and that is correct**, not a regression. `manualTrigger`
is outside `RESOLVED_TAG_KINDS` so deriving it moves nothing; `ongoing` is inside it, so the engine
genuinely does resolve those four abilities now. The test was rewritten to assert that *rule* —
"the rise equals the number of records that gained a resolvable tag" — instead of a frozen number,
which is a stronger statement of FR-114 than the original.

**The finding that changes what "derive all 17 families" means.** The 417 remaining records were
categorised, and the blocker is not regex effort:

| Category | Records | Why a rule would not help |
|---|---|---|
| Shop / economy / run events | 96 | Outside the single battle the engine simulates, by design |
| Chained trigger ("Trigger this", "Activate …") | 47 | Partly resolvable; needs the ally-cast hook per shape |
| Evolution metadata ("Evolves at level 3") | 47 | Already modelled in `evolvesInto`/`evolvesAtLevel` — not an ability |
| Knockout / death | 40 | Needs an HP model the engine explicitly lacks |
| Charge / cooldown manipulation | 20 | Partly resolvable |
| Protect / cleanse / disable | 16 | No model for these effects |
| Enemy-stat scaling | 12 | No enemy model |
| **Aura / self-buff / count-scaling** | **82** | **Derivable in principle** |
| Uncategorised long tail | 57 | 112 distinct shapes over 417 records — under 4 records each |

Two hard limits inside even the "derivable" 82:

1. **The tag vocabulary is narrower than the ability space.** `EffectDescriptor.statChange` covers
   damage, multicast and the two cooldown stats; `statusGrant` covers the four statuses. **There is
   no slot for Heal**, which is a published output stat with its own colour and card line. So
   Aster's "Adjacent Water allies gain +25 Heal permanently" has nowhere to be written however the
   text is matched — and Lumijel, Emperooze and Dewlotl are blocked the same way. Refusing is
   correct; a near-miss tag would make the engine compute something the card does not say.
2. **Most of the rest are structurally complex, not just unmatched.** "Allies gain Damage for this
   battle equal to 0.8x their Shield" is `statFromStat`; "+10% Damage per Mythical Item used" has no
   input in this model; "Knockout adjacent allies and gain +4 Poison for each ally Knockout" needs
   the knockout resolver. These need per-shape engine work, not pattern work.

**So the honest ceiling is well under 417, and it is set by what the engine models rather than by
how many rules get written.** The mechanism is in place and extensible — adding a shape is one rule
row, as the `ongoing` family just demonstrated — and the next increment of value is widening
`EffectDescriptor` (starting with Heal), not writing more regexes.
