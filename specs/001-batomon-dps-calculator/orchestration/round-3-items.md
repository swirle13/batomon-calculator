# Round 3 work items

Source: /speckit-orchestrate invocation, 2026-10-06
Branch: 001-batomon-dps-calculator

> Compound asks are split into atomic items so each can be validated independently.
> The `Ask` field preserves the user's exact wording; it is immutable once written.

## WI-001
- **Ask** (verbatim): puffloon's "Heal" shows no chip card when it should.
- **Type**: bug fix
- **Done means**: a creature with a `healAmount` renders a Heal chip in its grid slot, in the
  published Heal colour.

## WI-002
- **Ask** (verbatim): and when it levels up and gains multi-cast x2, it also doesn't add that new
  chip either.
- **Type**: bug fix
- **Done means**: a creature whose level grants Multicast > 1 renders a Multicast chip.

## WI-003
- **Ask** (verbatim): A chip also doesn't get added when any modifiers are added either. I just
  added +50 damage to Puffloon and it still just sat there with the "1 poison" chip.
- **Type**: bug fix
- **Done means**: resolved. **Note the tension that must be settled explicitly in the plan**: the
  previous round changed chips to show **base** stats at the user's request ("it should reflect his
  base stats, not his effective stats"). This item asks for modifier effects to appear. Separately,
  `+50 damage` on Puffloon may legitimately do nothing — `baseDamage` is `null` and the documented
  rule is that a modifier can only scale an effect the creature already has. Both halves must be
  addressed, not just the easier one.

## WI-004
- **Ask** (verbatim): Modifiers layout should be reactive and be tied to the same positions in the
  mon grid so that the layout matches the mon grid layout. Currently, it doesn't do that.
- **Type**: behavior change
- **Done means**: the Modifiers section lays out as a 2x3 grid whose cells correspond to the team
  grid's slots, including empty ones, rather than a flowing list.

## WI-005
- **Ask** (verbatim): I think our "over time" calculations aren't taking mon changes into effect.
  Drumire speeds up any toxic ally when it casts by +15% cooldown speed for this battle (aka gets
  faster)
- **Type**: bug fix
- **Done means**: `cooldownSpeedOnAllyCast` is actually applied during the battle and compounds per
  cast, so affected allies visibly cast more often as the fight goes on.

## WI-006
- **Ask** (verbatim): but for the fast mons, especially like Puffloon that triggers when adjacent
  toxic allies trigger, Puffloon goes off something like 10-15 times a round.
- **Type**: bug fix
- **Done means**: a trigger-on-ally-cast ability causes extra casts, so Puffloon's cast count
  reflects its adjacent Toxic allies' casts rather than its own cooldown alone.

## WI-007
- **Ask** (verbatim): Fumungus also doesn't have its effective damage shown properly. At the
  beginning, accurately, it will have 0 damage, but will gain damage equal to the stacks of poison
  on the enemy team.
- **Type**: bug fix
- **Done means**: Fumungus's damage scales with the live Poison stacks on the target. **Round 9
  explicitly deferred this** for want of a modelled target carrying stacks; this item asks for it,
  so either the target state is modelled or the reason it still cannot be is recorded.

## WI-008
- **Ask** (verbatim): the graphs have their Y axis label overwritten when the axis values become
  longer, see SS3
- **Type**: bug fix
- **Done means**: the rotated Y-axis label never overlaps the tick values, at any magnitude.

## WI-009
- **Ask** (verbatim): "DPS single source slider" and "DPS over time" graph seem to agree mostly
  except for when t=0. Slider shows 2366.45 dps at t=0 but graph shows 0 with increasing
  accumulation.
- **Type**: bug fix
- **Done means**: the slider's t=0 reading and the chart agree, or the slider's default state is
  labelled so it cannot be mistaken for a t=0 reading.

## WI-010
- **Ask** (verbatim): Can we go through and find every type of interaction via deep research,
  identify all mechanisms that can/should be calculated
- **Type**: question to answer
- **Done means**: a recorded, evidence-backed taxonomy of every distinct ability/interaction
  mechanism present in the corpus, derived from the data rather than guessed.

## WI-011
- **Ask** (verbatim): then audit what abilities currently are working and calculated and which
  aren't
- **Type**: question to answer
- **Done means**: a recorded audit mapping each mechanism to supported / unsupported, with counts,
  so the real coverage figure is known rather than estimated.

## WI-012
- **Ask** (verbatim): then build against the list of all of the unsupported abilities so that we
  have 100% support for ability calculations? This is massively important to this DPS calc to be
  useful in any capacity
- **Type**: behavior change
- **Done means**: every mechanism in WI-010's taxonomy is either implemented, or explicitly
  recorded as not implementable with the reason. 100% is the stated target; any shortfall must be
  named and quantified, not glossed.
