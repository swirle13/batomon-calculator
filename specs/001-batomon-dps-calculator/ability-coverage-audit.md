# Ability coverage audit — what the engine still does not model

**Dated 2026-10-08**, taken immediately after the knockout/revive pairing (Shikitsune, Rattleghast)
landed. Nothing here is scheduled; this is the inventory, not a plan.

## How to regenerate the raw list

```
npx vite-node scripts/audit-coverage.mjs
```

The script prints the headline counts and then every creature in the gap, with its trigger and its
published text. The script's list is the fact; the **grouping below is judgement** and has to be
redone by hand when the list changes. Keeping those two things apart is deliberate — the last time
a coverage figure was quoted from a one-off probe it was wrong by a factor of three
(`scripts/audit-coverage.mjs`'s own header tells that story).

## Where coverage stands

Level-1 species only, since levels 2–4 repeat the same abilities at bigger numbers.

| | count |
|---|---|
| species with a battle-relevant ability | 134 |
| resolved by the engine | 24 |
| banked by a button on the card (trigger fires between battles) | 10 |
| **the gap** | **95** |

The gap is not one problem. Grouped by what is actually blocking each one:

| | family | count |
|---|---|---|
| A | chain a cast off another creature | 14 |
| B | charge an ally's cooldown | 4 |
| C | scale off team or ally stats | 17 |
| D | read the enemy's state | 3 |
| E | knockout, the parts still outstanding | 9 |
| F | shop / run economy | 29 |
| G | evolution and run progress | 7 |
| H | a mechanic the engine has no concept of | 10 |
| I | not an ability at all — denominator defect | 2 |

F and G together are 36 of the 95, and nearly all of them are outside what a battle simulator can
ever answer. The tractable work is A, B, C and E: **44 species, and most of them are blocked by
something narrower than "we have not built it".**

---

## A. Chain a cast off another creature — 14

Cicadence, Draconarch, Dryadell, Coalem, Frizzly, Gachapod, Gemwing, NULL-FF, Opalion, Pompummel,
Rhizuka, Sarudo, Snapscald, Torrantler

The machinery mostly exists: `triggerOnAllyCast` and `triggerOnAllyTrigger` are both resolved, and
`simulate()` already caps chain depth with `MAX_CHAIN_DEPTH`. What is missing is the other
direction — "**I** trigger **you**", rather than "I fire when you do" — which no tag expresses.

Three sub-shapes, which probably want three tags rather than one:

- **Trigger an ally**, by selector: Cicadence (Bug ally above), Dryadell (Grass ally above),
  Torrantler (adjacent Water allies), Opalion (1 random Rock ally), NULL-FF (this and the row).
- **Trigger self**, unconditionally at battle start: Coalem, Frizzly. The cheapest two in the whole
  audit — one extra cast at t=0.
- **Activate a named trigger on an ally**: Draconarch (On Battle Start of adjacent allies, plus +6s
  to its own cooldown), Gemwing (On Bought of the ally above), Pompummel and Sarudo (On Victory).
  These reach into triggers the engine deliberately does not fire, so they are the hardest of the
  three and arguably belong with F.

**Data defect:** Gachapod's `abilityText` is the single fragment `"When this triggers,"`. The
sentence is truncated in the corpus. Fix the record before modelling anything from it.

## B. Charge an ally's cooldown — 4

Clawnetic, Dracana, Ironcore, Steamscuttle

`chargeOnAllyStatus` already resolves Cobrex's "whenever an ally inflicts Poison, charge this by 1
second", and `ResolvedPlacement.chargeRules` already carries it into the simulation.

- **Clawnetic is the same tag with `Shock` in place of `Poison`.** It is untagged for no reason
  anyone recorded — a one-line corpus change, the cheapest item in this document.
- Dracana, Ironcore and Steamscuttle charge *outward* ("charge adjacent Electric allies by 1
  second, Ironcore can't receive charge"). That needs a charge-on-own-cast rule pointed at a
  selector, plus a no-self-charge flag the text states explicitly in all three cases.

## C. Scale off team or ally stats — 17

Aegistruct, Blixie, Boomagon, Brimtoad, Cairnage, Gaiadrasil, Galvanine, Geminiss, Lignite,
Lumijel, Oniclaw, Orcana, Pylong, Quillustrous, Stalagrove, Stellagon, Talonite

This is the family where the engine is *closest* and the blockers are most specific. Each of these
is one small widening away, and the widenings are mostly shared:

- **`ongoingGrant` only emits a single flat stat.** Brimtoad (+4 Burn **and** +4 Poison), Lumijel
  (+15 Damage and +15 Heal), Talonite (+20 Shield per Rock ally **and** +1 Multicast per Flying
  ally). All three are refused by `deriveTags.ts`'s `effects.length !== 1` guard, not by anything
  about the engine. Allowing a rule to emit several tags unblocks all three.
- **No percentage grants.** `EffectDescriptor.statChange` carries flat amounts only, so Pylong
  ("+100% Shock" to the ally behind), Geminiss ("+50% Shield" to adjacent allies), Oniclaw ("+50%
  Damage this battle") and Galvanine ("+50% Cooldown Speed … for this battle") have nowhere to be
  written. `statMultiplier` exists but targets a creature's own line, not a grant.
- **Cooldown Speed cannot be granted through `applyEffect`** — it is excluded on purpose, because
  `simulate()` sums `cooldownSpeedModifier` separately and resolving it in both places double
  counts. Boomagon is blocked purely by that. The revive bonus added on 2026-10-08
  (`ResolvedPlacement.cooldownSpeedGrant`) is the pattern for fixing it properly: a field the
  resolver owns, distinct from the tag `simulate()` owns.
- **`statFromStat` reads a pool and grants to self.** Aegistruct, Gaiadrasil and Quillustrous fit
  that exactly and are probably taggable today. Cairnage inverts it ("**allies** gain Damage equal
  to 0.8× **their** Shield" — per-recipient, not pooled) and needs a per-target variant.
- **Self-stat scaling has no tag.** Lignite: "additional Damage equal to 20 times this monster's
  Burn."
- **Missing selector filters.** Stellagon targets "adjacent allies **with no abilities**" —
  `SelectorFilters` has type, rarity and level, but no "has no ability" predicate, even though
  `hasAbilityText` already answers it.
- Orcana ("+160 Damage and Heal for each ally of level 3 or above") is `statFromCount` with
  `minLevelFilter`, which exists — blocked only by the multi-stat issue above.
- Blixie ("give the Fire ally behind **this monster's** Burn") and Stalagrove ("when you receive
  shield, gain Damage equal to 15% of the amount shielded") are one-offs; neither has a family.

## D. Read the enemy's state — 3

Cinnabark, Omnichrome, Ouroblaze

The engine simulates against an idealised target with no stat line and no incoming effects
(spec.md Assumptions). `statFromTargetStatus` already covers "Damage equal to N% of the Poison on
the enemy" (Fumungus), but it only writes **Damage** — Cinnabark wants Shield and Ouroblaze wants
Burn, both from enemy stacks. Those two are a small widening of an existing tag.

Omnichrome ("gain 80% of the stats of the enemy monster with the highest stats") needs a modelled
enemy board and is correctly listed as permanently out of scope in `corpus.ts`.

## E. Knockout, the parts still outstanding — 9

Danuki, Dirgefin, Electranade, Nekoffin, NULL-7F, Pyronade, Reapra, Stingarde, Vengrieve

2026-10-08 closed the half that is decidable before the fight starts: a creature knocking out its
own neighbours by position (Petrirex, Rattleghast) and Shikitsune reviving them. What is left
splits cleanly:

- **Self-knockout — the obvious next step, and it pairs with what just shipped.** Electranade,
  Pyronade and Stingarde all read "Knockout self" with an On Cast trigger: they cast once (applying
  Shock 25 / Burn 20), then die. That is fully decidable — one cast, then removal from the
  schedule — and it feeds Shikitsune directly, since a self-knocked-out ally is exactly the kind of
  corpse a reviver is bought for. Doing this without the revive interaction would be a mistake;
  doing both is a single coherent change.
- **Danuki** ("on ally knockout, this gains 70% of their Damage for this battle") becomes
  computable the moment self-knockouts exist, because there would finally be an ally knockout to
  observe. It is currently inert for lack of an event, not for lack of a tag.
- **Enemy-side knockouts** — Reapra, NULL-7F, Vengrieve, Dirgefin — need an enemy board with
  individual monsters on it. Same blocker as D.
- **Nekoffin** fires On Knocked Out and grants a trinket, which is family F wearing a knockout
  costume.

## F. Shop / run economy — 29

Aviarab, Berroon, Blessom, Cinderfly, Cordycant, Cosmivore, Dragon Egg, Faebloom, Furnadon,
Gildshell, Goldora, Kappow, Kindlepot, Leafleap, Mallogre, MissingN., Pawsperity, Plunderbird,
Purple Egg, Riglet, Rigalord, Rubbin, Shogapede, Shrinell, Sproach, Swoonet, Tengusto, Toximoth,
Wishwash

These depend on run state the calculator does not have: gold, shop contents, rerolls, trinkets
owned, badges, lives lost, days elapsed. **Most should not be modelled at all** — but a subset is
reachable through the existing manual-trigger button rather than the simulation:

- Already-shaped triggers that are merely untagged: Cinderfly and Shogapede ("after you buy a Bug
  monster, this gains +10% Cooldown Speed") are the same shape as Guardiant, which has a button.
  Sproach ("+30 Damage permanently for each life lost this run") is a self-grant with a count the
  user knows and the engine does not — a number input beside the button would cover it.
- Counted-possession scaling — Furnadon and Shrinell (per Trinket owned), Mallogre (per Trinket),
  Tengusto (per Badge), Faebloom (per Mythical Item used) — is the same missing input four times
  over. One "how many do you own?" control would unblock all of them.
- The rest (eggs, Rigalord's devour-and-spawn, MissingN.'s rarity transform, trinket grants) change
  the board's composition and are out of scope for a within-battle calculator.

## G. Evolution and run progress — 7 — **FIXED 2026-10-08**

Beetdown, Emberpaw, Fernfowl, Flarilisk, Ignit, Pipskull, Sproutquill

Not battle effects (research.md B6). `abilityNeedsModelling` excluded the plain
`"Evolves at level N."` phrasing but not these variants — "Evolve after your team deals 15000
non-status Damage", "Evolve when your team inflicts Burn 25 times", "Evolve." on On Victory.

**These were denominator defects, not gaps.** All 7 are now excluded: the function judges sentence
by sentence and treats any sentence opening with `evolve`/`evolution result of` as progression.
Anchored at the sentence start, so Rigalord's "devour the ally in front and evolve into Rigalord"
stays counted — that one is a real gap.

## H. A mechanic the engine has no concept of — 10

Aerophim, Bunchop, Celestia, Cherubble, NULL-00, Runerock, Shelldra, Shellter, Sirenade, Tsunamere

Each needs something new in the model, and they are listed together only because they share that
property:

- **No HP system**: Bunchop ("your team has +50 HP").
- **No Protect status**: Cherubble ("give adjacent allies Protect 1").
- **No debuffs on your own team**, so nothing to remove: Runerock, Sirenade.
- **No ability-disabling**: Celestia ("disable abilities of all Ongoing monsters in this row").
- **No flat cooldown grant to a target**: NULL-00 ("+3 Cooldown to allies and enemies in this
  row"). `cooldownFlatAddSeconds` exists as a `ModifierStat` but has no `EffectDescriptor` slot —
  see the closing note in `deriveTags.ts`'s `EFFECT_FOR_STAT`.
- **No periodic self-effect**: Shelldra ("every 4 seconds, +1 Multicast for this battle") is a
  second clock running beside the cast clock.
- **No negative self-grant**: Shellter ("-20 Shield for this battle").
- **No in-battle level-up**: Tsunamere ("level up all adjacent allies for this battle, max 3").
  A placement's level is fixed at lookup time, so there is no way to swap a creature onto its
  level-3 record partway through.
- **Transformation**: Aerophim. Out of scope, same as MissingN.

## I. Not an ability at all — 2 — **FIXED 2026-10-08**

Bumblebolt, Scorchimp

`"Deals 3 direct damage every 2.5 seconds and applies 1 Shock"` restates `publishedCast`,
`baseCooldownSeconds` and `appliesStatus` — the engine already computes every word of it. The same
goes for Scorchimp.

`abilityNeedsModelling` caught the `"Applies N <Status> per cast"` phrasing and missed this one,
so both creatures were reported to the user as unmodelled next to a DPS figure that is entirely
correct for them. That is precisely the failure mode the function was written to prevent, and
Bumblebolt is a starter Common, so it shows up on a lot of boards.

Now handled by stripping each claim the sentence makes — "deals N damage", "applies N `<Status>`",
"every N seconds" — but only where it MATCHES the record, and asking whether anything but joining
words is left. Claim-by-claim rather than per-phrasing, because the two records above state the
same three facts in different orders.

Bumblebolt's trailing editorial aside — `'"The poster Common: 2.5s, Shock, cheap."'` — is excluded
as a fully-quoted sentence. The corpus text is left faithful to the game rather than edited.

---

## If the list were to be worked, the order the evidence suggests

Nothing below is committed work. It is the ordering the audit implies, recorded so the reasoning
does not have to be redone.

1. **Denominator defects (I, G — 9 species).** No engine change; they stop the UI making false
   claims about boards that are already computed correctly. Cheapest honest improvement available.
2. **Untagged creatures whose tag kind already resolves.** Clawnetic (B) and the Aegistruct /
   Gaiadrasil / Quillustrous group (C). Corpus edits against machinery that already works.
3. **Self-knockout plus Danuki (E — 4 species).** Directly extends the pairing that shipped on
   2026-10-08, and Shikitsune's value is understated until it exists.
4. **Multi-stat grants and percentage grants (C).** Two vocabulary widenings that between them
   unblock roughly nine species, including the three the double-count guard currently refuses.
5. **Trigger-an-ally (A — the first two sub-shapes, 7 species).** Real work, but the chain-depth
   cap and the ally-cast hook are already built.

Everything else — an enemy board, an HP system, run economy — is a decision about the product's
scope rather than a backlog item, and should be taken as one.
