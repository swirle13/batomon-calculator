import type { ReactNode } from "react";
import type { CreatureRecord, StatusEffectType } from "../../../data/types";
import { RARITY_COLORS, STAT_COLORS, type StatColorKey } from "../../../data/statColors";
import { STATUS_COLOR_KEY } from "../../../data/format";
import { displayField, isUnconfirmed } from "../../../data/display";
import { formatCooldown } from "../../../data/format";
import { TypeTag } from "../TypeTag";
import { Sprite } from "../Sprite";
import styles from "./BatomonCard.module.css";

/**
 * The one creature card, shared by the Corpus Browser and the Calculator's selected-creature panel
 * (2026-10-06 round 6, FR-028/FR-029, research.md H1).
 *
 * Both surfaces previously hand-rolled their own layout and both crammed cost, cooldown, and
 * damage onto a single `·`-separated line -- the exact thing the user asked to fix. This renders
 * the in-game card's four bands in the game's own order:
 *
 *   1. name + rarity (rarity-coloured header)
 *   2. sprite + stacked type badges
 *   3. cooldown as its OWN block, beside one colour-coded line per output stat
 *   4. ability trigger above ability description
 *
 * Shop cost deliberately leaves the stat band: it is not on the game card at all, because it is a
 * shop property rather than a battle stat. It moves to the secondary metadata row.
 */

/** One rendered output line, e.g. "Deal 25 damage" or "Poison 4". */
interface StatLine {
  key: StatColorKey;
  label: string;
}

/** `StatusEffectType` -> the published stat colour key. Shield/Heal are included; both are real
 * output stats here (data-model.md's "Shield counted as an output stat"). */
/**
 * Builds band 3's stat lines from a record. Exported so the Calculator's "Effective this battle"
 * band can render the modifier-adjusted numbers in the identical shape rather than falling back to
 * a run-on sentence (FR-028 applies to the effective values too, not only the base stats).
 */
export function buildStatLines(input: {
  damage: number | null;
  damageType: CreatureRecord["damageType"];
  appliesStatus: { type: StatusEffectType; amount: number }[] | undefined;
  healAmount?: number | null;
  multicast?: number;
  damageUnconfirmed?: boolean;
}): StatLine[] {
  const lines: StatLine[] = [];
  // An unknown damage value renders no line at all rather than "0" or "unknown damage" -- 62 of
  // 149 species still have `baseDamage: null`, so this is the common path, not an edge case
  // (research.md H9).
  if (input.damage !== null && !input.damageUnconfirmed) {
    const verb = input.damageType === "Direct" ? "Deal" : "Deal";
    lines.push({ key: "damage", label: `${verb} ${input.damage} damage` });
  }
  for (const status of input.appliesStatus ?? []) {
    lines.push({ key: STATUS_COLOR_KEY[status.type], label: `${status.type} ${status.amount}` });
  }
  if (input.healAmount != null && input.healAmount > 0) {
    lines.push({ key: "heal", label: `Heal ${input.healAmount}` });
  }
  if (input.multicast != null && input.multicast > 1) {
    lines.push({ key: "multicast", label: `Multicast ×${input.multicast}` });
  }
  return lines;
}

/** Renders band 3's right-hand column. Shared between the base and effective bands. */
export function StatLines({ lines }: { lines: StatLine[] }) {
  if (lines.length === 0) {
    return <div className={styles.noOutput}>No published per-cast output</div>;
  }
  return (
    <div className={styles.statLines}>
      {lines.map((line) => (
        <div key={`${line.key}-${line.label}`} className={styles.statLine} style={{ color: STAT_COLORS[line.key] }}>
          {line.label}
        </div>
      ))}
    </div>
  );
}

/** Renders band 3's cooldown block. Shared between the base and effective bands. */
export function CooldownBlock({ seconds }: { seconds: number | string | null }) {
  return (
    <div className={styles.cooldown}>
      <span className={styles.cooldownValue}>{seconds === null ? "—" : seconds}</span>
      <span className={styles.cooldownUnit}>sec</span>
    </div>
  );
}

interface BatomonCardProps {
  creature: CreatureRecord;
  /**
   * Optional extra band appended below the ability text -- used by the Calculator to show this
   * project's own "Effective this battle" values, which no in-game card has. The Corpus Browser
   * passes nothing, so it never inherits that band.
   */
  children?: ReactNode;
  /** Shown above the name, e.g. "Lv.3". */
  levelLabel?: string;
  /**
   * Reserve a constant outer height (FR-043). A VARIANT rather than a boolean, because the two
   * surfaces need different heights: `"panel"` is the Calculator's selected-creature card (wide,
   * with an extra "Effective this battle" band), `"browser"` is the narrower grid card.
   *
   * Round 7 deliberately left the browser unfixed, reasoning its grid already equalised rows
   * (research.md I3). The user asked for the opposite in round 8 (WI-013), so that is superseded.
   */
  fixedHeight?: "panel" | "browser";
  /**
   * Round 11 (WI-R11-001): the level/shiny bubbles, rendered in the card's `meta` band. Passed in
   * rather than built here so `BatomonCard` stays a pure presentation of a creature record — the
   * Corpus Browser renders cards for creatures that have no placement to toggle.
   */
  meta?: ReactNode;
}

export function BatomonCard({ creature, children, levelLabel, fixedHeight, meta }: BatomonCardProps) {
  const rarityColor = RARITY_COLORS[creature.rarity];
  const cooldownUnconfirmed = isUnconfirmed(creature, "baseCooldownSeconds");
  const statLines = buildStatLines({
    damage: creature.baseDamage,
    damageType: creature.damageType,
    appliesStatus: creature.appliesStatus,
    healAmount: creature.healAmount,
    multicast: creature.baseMulticast,
    damageUnconfirmed: isUnconfirmed(creature, "baseDamage"),
  });

  return (
    <article
      className={`${styles.card} ${fixedHeight === "panel" ? styles.cardFixedPanel : ""} ${fixedHeight === "browser" ? styles.cardFixedBrowser : ""}`}
      style={{ "--rarity-color": rarityColor } as React.CSSProperties}
    >
      <header className={styles.header}>
        <h3 className={styles.name}>
          {creature.name}
          {levelLabel ? <small style={{ opacity: 0.7, fontWeight: 400 }}> {levelLabel}</small> : null}
        </h3>
        <span className={styles.rarity}>{displayField(creature, "rarity", creature.rarity)}</span>
      </header>

      <div className={styles.identity}>
        <div className={styles.spriteFrame}>
          <Sprite spriteFile={creature.spriteFile} kind="monster" size={72} alt={creature.name} />
        </div>
        <div className={styles.types}>
          {creature.types.length > 0 ? (
            creature.types.map((type) => <TypeTag key={type} type={type} />)
          ) : (
            <span className={styles.noOutput}>unknown type</span>
          )}
        </div>
      </div>

      <div className={styles.output}>
        <CooldownBlock
          seconds={
            creature.baseCooldownSeconds === null || cooldownUnconfirmed
              ? null
              : formatCooldown(creature.baseCooldownSeconds)
          }
        />
        <StatLines lines={statLines} />
      </div>

      {creature.abilityText ? (
        <div className={styles.ability}>
          {creature.abilityTrigger ? <div className={styles.abilityTrigger}>{creature.abilityTrigger}</div> : null}
          <p className={styles.abilityText}>{creature.abilityText}</p>
        </div>
      ) : null}

      {children ? <div className={styles.extra}>{children}</div> : null}

      {/* The meta band, previously commented out, now carries the level/shiny bubbles (WI-R11-001). */}
      {meta ? <div className={styles.meta}>{meta}</div> : null}
    </article>
  );
}
