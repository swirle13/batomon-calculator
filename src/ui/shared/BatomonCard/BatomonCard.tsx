import type { ReactNode } from "react";
import type { CreatureRecord } from "../../../data/types";
import { RARITY_COLORS, STAT_COLORS, rarityLabel, type StatColorKey } from "../../../data/statColors";
import { STATUS_COLOR_KEY } from "../../../data/format";
import { displayField, hasAbilityText, isUnconfirmed } from "../../../data/display";
import type { ModifierStat, PerCastOutput, StatModifier, StatusEffectType } from "../../../data/types";
import { formatCooldown } from "../../../data/format";
import { applyModifiers } from "../../../engine/modifiers";
import { AllTypeTag, TypeTag } from "../TypeTag";
import { CreatureSprite } from "../CreatureSprite";
import styles from "./BatomonCard.module.css";
import { isWildcardType } from "../../../data/vocabularies";

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
/**
 * A creature's published output, plus the user's own manual modifiers.
 *
 * ## Why modifiers belong in the BASE figure, not only in "Effective this battle"
 *
 * A modifier is how you record something the engine has no trigger for — a carry-over bonus from
 * an earlier round, an On Victory grant, a buff the run already applied. Once entered, it is part
 * of what the creature *is*; it is not something the battle does to it. Showing Craghorn's card as
 * "Deal 20" with a separate band reading "Deal 40" invites you to hunt for a battle effect that
 * does not exist — the 20 came from you.
 *
 * The grid chips already worked this way. The card did not, which is the inconsistency this fixes,
 * and the arithmetic now lives here rather than in both places.
 *
 * "Effective this battle" keeps its own job: the difference the *battle* makes — ally auras,
 * resolved abilities, trinkets. With only manual modifiers in play the two now agree, so the band
 * correctly hides.
 */
export function perCastOutputOf(
  creature: CreatureRecord,
  modifiers?: StatModifier[],
): PerCastOutput {
  const sum = (stat: ModifierStat) =>
    (modifiers ?? []).filter((m) => m.stat === stat).reduce((total, m) => total + m.amount, 0);

  const statusAdd: Record<StatusEffectType, number> = {
    Burn: sum("burnAmountAdd"),
    Poison: sum("poisonAmountAdd"),
    Shock: sum("shockAmountAdd"),
    Shield: sum("shieldAmountAdd"),
  };

  // Shared with the engine so the card and the simulation cannot disagree about what a modifier
  // does. This is also where "a modifier may CREATE an effect" lives -- see engine/modifiers.ts.
  const output = applyModifiers(
    {
      damage: creature.baseDamage,
      damageType: creature.damageType,
      appliesStatus: creature.appliesStatus ?? [],
      baseMulticast: creature.baseMulticast,
      heal: creature.healAmount ?? null,
    },
    { damageFlatAdd: sum("damageFlatAdd"), multicastAdd: sum("multicastAdd"), status: statusAdd },
  );

  return { ...output, damageUnconfirmed: isUnconfirmed(creature, "baseDamage") };
}

export function buildStatLines(input: PerCastOutput): StatLine[] {
  const lines: StatLine[] = [];
  // An unknown damage value renders no line at all rather than "0" or "unknown damage" -- 62 of
  // 149 species still have `baseDamage: null`, so this is the common path, not an edge case
  // (research.md H9).
  if (input.damage !== null && !input.damageUnconfirmed) {
    const verb = input.damageType === "Direct" ? "Deal" : "Deal";
    lines.push({ key: "damage", label: `${verb} ${input.damage} damage` });
  }
  for (const status of input.appliesStatus) {
    lines.push({ key: STATUS_COLOR_KEY[status.type], label: `${status.type} ${status.amount}` });
  }
  if (input.heal != null && input.heal > 0) {
    lines.push({ key: "heal", label: `Heal ${input.heal}` });
  }
  if (input.multicast > 1) {
    lines.push({ key: "multicast", label: `Multicast ×${input.multicast}` });
  }
  return lines;
}

/**
 * Four or more output lines spill into a second column rather than making the band taller
 * (2026-10-07, WI-003). See `.statLinesTwoColumn` for why the threshold is 4 and why this is a grid
 * rather than `columns: 2`.
 */
const TWO_COLUMN_FROM = 4;

/** Renders band 3's right-hand column. Shared between the base and effective bands. */
export function StatLines({ lines }: { lines: StatLine[] }) {
  if (lines.length === 0) {
    return <div className={styles.noOutput}>No published per-cast output</div>;
  }
  const twoColumn = lines.length >= TWO_COLUMN_FROM;
  return (
    <div
      className={`${styles.statLines} ${twoColumn ? styles.statLinesTwoColumn : ""}`}
      // The row count is what makes the first column fill before the second, and the only part of
      // this that jsdom can see — layout it does not do, an inline custom property it does.
      style={twoColumn ? ({ ["--stat-rows" as string]: Math.ceil(lines.length / 2) } as React.CSSProperties) : undefined}
    >
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
   * Round 7 deliberately left the browser unfixed, reasoning its grid already equalized rows
   * (research.md I3). The user asked for the opposite in round 8 (WI-013), so that is superseded.
   */
  fixedHeight?: "panel" | "browser";
  /**
   * Round 11 (WI-R11-001): the level/shiny bubbles, rendered in the card's `meta` band. Passed in
   * rather than built here so `BatomonCard` stays a pure presentation of a creature record — the
   * Corpus Browser renders cards for creatures that have no placement to toggle.
   */
  meta?: ReactNode;
  /** True when Painter has painted this species this run (T236/FR-092). */
  painted?: boolean;
  /** The user's own manual modifiers for this placement — folded into the displayed stats. */
  modifiers?: StatModifier[];
}

export function BatomonCard({ creature, children, levelLabel, fixedHeight, meta, painted, modifiers }: BatomonCardProps) {
  // Painted species and natively-"All" species render identically — they mean the same thing
  // in-game and differ only in provenance (run configuration vs corpus data).
  //
  // `painted` is a PROP, not read from context here. `BatomonCard` is shared with the Corpus
  // Browser, which renders creatures outside any team and has no `TeamConfigProvider`; reading
  // context inside the card coupled a pure presentation component to run state and broke every
  // browser test. Callers that know about a run pass it; callers that do not, do not.
  const isAllType = creature.types.some(isWildcardType) || painted === true;
  const rarityColor = RARITY_COLORS[creature.rarity];
  const cooldownUnconfirmed = isUnconfirmed(creature, "baseCooldownSeconds");
  const statLines = buildStatLines(perCastOutputOf(creature, modifiers));

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
        <span className={styles.rarity}>{displayField(creature, "rarity", rarityLabel(creature.rarity))}</span>
      </header>

      <div className={styles.identity}>
        <div className={styles.spriteFrame}>
          <CreatureSprite
            spriteFile={creature.spriteFile}
            /* 96 = 2x the source art. 72 was 1.5x, which renders unevenly under
               `image-rendering: pixelated` — see the note in Sprite.tsx. */
            size={96}
            alt={creature.name}
            painted={isAllType}
          />
        </div>
        <div className={styles.types}>
          {/* T236/FR-092: an all-type creature gets ONE rainbow chip, never one chip per type. */}
          {isAllType ? (
            <AllTypeTag />
          ) : creature.types.length > 0 ? (
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

      {hasAbilityText(creature.abilityText) ? (
        <div className={styles.ability}>
          {creature.abilityTrigger ? <div className={styles.abilityTrigger}>{creature.abilityTrigger}</div> : null}
          <p className={styles.abilityText}>{creature.abilityText}</p>
        </div>
      ) : null}

      {children ? <div className={styles.extra}>{children}</div> : null}

      {/* {meta ? <div className={styles.meta}>{meta}</div> : null} */}
      <div className={styles.meta}>{meta}</div>
    </article>
  );
}
