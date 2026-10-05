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
