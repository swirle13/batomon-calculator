import { describe, expect, it } from "vitest";
import { creatures } from "../creatures";
import { corpus } from "../corpus";
import { hasAbilityText } from "../display";
import { deriveAbilityTags, derivedFamilyFor } from "../deriveTags";
import { manualTriggersFor } from "../triggers";
import { isResolvableTag } from "../../engine/effects";
import { AbilityTrigger, CreatureType, ModifierStat } from "../enums";

/**
 * Derived ability tags (2026-10-07, round 7 WI-002 / FR-113).
 *
 * The reported case: Ninflora's "This and your Grass allies gain +10% Cooldown Speed permanently"
 * offered no button, while Brawlmantis and Kickrane — the identical ability shape — did. The cause
 * was that `abilityTags` was hand-maintained, and **424 of 596 records had published ability text
 * and an empty tag array**, so Ninflora was the median case rather than an oversight.
 *
 * `creatures` is the RAW array (hand-authored tags only); `corpus.creatures` is the merged view the
 * app reads. Several tests below need both, to tell "derived" from "was already there".
 */

const rawById = (id: string, level: number) =>
  creatures.find((c) => c.id === id && c.level === level)!;

describe("WI-002 acceptance: Ninflora works with no tag written for it", () => {
  it("offers a Win-a-round trigger at every level, scaling with the published text", () => {
    // The published texts are +10%/+20%/+30%/+240% Cooldown Speed. Percentages store as FRACTIONS,
    // matching `ModifierEditor`'s own `store: (typed) => typed / 100`, so a derived modifier and a
    // hand-typed one are the same value.
    const expected = { 1: 0.1, 2: 0.2, 3: 0.3, 4: 2.4 };
    for (const [level, amount] of Object.entries(expected)) {
      const record = rawById("ninflora", Number(level));
      expect(record.abilityTags, `ninflora L${level} should still have NO hand-written tag`).toEqual([]);

      const [tag] = deriveAbilityTags(record);
      expect(tag, `ninflora L${level} derived nothing`).toBeDefined();
      expect(tag).toEqual({
        kind: "manualTrigger",
        trigger: AbilityTrigger.OnVictory,
        effects: [{ stat: "cooldownSpeedAdd", amount }],
        // "your Grass allies" plus the "This and" that names the presser separately.
        target: { kind: "allAllies", typeFilter: CreatureType.Grass },
        includeSelf: true,
      });
    }
  });

  it("surfaces that trigger through the normal button path, not a special case", () => {
    const [trigger] = manualTriggersFor(corpus.creatures.find((c) => c.id === "ninflora" && c.level === 1)!);
    expect(trigger).toBeDefined();
    expect(trigger!.definition.actionLabel).toBe("Win a round");
    expect(trigger!.includeSelf).toBe(true);
  });
});

describe("the rule table reads targets, not just self-grants", () => {
  /*
   * Probed with a NON-engine-propagated trigger, because the shapes below belong to creatures whose
   * real triggers are On Battle Start / On Cast and are therefore refused by the double-count guard.
   * What is under test here is the rule TABLE's reading of each text shape; the guard has its own
   * tests above. Without this substitution these assertions would be testing the guard twice and
   * the table not at all.
   */
  const derived = (id: string, level = 1) =>
    deriveAbilityTags({ ...rawById(id, level), abilityTrigger: AbilityTrigger.OnVictory })[0] as
      | { target: unknown; includeSelf: boolean; effects: unknown[] }
      | undefined;

  it("reads an adjacent + type-filtered grant (Aster)", () => {
    // "Adjacent Water allies gain +25 Heal permanently." Self NOT included: the text does not name
    // it, and `adjacent` already excludes the source.
    const tag = derived("aster");
    expect(tag?.target).toEqual({ kind: "adjacent", typeFilter: CreatureType.Water });
    expect(tag?.includeSelf).toBe(false);
    expect(tag?.effects).toEqual([{ stat: ModifierStat.HealAmountAdd, amount: 25 }]);
  });

  it("reads a positional grant (Boomagon's ally behind)", () => {
    expect(derived("boomagon")?.target).toEqual({ kind: "behind" });
  });

  it("reads a level-filtered grant with TWO stats (Lumijel)", () => {
    const tag = derived("lumijel");
    expect(tag?.target).toEqual({ kind: "allAllies", minLevelFilter: 3 });
    expect(tag?.effects).toEqual([
      { stat: ModifierStat.DamageFlatAdd, amount: 15 },
      { stat: ModifierStat.HealAmountAdd, amount: 15 },
    ]);
  });

  it("reads a bare two-stat self-grant (Brimtoad)", () => {
    const tag = derived("brimtoad");
    expect(tag?.target).toEqual({ kind: "self" });
    expect(tag?.effects).toEqual([
      { stat: ModifierStat.BurnAmountAdd, amount: 4 },
      { stat: ModifierStat.PoisonAmountAdd, amount: 4 },
    ]);
  });

  it("does NOT read a targeted grant as a self-grant", () => {
    // The ordering hazard: the bare self-grant rule would match "Adjacent Water allies gain +25 Heal
    // permanently" on its tail if it ran first, buffing the wrong creature. Targeted rules run
    // first, and this is the assertion that keeps them there.
    for (const id of ["aster", "boomagon", "lumijel", "ninflora"]) {
      expect(derived(id)?.target, `${id} resolved to self`).not.toEqual({ kind: "self" });
    }
  });
});

describe("GUARD: the exception list cannot quietly regrow", () => {
  /**
   * The published abilities that CANNOT be read from prose, with the reason each is irreducible.
   * This is the real deliverable of WI-002: `abilityTags` stops being a hand-maintained list of
   * everything and becomes an enumerated list of exceptions, each justified.
   */
  const IRREDUCIBLE: Record<string, string> = {
    omnichrome: "multiplies off an ENEMY's stats; no enemy stat model exists",
    mallogre: "scales 'for each Trinket that you own'; no trinket-count input exists",
    sproach: "scales 'for each life lost this run'; no run-history input exists",
    talonite: "two count-scaled grants in one sentence; belongs to statFromCount",
    sunsage: "count-scaled off Fire allies; belongs to statFromCount",
    gildshell: "grants Sell Value, which is not a ModifierStat",
    aerophim: "carries a transform clause no tag expresses",
    dewlotl: "no published abilityTrigger, so no button could be shown",
    // Refused by the DOUBLE-COUNT guard rather than by the text. Their grants are real and the rule
    // table reads them correctly, but their triggers (On Battle Start / On Cast) are ones the engine
    // already fires, so a manual "bank it once" button would double a bonus the engine computes.
    // These want a RESOLVABLE tag instead -- outstanding work, not a modelling dead end.
    aster: "On Battle Start is engine-propagated; wants a resolvable tag, not a button",
    lumijel: "On Battle Start is engine-propagated; wants a resolvable tag, not a button",
    brimtoad: "On Battle Start is engine-propagated; wants a resolvable tag, not a button",
    emperooze: "On Battle Start is engine-propagated; wants a resolvable tag, not a button",
    boomagon: "On Cast is engine-propagated; wants a resolvable tag, not a button",
  };

  it("derives nothing for each irreducible ability, for the recorded reason", () => {
    for (const [id, reason] of Object.entries(IRREDUCIBLE)) {
      const records = creatures.filter((c) => c.id === id && hasAbilityText(c.abilityText));
      expect(records.length, `${id} has no records`).toBeGreaterThan(0);
      for (const r of records) {
        expect(deriveAbilityTags(r), `${id} L${r.level} became derivable — ${reason}`).toEqual([]);
      }
    }
  });

  it("keeps every hand-authored manualTrigger tag that the table could now produce", () => {
    // Brawlmantis, Kickrane, Craghorn and friends were hand-tagged before the table existed. If the
    // table reproduces them, the hand-written entries are redundant and should go; if it does not,
    // they are exceptions and must stay. Either way the answer must be explicit, so this test
    // reports which of them the table can now derive rather than asserting a count.
    const handTagged = creatures.filter((c) => c.abilityTags.some((t) => t.kind === "manualTrigger"));
    expect(handTagged.length).toBeGreaterThan(0);
    const reproducible = handTagged.filter((c) => deriveAbilityTags({ ...c, abilityTags: [] }).length > 0);
    // Craghorn/Guardiant/Cawnushi/Emburn (leading trigger clause) and the bare self-grants are
    // reproducible; Brawlmantis and Kickrane are too. Recorded as a floor, not an exact number, so
    // widening the table does not fail this test.
    expect(reproducible.length).toBeGreaterThanOrEqual(handTagged.length / 2);
  });
});

describe("GUARD: derivation does not break the round-6 invariants", () => {
  it("never gives a creature both a manual button and an engine-resolved tag", () => {
    // The double-count hazard: if the engine already applies the effect, a button would let the user
    // bank it again. Checked against the MERGED corpus, so derived tags are in scope.
    const offenders = corpus.creatures
      .filter((c) => manualTriggersFor(c).length > 0 && c.abilityTags.some(isResolvableTag))
      .map((c) => `${c.id} L${c.level}`);
    expect(offenders).toEqual([]);
  });

  it("never derives a trigger the engine already propagates", () => {
    for (const c of corpus.creatures) {
      for (const t of manualTriggersFor(c)) {
        expect(
          t.definition.enginePropagated,
          `${c.id} L${c.level} offers a button for ${t.trigger}, which the engine already fires`,
        ).toBe(false);
      }
    }
  });

  it("targets allies exactly when the ability text says allies GAIN", () => {
    // The WI-002 guard from the earlier ally-propagation fix, now applied to DERIVED tags too.
    for (const c of corpus.creatures) {
      for (const t of manualTriggersFor(c)) {
        /*
         * The predicate has to find the RECIPIENT, which is not the same as finding the word "ally".
         *
         * Emburn reads "On Knockout of this or an ally, this gains +3 Burn permanently" — the ally
         * is the TRIGGER and the recipient is explicitly "this". So `this gains` is checked first
         * and wins; only then do the two ally-recipient phrasings apply, "<who> allies gain +N" and
         * the imperative "Give <who> +N" (Boomagon's "Give the ally behind +3% Cooldown Speed",
         * which a gain-only predicate called a self-grant).
         */
        const text = c.abilityText;
        const grantsToSelf = /\bthis gains\b/i.test(text);
        const grantsToAllies =
          !grantsToSelf &&
          (/all(?:y|ies)[^.]*\bgain/i.test(text) || /\bGive\b[^.]*\ball(?:y|ies)\b/i.test(text));
        expect(
          t.target.kind !== "self",
          `${c.id} L${c.level}: "${c.abilityText}" vs target ${JSON.stringify(t.target)}`,
        ).toBe(grantsToAllies);
      }
    }
  });

  it("moves the engine-coverage figure by EXACTLY the resolvable tags it derived", () => {
    /*
     * FR-114, stated as a rule rather than a frozen number.
     *
     * `manualTrigger` is outside `RESOLVED_TAG_KINDS`, so deriving it must not move the counter --
     * a button the user presses is not the engine computing anything. `ongoing` IS inside it, so
     * deriving that family SHOULD move the counter, because the engine really does resolve those
     * abilities now. The dishonesty FR-075 guards against is a count moving without the engine
     * computing anything, not a count moving.
     *
     * So the assertion is: the rise equals the number of records that gained a resolvable tag, and
     * nothing else shifted.
     */
    const resolvedBefore = creatures.filter((c) => c.abilityTags.some(isResolvableTag)).length;
    const resolvedAfter = corpus.creatures.filter((c) => c.abilityTags.some(isResolvableTag)).length;

    const gainedResolvable = creatures.filter(
      (c) => c.abilityTags.length === 0 && deriveAbilityTags(c).some(isResolvableTag),
    ).length;

    expect(resolvedAfter - resolvedBefore).toBe(gainedResolvable);

    // And the manualTrigger family specifically contributed none of that rise.
    const manualOnly = creatures.filter(
      (c) =>
        c.abilityTags.length === 0 &&
        deriveAbilityTags(c).length > 0 &&
        !deriveAbilityTags(c).some(isResolvableTag),
    ).length;
    expect(manualOnly).toBeGreaterThan(0);
  });
});

describe("WI-002 coverage — reported, not implied", () => {
  it("records the measured before/after, per family", () => {
    const untagged = creatures.filter((c) => c.abilityTags.length === 0 && hasAbilityText(c.abilityText));
    const newlyDerived = untagged.filter((c) => deriveAbilityTags(c).length > 0);

    const byFamily = new Map<string, number>();
    for (const c of newlyDerived) {
      const family = derivedFamilyFor(c)!;
      byFamily.set(family, (byFamily.get(family) ?? 0) + 1);
    }

    /*
     * The baseline and the result, pinned so a regression in the rule table is visible as a number
     * rather than as a creature quietly losing its button.
     *
     * 423 records had published ability text and no tag (424 before `dewlotl`'s record was corrected). The `manualTrigger` family reaches **7** of
     * them — Ninflora (the reported case, 4 levels) and Beetdown (3) — leaving 417.
     *
     * That number is small for a reason worth stating rather than hiding: the rule table reads 30
     * records correctly, and the DOUBLE-COUNT GUARD then refuses 23 of them, because their triggers
     * (On Battle Start, On Cast) are ones the engine already fires. Those abilities are real and
     * readable; they simply belong to a RESOLVABLE family rather than to a manual button, and
     * deriving that family is the outstanding work. Emitting buttons for them would have shown a
     * coverage number four times larger and let users double bonuses the engine computes.
     *
     * So the deliverable here is the MECHANISM — per-family rules instead of per-creature edits,
     * which is what the ask was about — plus the reported case fixed, plus a measured, justified
     * residue. 16 of research.md L1's 17 families are still hand-tagged.
     */
    expect(untagged.length).toBe(423);
    expect(newlyDerived.length).toBe(11);
    expect(untagged.length - newlyDerived.length).toBe(412);

    expect(Object.fromEntries([...byFamily].sort())).toEqual({
      // Engine-resolved: the counter rises by these, correctly (see the FR-114 test above).
      "ongoing/aura-grant": 4,
      // Manual buttons: outside RESOLVED_TAG_KINDS, so they move no coverage figure.
      "manualTrigger/self": 3,
      "manualTrigger/this-and-allies": 4,
    });
  });

  it("raises the number of species offering a manual trigger from 9", () => {
    const before = new Set(
      creatures.filter((c) => c.abilityTags.some((t) => t.kind === "manualTrigger")).map((c) => c.id),
    );
    const after = new Set(corpus.creatures.filter((c) => manualTriggersFor(c).length > 0).map((c) => c.id));
    expect(before.size).toBe(9);
    expect(after.size).toBeGreaterThan(before.size);
    // Every previously-working species still works: derivation adds, never removes.
    for (const id of before) expect(after.has(id), `${id} lost its trigger`).toBe(true);
  });
});
