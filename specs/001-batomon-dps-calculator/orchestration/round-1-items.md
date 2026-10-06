# Round 1 work items

Source: /speckit-orchestrate invocation, 2026-10-06
Branch: 001-batomon-dps-calculator

> Compound asks are split into atomic items so each can be validated independently.
> The `Ask` field preserves the user's exact wording; it is immutable once written.

## WI-001
- **Ask** (verbatim): "choose a batomon" screen has the mons still not at 64x64
- **Type**: bug fix
- **Done means**: creature sprites in the picker render at 64×64, as they already do in the team grid.

## WI-002
- **Ask** (verbatim): and the naming alignment is now messed up. see SS 1.
- **Type**: bug fix
- **Done means**: the name band sits where the design intends (bottom of the card) with the sprite
  filling the art area above it — not the name floating high with a large empty colour block below,
  as SS1 shows.

## WI-003
- **Ask** (verbatim): Do these use the same reusable UI components as they should?
- **Type**: question to answer
- **Done means**: a concrete, evidenced yes/no recorded in a design artifact — naming the components
  the picker card actually uses today and whether they are the shared ones, not a task to look into it.

## WI-004
- **Ask** (verbatim): The "3.0 sec" part of base and "effective" are formatted differently. These
  should not be acting like this. This is you having created things NOT using our DRY principles.
  These two should be the same reusable component with a diferent value provided to it.
- **Type**: bug fix
- **Done means**: both cooldown blocks render from one shared component with only the value differing;
  no second definition of that block exists.

## WI-005
- **Ask** (verbatim): The top one is too tall and the bottom one is too short.
- **Type**: bug fix
- **Done means**: the two cooldown blocks are visually identical in size.

## WI-006
- **Ask** (verbatim): The cost and unconfirmed shopCost fields at the bottom are also strange. These
  are known and the "unconfirmed" should be removed. This isn't important or necessary at all. See SS2.
- **Type**: behavior change
- **Done means**: the "Unconfirmed: shopCost" marker no longer renders on the stats card.

## WI-007
- **Ask** (verbatim): selected batomon tile still adjusts width, this should not happen. It then
  causes the chart below to redraw every time the column readjusts its width
- **Type**: bug fix
- **Done means**: the selected-creature column holds a constant width across creature changes, so the
  chart below does not re-layout.

## WI-008
- **Ask** (verbatim): the dps tables have the bottom outline as a faint line instead of bold, while
  top/left/right sides are all bold/thicker lined, so the table looks unfinished. see SS3
- **Type**: bug fix
- **Done means**: the tables' bottom edge matches the weight of their other edges.

## WI-009
- **Ask** (verbatim): Let's remove "Batomon Stats" from above the batomon stats section; it's
  self-explanatory. It causes a weird spacing shifting it down and doesn't align with the 6 mon grid.
- **Type**: behavior change
- **Done means**: the heading is gone and the stats card's top aligns with the top of the 6-mon grid.

## WI-010
- **Ask** (verbatim): let's remove the "or choose from dropdown" from below each mon slot
- **Type**: behavior change
- **Done means**: the per-slot `<details>` fallback dropdown no longer renders.

## WI-011
- **Ask** (verbatim): lets move Modifiers section above "team summary" to just below the mons
- **Type**: behavior change
- **Done means**: render order is team grid → Modifiers → Team Summary.

## WI-012
- **Ask** (verbatim): and drop the AI "[em dash] optional carry-over bonuses", this is redudant
- **Type**: behavior change
- **Done means**: the em-dash hint text on the Modifiers disclosure summary is gone.

## WI-013
- **Ask** (verbatim): the mon cards in Corpus Browser are not fixed height and they should be. see ss4
- **Type**: bug fix
- **Done means**: every card in the browser grid shares one height; no ragged rows.

## WI-014
- **Ask** (verbatim): please remove "Corpus snapshot" prose from the top of the Corpus Browser.
- **Type**: behavior change
- **Done means**: that prose no longer renders. **Note for planning**: FR-014 requires the active
  corpus/patch version be stated somewhere, and round 7 moved it to exactly this line after removing
  it from the header. Removing it here leaves FR-014 with no home — this tension must be resolved
  explicitly in the spec, not silently dropped.

## WI-015
- **Ask** (verbatim): As well, rename it to "Batomon Browser". See SS4
- **Type**: behavior change
- **Done means**: the view and its nav control read "Batomon Browser" everywhere.

## WI-016
- **Ask** (verbatim): Batomon Browser is not organized in types or in an alphabetical manner. It
  appears the lists anywhere in this site is relying on the underlying data to be in alphabetical
  order. You need to ensure the data that is displaying the content inherently sorts and organizes
  the data, even if the underlying data is not in alphabetical order. Note the SS5 first 6 mons are
  not alphabetical (assumedly the most recent changes made) and then the alphabetical list starts.
- **Type**: bug fix
- **Done means**: every list surface sorts at the point of display rather than inheriting file order,
  verified against the 6 seed records that currently appear first. The ask covers **all** lists on the
  site, not only the browser.

## WI-017
- **Ask** (verbatim): I'd like to add another graph that shows DPS over time. That way, I can
  visualize how much DPS increases, especially as the fight goes on, and especially with mons that
  have their damage increased or more shock is applied. An ebb and flow of how much DPS occurs can
  give good insights on starting vs mid vs end of match output, to help prioritize leaning into more
  mons/items/etc that help one direction or another.
- **Type**: behavior change
- **Done means**: a second chart plots instantaneous DPS (a rate) against time, distinct from the
  existing cumulative chart, and shows the rise the user describes.

## WI-018
- **Ask** (verbatim): This might be a bit too far out, but maybe an optimal damage suggestion where
  shuffling existing mons would result in more total DPS (weighted so DPS that is closer to t=0 is
  better because prioritizing lots of poison that accumulates more is good, but you might be dead
  before the 20s default is hit by the time the poison actually starts doing enough damage). This
  would mostly matter with mons that trigger when others do or speed up other mons or trinkets make
  effects for certain slots, etc. where positioning can affect. Especially chaining effects like
  "speeds up mon in front (aka to right) by X" and another mon that says "speeds up mon behind (aka
  to left)" or "mon in slot X gets multicast Y" where more poison might be more beneficial to hit or
  in other scenarios where a mon with high raw damage is more beneficial to utilize the multicast.
- **Type**: behavior change
- **Done means**: either a working placement optimiser that searches permutations and reports a better
  arrangement under a time-weighted objective, **or** an explicitly recorded decision that it cannot
  be delivered meaningfully yet with the stated reason. The user flagged it as "a bit too far out",
  so a reasoned scope answer is acceptable — silently omitting it is not.
