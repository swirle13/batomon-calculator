import { describe, expect, it } from "vitest";
import { allCreatureRecords } from "../corpus";
import { Species } from "../ids";

/**
 * THE STANDING AUDIT: does every qualifier in an ability's TEXT appear in its TAGS?
 *
 * 2026-10-09, user-instructed: "I don't want to have to keep pointing out every time a bug comes
 * up and you then reactively patch just that one specific case. I want you to proactively search
 * through and identify what gaps exist in the engine's representation and patch it all."
 *
 * Four defects in two days had the identical shape — an ability text that narrows its target, and
 * a tag that does not:
 *
 *   - Zephyrex, "give the **Flying** ally in front +1 Multicast": no `typeFilter`, so the
 *     Multicast went to a Toxic Venopuff and more than doubled its cast count.
 *   - Formiqueen, "adjacent **Common** allies have +25% Cooldown Speed": no `rarityFilter`, on
 *     the one positional ability the placement advisor advertises as actionable.
 *   - Puffloon, "**(Except other Puffloon)**": no exclusion, so a pair traded free casts.
 *   - Torrantler and Opalion, the same clause, found only because this audit was written.
 *
 * Each was reported by the user after noticing a number that looked wrong. This file is the
 * attempt to stop that being the detection mechanism: it reads every ability's text, extracts the
 * qualifiers a reader would expect the engine to honour, and fails when one is not in the tags.
 *
 * ## Every gap is listed, with a reason
 *
 * `ACCEPTED` below is the complete inventory of abilities whose text carries a qualifier the tags
 * do not express, each with why. Nothing is skipped silently — adding a species here is a
 * deliberate act that shows up in review, which is the property that makes this worth more than
 * the one-off script it started as.
 *
 * The test is deliberately NOISY rather than clever: a false positive costs one line in
 * `ACCEPTED`, while a false negative costs another user-reported wrong number.
 */

const TYPES = [
  "Fire", "Water", "Grass", "Electric", "Rock", "Toxic", "Bug",
  "Flying", "Ghost", "Dragon", "Fighting", "Normal", "Ice",
] as const;
const RARITIES = ["Common", "Uncommon", "Super Rare", "Rare", "Legendary", "Mythical"] as const;

/** A qualifier a reader would expect the tags to carry. */
type Qualifier = string;

function qualifiersInText(text: string): Qualifier[] {
  const t = text.replace(/\n/g, " ");
  const found: Qualifier[] = [];

  for (const [name, re] of [
    ["adjacent", /\badjacent\b/i],
    ["inFront", /\bin front\b/i],
    ["behind", /\bbehind\b/i],
    ["above", /\bally above\b|\ballies above\b/i],
    ["row", /\bthis row\b|\bin a row\b/i],
    ["exceptSameSpecies", /except other/i],
    ["cannotGain", /can'?t (have|receive|gain)|cannot (have|receive|gain)/i],
    ["randomCount", /\b\d+ random\b/i],
    ["minLevel", /\blevel \d+ or above\b/i],
  ] as const) {
    if (re.test(t)) found.push(name);
  }
  // A type or rarity word only counts when it is QUALIFYING somebody — "Fire allies", "Common
  // monsters". Bare mentions ("gain Fire typing", "the poster Common") narrow no target.
  for (const ty of TYPES) {
    if (new RegExp(`\\b${ty}\\s+(ally|allies|monsters?)\\b`, "i").test(t)) found.push(`type:${ty}`);
  }
  for (const r of RARITIES) {
    if (new RegExp(`\\b${r}\\s+(ally|allies|monsters?)\\b`).test(t)) found.push(`rarity:${r}`);
  }
  return found;
}

function qualifiersInTags(tags: unknown): Qualifier[] {
  const json = JSON.stringify(tags);
  const found: Qualifier[] = [];
  for (const [name, needle] of [
    ["adjacent", `"kind":"adjacent"`],
    ["inFront", `"kind":"inFront"`],
    ["behind", `"kind":"behind"`],
    ["above", `"kind":"above"`],
    ["row", `"kind":"row"`],
    ["exceptSameSpecies", `"excludeSameSpecies":true`],
    ["cannotGain", `"kind":"cannotGain"`],
    ["randomCount", `"count":`],
    ["minLevel", `"minLevelFilter":`],
  ] as const) {
    if (json.includes(needle)) found.push(name);
  }
  for (const ty of TYPES) if (json.includes(`"typeFilter":"${ty}"`)) found.push(`type:${ty}`);
  for (const r of RARITIES) {
    if (json.includes(`"rarityFilter":"${r.replace(" ", "")}"`)) found.push(`rarity:${r}`);
  }
  return found;
}

/**
 * Every ability whose text narrows something the tags do not, and WHY that is acceptable today.
 *
 * Grouped by reason rather than alphabetically, because the reason is the useful axis: the first
 * group is work the engine could do and has not, and it is the backlog.
 */
const ACCEPTED: Partial<Record<Species, string>> = {
  // --- Handled in CODE rather than in the tag -------------------------------------------------
  // The exclusion is real and enforced; it simply lives in `effects.ts` instead of the data. Worth
  // an entry rather than a tag change, because moving it would alter a resolver the capture tests
  // pin.
  [Species.Miasmaw]: "same-species exclusion is hard-coded in resolveBoard's battleStartStatusFromAllies pass",

  // --- Modelled in PART, where the remainder has no representation --------------------------
  // These pass the audit because their TARGETS are expressed; they are listed so a green run is
  // not read as full coverage of the ability.
  //   Aerophim  — the +N Multicast to adjacent allies is modelled; "transform them into random
  //               monsters of their rarity" is not, and could not be without a shop model.
  //
  // --- Mechanism the engine does not have ------------------------------------------------------
  // These are the honest backlog. Each names what is missing, so the next person does not have to
  // re-derive it from the ability text.
  [Species.Cherubble]: "grants Protect, which is not a modelled status",
  [Species.Celestia]: "disables abilities in a row; the engine has no notion of a disabled ability",
  [Species.Null00]: "row-wide Cooldown penalty applying to ENEMIES as well, which the idealised target cannot represent",
  [Species.Tsunamere]: "levels allies up mid-battle; level is resolved once, before the battle",
  [Species.Dirgefin]: "knocks out allies AND enemies; the enemy half is outside the idealised target",
  [Species.Riglet]: "devours an ally between days, which is a run event rather than a battle one",
  [Species.Draconarch]: "re-activates other monsters' On Battle Start abilities; the resolver is single-pass",
  [Species.Sarudo]: "re-activates On Victory abilities, which fire outside the battle",
  [Species.Gemwing]: "re-activates an On Bought ability, which fires outside the battle",
  [Species.Pompummel]: "re-activates an On Victory ability, which fires outside the battle",
  [Species.Faebloom]: "scales off Mythical Items used this run, which the battle does not know",
  [Species.Shrinell]: "scales off Trinkets owned, which the battle does not know",

  // --- Fires outside the battle (run economy) --------------------------------------------------
  // The engine cannot fire these at all, so a missing target qualifier changes nothing it computes.
  // `manualTriggersFor` is where several of them are surfaced to the user instead.
  [Species.Aviarab]: "run economy: affects the next monster you buy",
  [Species.Toximoth]: "run economy: affects monsters in the shop",
  [Species.Guardiant]: "run economy: fires after you buy a monster",
  [Species.Cinderfly]: "run economy: fires after you buy a monster",
  [Species.Shogapede]: "run economy: fires after you buy a monster",
  [Species.Goldora]: "run economy: grants Trinkets",
  [Species.Dragonegg]: "run economy: hatches a monster after a number of days",

  // --- The text's qualifier is not a target qualifier ------------------------------------------
};

describe("ability text vs ability tags", () => {
  /**
   * Level 1 only. Every level of a species shares its wording and differs by magnitude, so a gap
   * is a property of the species; checking four copies would report each one four times.
   */
  const species = allCreatureRecords().filter((c) => c.level === 1);

  it("has a non-trivial corpus to check, so a broken filter cannot pass vacuously", () => {
    expect(species.length).toBeGreaterThan(100);
    expect(species.filter((c) => qualifiersInText(c.abilityText ?? "").length > 0).length)
      .toBeGreaterThan(30);
  });

  it("expresses every target qualifier its text states, or records why not", () => {
    const unexplained: string[] = [];

    for (const c of species) {
      const text = c.abilityText ?? "";
      if (!text.trim()) continue;
      const expressed = qualifiersInTags(c.abilityTags);
      const missing = qualifiersInText(text).filter((q) => !expressed.includes(q));
      if (missing.length === 0) continue;
      if (ACCEPTED[c.id]) continue;
      unexplained.push(`${c.name} (${c.id}) missing [${missing.join(", ")}] — "${text.replace(/\n/g, " ")}"`);
    }

    /*
     * A failure here is NOT "add it to ACCEPTED". It is "the tag drops something the text says",
     * which is how Zephyrex gave a Toxic monster a Flying-only buff. Fix the tag, or add an entry
     * saying which mechanism is missing and why it cannot be fixed yet.
     */
    expect(unexplained, `\n${unexplained.join("\n")}\n`).toEqual([]);
  });

  it("keeps ACCEPTED honest — every entry still describes a real gap", () => {
    /*
     * The other direction, and the one that rots. An exemption left behind after its gap is fixed
     * is a hole in the audit: the next creature to lose a qualifier under that id would pass
     * silently. Puffloon, Torrantler and Opalion were all in this list before they were tagged.
     */
    const stale: string[] = [];
    for (const id of Object.keys(ACCEPTED) as Species[]) {
      const record = species.find((c) => c.id === id);
      if (!record) {
        stale.push(`${id} — no level 1 record; the id is wrong or the species is gone`);
        continue;
      }
      const expressed = qualifiersInTags(record.abilityTags);
      const missing = qualifiersInText(record.abilityText ?? "").filter((q) => !expressed.includes(q));
      if (missing.length === 0) stale.push(`${id} — nothing missing any more, remove the exemption`);
    }
    expect(stale, `\n${stale.join("\n")}\n`).toEqual([]);
  });
});
