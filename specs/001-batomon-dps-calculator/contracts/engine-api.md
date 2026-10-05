# Contract: Simulation Engine Public API

**Feature**: [../spec.md](../spec.md) | **Data model**: [../data-model.md](../data-model.md)

This is the internal contract between `src/engine/**` and its two consumers (`src/ui/**` and
`src/engine/__tests__/**`). There is no network/HTTP boundary in this project (Constitution
Principle V) — the "contract" here is the exported function/type surface, which is still worth
freezing explicitly because Principle I requires the engine to be usable headlessly, independent of
the UI that happens to call it.

## `simulate`

```ts
function simulate(
  config: TeamConfiguration,
  corpus: Corpus,
  options?: { nowSeconds?: number } // injectable clock for deterministic tests
): SimulationResult;
```

- **Pure function**: no DOM, no React, no global mutable state. Same `(config, corpus)` input MUST
  produce byte-identical `SimulationResult` output every call (Constitution Principle I).
- **Preconditions**: `config` MUST already be valid per data-model.md's Validation rules; `simulate`
  MUST throw a typed `InvalidTeamConfigurationError` (not a silent empty result) if validation
  fails, naming the offending field.
- **Postconditions**: `SimulationResult.timeline` is sorted ascending by `tSeconds`; ties broken by
  stable slot order `[back0, back1, back2, front0, front1, front2]` (the explicit, documented
  tie-break called for in research.md B4, since the source material leaves simultaneous-event order
  unconfirmed in-game).

## `effectiveCooldown`

```ts
function effectiveCooldown(
  baseCooldownSeconds: number,
  cooldownSpeedTotal: number, // decimal, e.g. 0.20 for +20%
  positiveFlatAddedSeconds: number
): number;
```

- Implements research.md B1's formula exactly: `base / (1 + speed) + flat`, clamped to a 0.1s floor.
- MUST be unit-tested against the three worked examples in B1 before any other engine code is
  permitted to depend on it (Constitution Principle III).

## `applyStatusTick`

```ts
function applyStatusTick(
  instance: StatusEffectInstance,
  elapsedSinceLastTick: number
): { damage: number; nextInstance: StatusEffectInstance | null }; // null = fully decayed/removed
```

- Burn and Poison only — implements research.md B2's periodic-tick rule. Shock explicitly does NOT
  go through this function (see `applyShockProc` below); calling `applyStatusTick` with a Shock
  instance MUST throw, to prevent the two mechanics from being accidentally conflated.

## `applyShockProc`

```ts
function applyShockProc(
  directHit: { damage: number; damageType: "Direct" },
  shockInstance: StatusEffectInstance | null
): { shockDamage: number; orderedHits: [{ damage: number; damageType: "Shock" }, typeof directHit] } | { shockDamage: 0; orderedHits: [typeof directHit] };
```

- Implements research.md B2/B4's reactive rule: a Shock hit (if any Shock layers are present)
  resolves *before* the direct hit it is attached to, equal to current layer count; Shock itself is
  never mutated by this call (no decay) — only an explicit new application changes it.

## `applyShieldReduction`

```ts
function applyShieldReduction(
  incomingDamage: number,
  damageType: DamageType,
  shieldRemaining: number
): { damageToShield: number; damageToHp: number; shieldRemaining: number };
```

- Implements research.md B3: non-`"Direct"` damage types are reduced by the current patch's
  status-vs-shield constant (25% as of the cited patch) *before* absorption; `"Direct"` damage is
  not reduced. The reduction percentage MUST be imported from a single named, patch-tagged constant
  (`STATUS_VS_SHIELD_REDUCTION`, defined alongside its own `Provenance`), never hardcoded at the
  call site, because this value has already changed twice in the game's history (B3).

## Error types

```ts
class InvalidTeamConfigurationError extends Error {
  constructor(public readonly field: string, message: string);
}
```

## Non-goals (explicitly not part of this contract)

- No two-sided battle resolver (shared-HP-pool PvP resolution) — see spec.md Assumptions. `simulate`
  runs the user's team against a configurable idealized target only.
- No shop/merge economy simulation (research.md B6) — `CreatureRecord.level` is read, not computed.
