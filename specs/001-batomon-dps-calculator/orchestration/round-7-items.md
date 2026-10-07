# Round 7 work items

Source: /speckit-orchestrate invocation, 2026-10-07
Branch: 001-batomon-dps-calculator

> **Stated motivation** (verbatim): "we need to standardize the data types for the creatures, it's a
> total mess."
>
> The user's list has five numbered items; two of them bundle separately checkable asks and are
> decomposed. Item 1 asks for an `abilityTrigger` enum **and** for that enum to inform or replace
> `abilityTags` (WI-001, WI-002). Item 4 asks for a `rarity` enum **and** for `SuperRare` to be
> respelled and displayed as "Super Rare" everywhere (WI-005, WI-006). Items 2, 3 and 5 are one ask
> each (WI-003, WI-004, WI-007). Nothing is added, dropped, or merged, and each `Ask` quotes the
> user verbatim.
>
> **Context the design step must not skip.** `Rarity`, `CreatureType`, `DamageType` and
> `AbilityTrigger` are *already* closed string-literal unions in `src/data/types.ts`, and
> Constitution Principle II already forbids "bare strings for closed vocabularies". So "should be an
> Enum" cannot be read as "they are currently strings" — it has to be read against what is actually
> there, and the design must state what an enum buys that a literal union does not (a runtime value
> list, exhaustive iteration, a display-name mapping, one canonical ordering) rather than performing
> a `enum`-keyword rewrite and calling the mess cleaned. TypeScript's `enum` is also not the only or
> obvious answer in modern TS; whatever is chosen must be justified, applied uniformly across all
> four vocabularies, and be the reason the round's asks become easier rather than a parallel
> spelling of them.
>
> **Three screenshots accompanied item 5** — the game's own cards for Shikitsune, Pebbler and
> Craghorn. In them the ability band's trigger label ("On Cast") is orange, and keywords inside the
> ability *text* are coloured in place: damage phrases red/pink ("+20 Damage"), Shield tan ("+30
> Shield", "Shield"), Cooldown Speed light blue ("+15% Cooldown Speed"). Craghorn's text shows two
> different keyword colours in one sentence ("this gains +20 Damage and Shield"), so the colouring is
> per-keyword within the sentence, not per-card or per-ability.

## WI-001
- **Ask** (verbatim): "abilityTrigger field should be an Enum."
- **Type**: refactor (data model)
- **Done means**: `AbilityTrigger` is represented by whatever single construct the round chooses for closed vocabularies (see WI-003/WI-005 — the four must agree), that construct is the one place the trigger values and their order are declared, and `triggers.ts`'s `TRIGGER_DEFINITIONS` plus the hand-written trigger array in `src/data/__tests__/triggers.test.ts:55-59` derive from it instead of restating it. The existing "every `AbilityTrigger` value has a registry entry" guard must become impossible to drift rather than merely still passing: today a value added to the union and omitted from the test's own list is invisible to that test.
- **Note**: `abilityTrigger` is `AbilityTrigger | undefined` on `CreatureRecord`. Whether "no trigger published" stays `undefined` or becomes an explicit member is a decision this item owns, not an implementation detail — the corpus has creatures whose batodex `trigger` field is null (round 6 added `On Item Used` and `On Knockout` for exactly that reason).

## WI-002
- **Ask** (verbatim): "This can then inform, or replace, the abilityTags so that we can fix the issue with Ninflora with inherent properties about a mon's ability instead of having to manually manage a separate list of tags across 140+ mons"
- **Type**: behavior change (data model + engine)
- **Done means**: a creature's ability behaviour is derived from its own published fields rather than from a hand-maintained `abilityTags` array, to the extent that the Ninflora class of gap stops existing. **Ninflora is the named acceptance case**: "This and your Grass allies gain +10% Cooldown Speed permanently" (On Victory, all four levels) currently carries `abilityTags: []`, so it offers no manual-trigger button at all, while Brawlmantis and Kickrane — same ability shape, same trigger — do. After this item, Ninflora must work without anyone having hand-written a tag for it. The round must also state how many creatures currently carry empty `abilityTags` despite having real ability text, because that number is the size of the problem being claimed fixed.
- **Note**: this is the architecturally load-bearing item of the round and the only one that changes behaviour the user can see. It must be reconciled with two existing invariants rather than breaking them: `RESOLVED_TAG_KINDS` is the single source of truth for engine coverage (`effects.ts`), and the round-6 guards require that no creature have both a `manualTrigger` and an engine-resolved tag. Deriving tags from text must not inflate the coverage counter into claiming abilities the engine does not compute — the honesty rule the spec sets out at length.

## WI-003
- **Ask** (verbatim): "Types need to be an Enum"
- **Type**: refactor (data model)
- **Done means**: `CreatureType` uses the same construct chosen in WI-001/WI-005, and that construct is the single declaration of the type vocabulary — `TYPE_COLORS` (`src/data/typeColors.ts`), the type-filter lists in the pickers, and `creatureHasType`'s `"All"` handling all read from it rather than restating the member list. Adding a type must require exactly one edit.
- **Note**: `CreatureType` contains three members that are not creature *elements* — `"Curio"`, `"NULL"` and `"All"`. `"All"` in particular is a wildcard that `creatureHasType` treats as "matches every type", so it is a different kind of thing from `"Fire"`. Whether these stay in one vocabulary or separate is a decision this item owns; it is a live correctness concern, not cosmetics, because round 10's Omnichrome bug was precisely a wildcard being compared as if it were an element.

## WI-004
- **Ask** (verbatim): "damageType is also just either null or "Direct", which I'm not sure how we should handle this. BUt probably an Enum. Please think about and propose a reasonable change that thinks about code data structure and architecture of senior level OOP design principles"
- **Type**: question to answer, then behavior change (data model)
- **Done means**: a **written, reasoned proposal** is recorded in a design artifact — not merely a task to decide later — covering: (a) what `DamageType` actually is today versus what the corpus uses it for, (b) whether `null` is a legitimate state or a modelling smell, (c) the recommended representation with its trade-offs argued rather than asserted, and (d) what it costs to apply. The recommendation is then implemented, or explicitly deferred with the reason recorded. The user asked to "think about and propose", so an answer the user can disagree with is the deliverable; silently picking one and shipping it does not satisfy this item.
- **Note**: the ask contains a factual claim to verify rather than accept — `DamageType` is declared as `"Direct" | "Burn" | "Poison" | "Shock" | "SuddenDeath"`, five members, while the user observes only `null` and `"Direct"` in use. If the other four are genuinely unused in the corpus then the declared type and the real data disagree, which is a finding in its own right and arguably the actual mess this item is pointing at. The relationship between `DamageType` and `StatusEffectType` (`"Burn" | "Poison" | "Shock" | "Shield"`), which overlaps it on three members, must be addressed by the proposal.

## WI-005
- **Ask** (verbatim): "rarity should be an Enum."
- **Type**: refactor (data model)
- **Done means**: `Rarity` uses the construct chosen in WI-001/WI-003, and it is the single declaration of both the member list **and the tier ordering** Common → Mythical. The rarity ordering is currently restated as literal arrays in the pickers and section headings; after this item those read from the vocabulary.

## WI-006
- **Ask** (verbatim): "SuperRare should update to "Super Rare" with a space in it and should display that everywhere."
- **Type**: data correction + behavior change (UI)
- **Done means**: every user-visible surface reads "Super Rare" with a space — card rarity labels, picker section headings, rarity-shape chips, filter controls and any meta line — with no remaining "SuperRare" visible anywhere in the running app. A test asserts the rendered spelling rather than only the data value, because the previous round's bug of this exact shape (`PAINTER_RARITY_SHAPE` keyed `"Super Rare"` while the corpus spells it `"SuperRare"`, round 6 validation) was a silent mismatch between two spellings of one tier.
- **Note**: there are ~100 `"SuperRare"` occurrences in `src/data/creatures.ts` plus 15 in `trinkets.ts` and others in `trainers.ts`, `shiny.ts`, `statColors.ts` and the batodex JSON fixture. Whether the stored value changes or only the displayed label is a decision this item owns, and it interacts with the shareable build code (`src/data/share.ts`) and the cited-source fixtures: if the stored value changes, previously shared URLs and the recorded batodex fixture must be considered. Picking "display-only" or "change the data" without stating the consequence for those two is not sufficient.

## WI-007
- **Ask** (verbatim): "For all mon's ability text, keywords are colored in-line, see ss1 and 2 and 3 for an example"
- **Type**: behavior change (UI)
- **Done means**: ability text renders its keywords coloured in place, for **all** creatures, matching the game's treatment in the three screenshots. Today `BatomonCard` renders `creature.abilityText` as one uncoloured `<p>` (`BatomonCard.tsx:245`), so every keyword is the same grey. The keyword vocabulary and its colours must come from the existing `STAT_COLORS` / `statColors.ts` layer that already colours the output band and the modifier chips, so the ability text and the stat badges cannot drift to different reds. Creatures whose text contains no keyword must render unchanged rather than degrade, and the card's declared fixed height (FR-043) must survive the change.
- **Note**: "all mon's ability text" is explicit, so this cannot be done as a per-creature annotation of 140+ records — it has to work from the text. `TrainerCard` renders an `abilityText` the same way (`TrainerCard.tsx:91`), and the Corpus Browser and the Calculator panel share `BatomonCard`; the ask says "all mon's", so trainers are outside it unless the design chooses to include them, which must be stated either way.
