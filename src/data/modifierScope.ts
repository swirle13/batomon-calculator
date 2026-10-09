import { ModifierScope } from "./enums";
import type { StatModifier } from "./types";

/**
 * Reading a modifier's scope, in the one place that knows what an absent one means.
 *
 * `scope` is optional on `StatModifier` because every modifier written before the field existed —
 * and every one in a build code shared before it existed — has none. Defaulting at each read site
 * would put the same `?? Creature` in the context, the share importer and anything added later,
 * which is exactly how two of them end up disagreeing.
 */
export function scopeOf(modifier: Pick<StatModifier, "scope">): ModifierScope {
  return modifier.scope ?? ModifierScope.Creature;
}

/** Belongs to the monster: travels with it, and is discarded when another monster takes the slot. */
export function isCreatureScoped(modifier: StatModifier): boolean {
  return scopeOf(modifier) === ModifierScope.Creature;
}

/** Belongs to the position: stays behind when the monster moves, and transfers to its replacement. */
export function isSlotScoped(modifier: StatModifier): boolean {
  return scopeOf(modifier) === ModifierScope.Slot;
}
