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
 * Whether a record's ability text is real, as opposed to a placeholder standing in for text we
 * never sourced.
 *
 * The corpus carries two placeholder strings — `"No ability text shown"` and `"No ability text
 * transcribed in sources reviewed."` — across 53 records. They are deliberately stored rather than
 * left empty, because "we looked and found nothing" is different from "nobody has looked". But
 * they must never reach the UI, where they read as if the creature has an ability called
 * "No ability text shown".
 *
 * Centralised because the same regex already existed in `effects.ts` (deciding what counts as an
 * unmodelled ability) and `scripts/audit-coverage.mjs` (deciding the coverage denominator). A third
 * copy in the card would have been three definitions of one concept, free to drift apart.
 */
export function hasAbilityText(abilityText: string | undefined | null): boolean {
  if (!abilityText?.trim()) return false;
  return !/^no ability text/i.test(abilityText.trim());
}
