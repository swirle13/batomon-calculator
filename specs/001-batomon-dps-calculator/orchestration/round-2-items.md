# Round 2 work items

Source: /speckit-orchestrate invocation, 2026-10-06
Branch: 001-batomon-dps-calculator

> Compound asks are split into atomic items so each can be validated independently.
> The `Ask` field preserves the user's exact wording; it is immutable once written.

## WI-001
- **Ask** (verbatim): the main batomon icons are much too small now. Their previous size was
  perfectly fine. see SS1
- **Type**: bug fix (regression)
- **Done means**: the team-grid icons are back to the size they were before round 8, with the cause
  of the shrink identified rather than a number nudged until it looks right.

## WI-002
- **Ask** (verbatim): DPS table should show a total value of DPS currently done, combined of all dps
  and facilitated dps numbers
- **Type**: behavior change
- **Done means**: the per-creature DPS table carries a total row summing both columns.

## WI-003
- **Ask** (verbatim): The "Effective" category of the cardFixedPanel isn't actually showing the
  effective damage this battle. This section will need to be able to parse the different "on battle
  start" and any other trinkets and effects that will affect things in order to calculate this
  value. In this example with Miasmaw, his effect is: "Gain Poison for this battle equal to 1x the
  total Poison of your allies. (Except other Miasmaw)" and currently we have other poison of
  creatures at 6 + 20 + 300 = 326, plus Miasmaw's current 10, for a total of 336 poison. So
  Miasmaw's effective this battle should be "Poison 336".
- **Type**: bug fix
- **Done means**: with that team, Miasmaw's "Effective this battle" reads **Poison 336** — the
  user's arithmetic is the acceptance criterion.

## WI-004
- **Ask** (verbatim): This "calculate all effects" is a very important part of calculating DPS
  because I think currently, the DPS measurement is off. I don't think there's an engine that checks
  and computes all statuses together for each creature, which I think needs to be built to
  facilitate this
- **Type**: behavior change (new engine capability)
- **Done means**: a resolution layer exists that computes each creature's effective stats *after*
  all team-wide, on-battle-start, positional, and trinket effects, and `simulate()` consumes it so
  the DPS numbers reflect it. Whether "the DPS measurement is off" must be verified and answered,
  not assumed.

## WI-005
- **Ask** (verbatim): which will then be used elsewhere in the app, e.g. the placement suggestion,
  which can't operate if it doesn't calculate positioning and trinkets and everything else.
- **Type**: behavior change
- **Done means**: the placement suggester reads the same resolution layer, so its search reflects
  positional and trinket effects rather than reporting "no improvement" because it cannot see them.

## WI-006
- **Ask** (verbatim): There needs to be a total DPS number that is shown predominantly that combines
  all DPS (which I think you are calculating just damage, excluding status damage) and FAcilitated
  DPS, so taht users have a singular DPS number to compare.
- **Type**: behavior change
- **Done means**: one prominent total-DPS figure combining direct and facilitated output. The user's
  parenthetical belief ("you are calculating just damage, excluding status damage") must be
  confirmed or corrected explicitly, not silently assumed either way.

## WI-007
- **Ask** (verbatim): The above singlular DPS number needs to have a bar with a slider to update the
  DPS throughout the battle. I believe the number will be the same as the DPS Over Time graph #2.
- **Type**: behavior change
- **Done means**: a slider scrubs through battle time and the headline DPS number updates to that
  moment's value, consistent with the DPS-over-time chart.

## WI-008
- **Ask** (verbatim): why does DPS suddenly take off at 15 seconds?
- **Type**: question to answer
- **Done means**: a concrete, evidenced explanation recorded in a design artifact — not a task to
  investigate it.

## WI-009
- **Ask** (verbatim): Cobrex has a cooldown of 15s, but its cooldown is decreased by 1s whenever an
  ally inflicts poison, we currently have 3 other mons that inflict poison that aren't being counted
  toward's Cobrex's "effective this battle"
- **Type**: bug fix (unmodelled mechanic)
- **Done means**: Cobrex's cooldown reduction from allied poison applications is modelled, or the
  reason it cannot be is recorded explicitly. Either way its "Effective this battle" must stop
  implying no allies affect it.
