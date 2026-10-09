/**
 * Whether a record's ability text is real, as opposed to absent.
 *
 * The corpus spells "this creature has no ability" as an empty `abilityText`. It previously stored
 * two placeholder sentences instead — `"No ability text shown"` and `"No ability text transcribed
 * in sources reviewed."` — which only risked rendering as an ability named after the placeholder.
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

/** What `abilityNeedsModelling` reads. A full `CreatureRecord` satisfies it. */
interface AbilityTextSubject {
  abilityText?: string;
  appliesStatus?: { type: string; amount: number }[];
  publishedCast?: { damage: number };
  baseCooldownSeconds?: number | null;
}

/**
 * Sentences that announce PROGRESSION rather than a battle effect (research.md B6).
 *
 * Anchored at the sentence start on purpose. Rigalord's "At the start of the next day, devour the
 * ally in front and evolve into Rigalord" also contains the word, and that one IS an ability the
 * engine does not model — a `contains` test would hide a real gap.
 */
const PROGRESSION_SENTENCE = /^(?:evolves?\b|evolution result of\b)/i;

/** A sentence that is nothing but a quotation: flavour text, e.g. Bumblebolt's marketing aside. */
const FLAVOUR_SENTENCE = /^["“].*["”]$/;

/** What is left of a restated sentence once its true claims are removed: joining words only. */
const CONNECTIVES_ONLY = /^[\s.,]*(?:(?:and|per cast)[\s.,]*)*$/i;

/**
 * Removes every claim the sentence makes that the creature's own stat line already carries.
 *
 * Claim-by-claim rather than whole-sentence templates, because the same three facts are published
 * in more than one order — "Deals 5 direct damage and applies 5 Burn every 5.5 seconds" against
 * "Deals 3 direct damage every 2.5 seconds and applies 1 Shock" — and a template per ordering is a
 * list that the next phrasing escapes. A claim is removed only when it MATCHES the record, so text
 * stating a number the stats do not have survives and the sentence is correctly treated as real.
 */
function stripRestatedClaims(sentence: string, creature: AbilityTextSubject): string {
  let rest = sentence;
  const consume = (pattern: RegExp, verify: (match: RegExpExecArray) => boolean) => {
    const match = pattern.exec(rest);
    if (match && verify(match)) {
      rest = rest.slice(0, match.index) + rest.slice(match.index + match[0].length);
    }
  };
  consume(/deals? (\d+) (?:direct )?damage/i, (m) => creature.publishedCast?.damage === Number(m[1]));
  consume(/applies (\d+) (\w+)/i, (m) =>
    (creature.appliesStatus ?? []).some(
      (s) => s.type.toLowerCase() === m[2]!.toLowerCase() && s.amount === Number(m[1]),
    ),
  );
  consume(/every ([\d.]+) seconds/i, (m) => creature.baseCooldownSeconds === Number(m[1]));
  return rest;
}

/**
 * Whether a creature has an ability the engine *should* be computing.
 *
 * The distinction matters because the coverage counter sits next to a DPS figure, where "0 of 3
 * abilities modelled" reads as "this number is 0% trustworthy". For a team of Venopuff, Magmite and
 * Dribblet that was badly wrong: the DPS was entirely correct, because **none of the three has an
 * ability that needs modelling at all**.
 *
 * Four kinds of sentence have nothing to model, and counting them as gaps overstates the gap:
 *
 * | case | example | why |
 * |---|---|---|
 * | no ability text | Magmite — `abilityText: ""` | there is no ability |
 * | progression | Dribblet — `"Evolves at level 3."`; Ignit — `"Evolve."` | not a battle effect (research.md B6) |
 * | restates base stats | Scorchimp — `"Deals 5 direct damage and applies 5 Burn every 5.5 seconds"` | already computed from the stat line |
 * | flavour | Bumblebolt — `'"The poster Common: 2.5s, Shock, cheap."'` | marketing copy in a stats field |
 *
 * Judged SENTENCE BY SENTENCE, not on the whole text (2026-10-08). The earlier version matched two
 * fixed whole-string patterns, so Scorchimp — whose text is a restatement followed by "Evolves at
 * level 3 into Sunsage." — failed both and was reported to the user as an ability the engine
 * cannot compute, directly beside a DPS figure that was right down to the last point. Per
 * `ability-coverage-audit.md` sections G and I that was 9 creatures corpus-wide, including two
 * starter Commons.
 */
export function abilityNeedsModelling(creature: AbilityTextSubject): boolean {
  const text = creature.abilityText?.trim() ?? "";
  if (!hasAbilityText(text)) return false;

  // Split after a full stop that ends a sentence. `(?<=\.)\s+` keeps "2.5s" and "15000" intact,
  // since neither has whitespace after the dot.
  return text
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .some((sentence) => {
      const body = sentence.replace(/\.$/, "");
      if (PROGRESSION_SENTENCE.test(body)) return false;
      if (FLAVOUR_SENTENCE.test(body)) return false;
      return !CONNECTIVES_ONLY.test(stripRestatedClaims(body, creature));
    });
}
