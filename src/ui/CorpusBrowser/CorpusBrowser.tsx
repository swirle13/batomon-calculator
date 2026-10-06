import { useMemo, useState } from "react";
import { corpus, distinctCreatures, filterCreatures, searchCreatures } from "../../data/corpus";
import { displayField, isUnconfirmed } from "../../data/display";
import type { CreatureType, Rarity } from "../../data/types";
import { TypeTag } from "../shared/TypeTag";

const TYPES: CreatureType[] = [
  "Fire", "Water", "Electric", "Toxic", "Flying", "Rock", "Grass", "Bug",
  "Steel", "Dragon", "Ghost", "Fighting", "Curio", "NULL", "All",
];
const RARITIES: Rarity[] = ["Common", "Uncommon", "Rare", "SuperRare", "Legendary", "Mythical"];

/**
 * User Story 3: search/filter the corpus (FR-013) and show full cited detail, including any
 * recorded source conflicts, per entry (FR-004, SC-004).
 *
 * As of the tasks.md T043 widening pass (2026-10-05), this covers the full 149-name roster
 * reconciled from the fan-wiki sources reviewed — see src/data/creatures.ts's header comment
 * for exactly which fields are fully sourced vs. still `unconfirmedFields` per entry. Fields
 * listed in an entry's `unconfirmedFields` are rendered as "unknown" below rather than a
 * possibly-misleading raw value (data-model.md: "shown as 'unknown' in the UI").
 */
export function CorpusBrowser() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<CreatureType | "">("");
  const [rarity, setRarity] = useState<Rarity | "">("");

  const results = useMemo(() => {
    const byQuery = searchCreatures(query);
    const byFilter = filterCreatures({ type: type || undefined, rarity: rarity || undefined });
    const filterIds = new Set(byFilter.map((c) => c.id));
    return byQuery.filter((c) => filterIds.has(c.id));
  }, [query, type, rarity]);

  return (
    <div>
      <h2>Corpus Browser</h2>
      <p>
        <em>
          {distinctCreatures.length} creatures (each with up to 4 level records, round 5),{" "}
          {corpus.trainers.length} trainer(s), {corpus.trinkets.length} trinket(s),{" "}
          {corpus.items.length} item(s). Nearly all creature stats are now confirmed per level
          (round 5) — see each entry's "Unconfirmed" line for the few remaining exceptions.
        </em>
      </p>

      <p>
        <label>
          Search:{" "}
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Creature name…" />
        </label>{" "}
        <label>
          Type:{" "}
          <select value={type} onChange={(e) => setType(e.target.value as CreatureType | "")}>
            <option value="">(any)</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>{" "}
        <label>
          Rarity:{" "}
          <select value={rarity} onChange={(e) => setRarity(e.target.value as Rarity | "")}>
            <option value="">(any)</option>
            {RARITIES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </p>

      {results.length === 0 && <p>No creatures match this search/filter combination.</p>}

      {results.map((c) => {
        return (
          <article
            key={c.id}
            style={{ border: "1px solid #ccc", borderRadius: 4, padding: "0.75rem", marginBottom: "0.75rem" }}
          >
            <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              {c.name}
              <small>({displayField(c, "rarity", c.rarity)})</small>
              {c.types.length > 0 ? (
                c.types.map((t) => <TypeTag key={t} type={t} />)
              ) : (
                <small>unknown type</small>
              )}
            </h3>
            <p>
              Cost ${displayField(c, "shopCost", c.shopCost)} · Cooldown{" "}
              {displayField(c, "baseCooldownSeconds", c.baseCooldownSeconds ?? "unknown")}
              {typeof c.baseCooldownSeconds === "number" && !isUnconfirmed(c, "baseCooldownSeconds") ? "s" : ""} ·
              Damage {displayField(c, "baseDamage", c.baseDamage ?? "unknown")}{" "}
              {c.damageType && !isUnconfirmed(c, "damageType") ? `(${c.damageType})` : ""}
            </p>
            {c.appliesStatus && c.appliesStatus.length > 0 && (
              <p>Applies: {c.appliesStatus.map((s) => `${s.amount} ${s.type}`).join(", ")}</p>
            )}
            <p>{c.abilityText}</p>
            {c.unconfirmedFields && c.unconfirmedFields.length > 0 && (
              <p>
                <strong>Unconfirmed:</strong> {c.unconfirmedFields.join(", ")}
              </p>
            )}
            {c.evolvesInto && (
              <p>
                Evolves into: <code>{c.evolvesInto}</code>
              </p>
            )}
            <details>
              <summary>Sources &amp; patch ({c.patch})</summary>
              <ul>
                {c.sourceRefs.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>{" "}
                    (retrieved {s.retrievedAt})
                  </li>
                ))}
              </ul>
            </details>
            {c.conflicts && c.conflicts.length > 0 && (
              <details>
                <summary>⚠ Recorded source conflicts ({c.conflicts.length})</summary>
                <ul>
                  {c.conflicts.map((conflict) => (
                    <li key={conflict.field}>
                      <strong>{conflict.field}</strong>:{" "}
                      {conflict.values.map((v, i) => (
                        <span key={i}>
                          {String(v.value)} ({v.sourceRefs.map((s) => s.title).join(", ")})
                          {i < conflict.values.length - 1 ? "; " : ""}
                        </span>
                      ))}
                      {conflict.resolution && <div>Resolution: {conflict.resolution}</div>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        );
      })}
    </div>
  );
}
