import type { CreatureRecord } from "./types";

/**
 * Shared helper so every UI surface renders `unconfirmedFields` the same way (data-model.md:
 * "shown as 'unknown' in the UI") instead of a possibly-misleading raw `null`/`0`.
 */
export function isUnconfirmed(record: Pick<CreatureRecord, "unconfirmedFields">, field: string): boolean {
  return (record.unconfirmedFields ?? []).includes(field);
}

export function displayField(
  record: Pick<CreatureRecord, "unconfirmedFields">,
  field: string,
  value: string | number,
): string | number {
  return isUnconfirmed(record, field) ? "unknown" : value;
}

/**
 * Whether a record's ability text is real, as opposed to absent.
 *
 * The corpus spells "this creature has no ability" as an empty `abilityText`. It previously stored
 * two placeholder sentences instead — `"No ability text shown"` and `"No ability text transcribed
 * in sources reviewed."` — to distinguish "we looked and found nothing" from "nobody has looked",
 * but that distinction already lives in `unconfirmedFields` and `sourceRefs`, where the engine and
 * the UI can read it; as prose it only risked rendering as an ability named after the placeholder.
 * Both phrasings are still rejected here, so a reverted record cannot reach the UI.
 *
 * Centralised because the same regex already existed in `effects.ts` (deciding what counts as an
 * unmodelled ability) and `scripts/audit-coverage.mjs` (deciding the coverage denominator). A third
 * copy in the card would have been three definitions of one concept, free to drift apart.
 */
export function hasAbilityText(abilityText: string | undefined | null): boolean {
  if (!abilityText?.trim()) return false;
  return !/^no ability text/i.test(abilityText.trim());
}

/**
 * Whether a creature has an ability the engine *should* be computing.
 *
 * The distinction matters because the coverage counter sits next to a DPS figure, where "0 of 3
 * abilities modelled" reads as "this number is 0% trustworthy". For a team of Venopuff, Magmite and
 * Dribblet that was badly wrong: the DPS was entirely correct, because **none of the three has an
 * ability that needs modelling at all**.
 *
 * Three kinds of record have nothing to model, and counting them as gaps overstates the gap:
 *
 * | case | example | why |
 * |---|---|---|
 * | no ability text | Magmite — `abilityText: ""` | there is no ability |
 * | evolution-only | Dribblet — `"Evolves at level 3."` | not a battle effect (research.md B6) |
 * | restates base stats | Venopuff — `"Applies 4 Poison per cast"` against `appliesStatus` Poison 4 | already computed from the stat line |
 *
 * Corpus-wide that is 14 + 4 + 1 of 149. Small, but concentrated: a low-rarity team can easily be
 * made entirely of them, which is exactly the board that produced the misleading 0/3.
 */
export function abilityNeedsModelling(creature: {
  abilityText?: string;
  appliesStatus?: { type: string; amount: number }[];
}): boolean {
  const text = creature.abilityText?.trim() ?? "";
  if (!hasAbilityText(text)) return false;
  if (/^evolves at level \d+\.?$/i.test(text)) return false;

  // "Applies N <Status> per cast" where the creature already applies exactly that: the text is a
  // description of the stat line, not an additional effect. This is the same class of redundancy
  // that produced 16 double-counting tags in round 10.
  const restated = /^Applies (\d+) (\w+) per cast/i.exec(text);
  if (
    restated &&
    (creature.appliesStatus ?? []).some(
      (s) => s.type.toLowerCase() === restated[2]!.toLowerCase() && s.amount === Number(restated[1]),
    )
  ) {
    return false;
  }

  return true;
}
