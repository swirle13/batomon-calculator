# Round 4 work items

Source: /speckit-orchestrate invocation, 2026-10-06
Branch: 001-batomon-dps-calculator

> Note on numbering: this is the 4th `/speckit-orchestrate` round (the orchestration ledger
> sequence). It corresponds to what the chat transcript calls "round 12".

## WI-001
- **Ask** (verbatim): "for the painter trainer, it provides a grid of 9 mons that it paints with the type "all" that then counts for any type when effects/triggers count."
- **Type**: data correction + behavior change
- **Done means**: Painter's recorded ability is the grid-of-9 "all"-type painting, and a creature
  painted "all" satisfies every `typeFilter` the engine tests.
- **Conflict to resolve, not to paper over**: `src/data/trainers.ts:186-188` currently records
  Painter as *"Your monsters gain +1 to all stats for each different type they have (dual-typed
  monsters get a bigger bonus than single-typed ones)."* — a completely different ability. It is
  flagged `unconfirmedFields: ["abilityText"]`. The user plays the game; their description wins,
  but the superseded text must be recorded as corrected rather than silently overwritten.

## WI-002
- **Ask** (verbatim): "We need a trainer card UI with an optionally appearing button that shows what mons are being affected."
- **Type**: behavior change (UI)
- **Done means**: a trainer card exists; the button appears only for trainers that affect a
  specific set of creatures, and is absent for trainers that do not.

## WI-003
- **Ask** (verbatim): "I'm unsure of what trainers provide this, but I know of at least 2: painter and smuggler."
- **Type**: question to answer
- **Done means**: the full set of trainers that designate a creature set is determined from
  evidence and recorded in a design artifact — not left as "at least 2".

## WI-004
- **Ask** (verbatim): "They will show the 9 random mons they "paint" with "all" type and for smuggler, it shows the 9 random mons that are added to the creature pool from the opposite region"
- **Type**: behavior change
- **Done means**: both trainers surface a 9-creature set; Painter's set is painted "all"-type,
  Smuggler's set is added to the available pool from the opposite region.

## WI-005
- **Ask** (verbatim): "(a region denotes the collection of mons that show up, the player chooses a region before they choose anything else when starting a game, two regions being "starter" and "Jinto")"
- **Type**: data correction
- **Done means**: region is modelled as a first-class concept with at least `starter` and `Jinto`,
  and each creature is attributable to a region.

## WI-006
- **Ask** (verbatim): "as such, the player should be able to select which creatures are painted/smuggled in the UI to represent the current state of their game."
- **Type**: behavior change (UI)
- **Done means**: the user picks the actual 9 creatures, rather than the app generating or
  randomising them. The sets are part of the saved team configuration.

## WI-007
- **Ask** (verbatim): "For the painter, this should then update all of the selected mons as having "any" type, which I believe is a rainbow colored type chip"
- **Type**: behavior change (UI)
- **Done means**: a painted creature renders a rainbow type chip in place of / alongside its types.
- **Note**: the user says "all" in WI-001 and "any" here. Treated as one concept with one
  canonical name chosen in design; the ask is not split on that wording difference.

## WI-008
- **Ask** (verbatim): "and a slowly scrolling southeasterly transluscent rainbow overlay to the mon's sprite."
- **Type**: behavior change (UI)
- **Done means**: painted creatures' sprites carry a translucent rainbow overlay animating slowly
  toward the south-east. Must respect `prefers-reduced-motion`.

## WI-009
- **Ask** (verbatim): "Pebbler will keep applying more shield via its ability, so in your example, it has a cascading shield application. first turn, it grants 20 shield and then adds +15 more to its ability for the next time. next trigger, it grants 35 sheild, adding 15 more for next time. next trigger, grants 50 shield, and so on."
- **Type**: data correction (resolves T226)
- **Done means**: Pebbler emits Shield 20, 35, 50, 65 … on successive casts.
- **Significance**: this is the user ANSWERING the ambiguity T226 was filed for. The base
  `appliesStatus` and the ability grant are **two different effects**, not one restated — the base
  is the first cast's amount, and the grant accumulates on top from the second cast onward.

## WI-010
- **Ask** (verbatim): "Same exact thing for Bonshell. 7.0s casting time, shield 100 as base stats. First cast grants 100 shield, then updates its state to 80 damage and 180 shield for the next cast. next cast, deals 80 damage and grants 180 shield, then u pdates its state to 160 damage and 260 shield, and so on."
- **Type**: data correction
- **Done means**: Bonshell casts on a 7.0s cooldown emitting (damage, shield) of (0, 100),
  (80, 180), (160, 260), … — i.e. damage accumulates from 0 while shield accumulates from its
  base 100.
- **Constraint stated verbatim**: "7.0s casting time, shield 100 as base stats".

## WI-011
- **Ask** (verbatim): "Pyrokami is the same, cast 1 deal 5 burn then add 10, cast 2 deals 15 burn then add 10, cast 3 deals 25 burn then add 10, and so on."
- **Type**: data correction
- **Done means**: Pyrokami emits Burn 5, 15, 25, 35 … on successive casts.

## WI-012
- **Ask** (verbatim): "please execute T211, 213, 214, 215, 218, 220, 222, 223, 226, and 227 which you have left uncompleted"
- **Type**: behavior change (execution of existing tasks)
- **Done means**: each of T211, T213, T214, T215, T218, T220, T222, T223, T226, T227 is either
  implemented and marked `[x]`, or explicitly reported as not done with a reason.
