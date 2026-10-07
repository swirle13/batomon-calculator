# Round 6 work items

Source: /speckit-orchestrate invocation, 2026-10-07
Branch: 001-batomon-dps-calculator

> The user's list has two numbered items. Item 1 bundles two separately checkable asks — reuse the
> trinket picker's components, and represent the 9-species cap in a 3xN grid — so it is decomposed
> into WI-001 and WI-002. Item 2 is one ask, WI-003. Nothing is added, dropped, or merged, and each
> `Ask` quotes the user verbatim.
>
> A screenshot accompanied item 1: the **Painted species** modal as it stands, a single-column
    10|> scrolling list of 149 rows, each a sprite, a name, and a right-aligned "SuperRare · Pantra" meta
> line, above a rarity-shape chip row reading "Legendary 0/1  Rare 1/2  Uncommon 0/2  Common 1/2"
> and "4/9 selected".

## WI-001
- **Ask** (verbatim): "the painted species and smuggled species UI needs to reuse the trinkets component. … Another DRY principle violation."
- **Type**: refactor (UI)
- **Done means**: `AffectedCreaturePicker` composes from the same primitives the trinket picker uses — `Modal`, `FilterBar`, `PickerSection`, `PickerCard`, `CardGrid`/`OVERLAY_COLUMNS`, `TextField` — rather than its own `.pickerList` / `.pickerItem` / `.pickerSearch` rules, and the bespoke rules it replaces are deleted from `TrainerCard.module.css`. Selecting and deselecting a species still works, and the existing round-4 behaviours survive: user-chosen never generated (FR-090), Smuggler offering only opposite-region species (FR-088), and the rarity shape shown as guidance rather than enforced.
    20|
## WI-002
- **Ask** (verbatim): "Both trainer abilities only allow a max of 9 mons to be painted/smuggled, so those should be represented in the 3xN pop up UI."
- **Type**: behavior change (UI)
- **Done means**: the picker lays its species out in the 3-column grid every other overlay uses (`OVERLAY_COLUMNS`), and the 9-species cap is visible in that layout rather than only as a "4/9 selected" counter. Whether the cap is *enforced* must be decided explicitly and recorded, against the round-4 finding that Painter's rarity shape is "typically" and therefore guidance — the ask states the cap as a hard maximum ("only allow a max of 9"), which is a different claim from the shape and must be checked against the corpus/sources rather than assumed.

## WI-003
- **Ask** (verbatim): "when a mon gets too many statuses, it causes the status card to lose structure. Instead, the additional statuses should overflow into a second column within that row of the card. E.g. col 1: Deal 15 damage, POison 3, shock 3. col 2: shield 4, heal 15, multicast x3"
- **Type**: bug fix (UI)
- **Done means**: a creature with many output lines (damage + several statuses + heal + multicast) renders them in two columns inside the card's output band, in the stated order — the first column filling before the second — instead of overflowing the card's reserved height or displacing the cooldown block. The worst case in the corpus is measured, not estimated, and the card holds its declared fixed height (FR-043) with it.
    30|- **Note**: the band affected is `BatomonCard`'s output band (`CooldownBlock` + `StatLines`), which both the Corpus Browser and the Calculator's selected-creature panel render, and which also renders the "Effective this battle" values — so the fix applies to every instance of that band, not only the base one.
