import { memo } from "react";
import { useTeamConfig } from "../../context/teamConfig";
import { TIME_WEIGHT_HALF_LIFE_SECONDS, analyzePositionalCoverage } from "../../engine/optimize";
import { corpus, getCreatureById } from "../../data/corpus";
import { formatRate } from "../../data/format";
import { Button, Disclosure } from "../primitives";
import { GridRow } from "../../data/enums";
import type { SimulationResult, TeamConfiguration } from "../../data/types";
import { usePlacementAdvice } from "./usePlacementAdvice";
import type { PlacementAdvice } from "../../engine/placementAdvice";
import { BenchAdvice } from "./BenchAdvice";
import { MergeAdvice } from "./MergeAdvice";
import styles from "./PlacementAdvisor.module.css";

/** The grid renders `Back` above `Front`, so name the rows the way the user sees them. */
const rowLabel = (row: GridRow) => (row === GridRow.Top ? "top" : "bottom");

/**
 * The creatures and abilities contributing nothing to the simulated battle, moved here from under
 * the headline DPS figures on 2026-10-08 at the user's request.
 *
 * The figures were where this was *noticed*, but not what it is *about*: "Rattleghast knocked your
 * Shikitsune out" and "Craghorn's ability fires between battles" are both answers to "which of my
 * abilities are actually doing something on this board", which is the question this whole section
 * exists to answer. Beside a DPS number they read as disclaimers on the number.
 *
 * ## Derived from the LIVE board, not from `advice.coverage`
 *
 * `PlacementAdvice` already carries a `PositionalCoverage`, but it is a board behind whenever the
 * worker is catching up, and the casualty list only exists on the `SimulationResult`. Mixing a
 * stale roster with live casualties would let the two lines name creatures from different boards.
 * `analyzePositionalCoverage` is a walk over the placements with no simulation in it, so running
 * it again here against the live config costs nothing and cannot disagree with what is on screen.
 *
 * A plain function rather than a component because the caller has to know whether it produced
 * anything: with one creature placed there is no search to report, so the section is worth showing
 * only if this has something to say.
 */
function renderNotCounted(config: TeamConfiguration, result: SimulationResult) {
  const coverage = analyzePositionalCoverage(config, corpus);
  const casualties = result.knockedOutAtBattleStart;
  /*
   * A creature a teammate knocked out is reported ONCE, on the casualty line.
   *
   * `analyzePositionalCoverage` walks `config.placements`, which still contains the corpses — it
   * is a report about the board the user built, not about who survived battle start. Without this
   * filter a knocked-out creature with an unresolved ability would be listed under "the engine
   * does not compute this ability yet" as well, which is true in the abstract and useless here:
   * its ability is not missing because of an engine gap, it is missing because the creature is
   * dead.
   */
  const dead = new Set(casualties.map((c) => c.name));
  const unmodelled = coverage.unmodelled.filter((n) => !dead.has(n));
  const banked = coverage.manuallyBanked.filter((n) => !dead.has(n));

  // Says nothing at all when there is nothing outstanding: a caveat naming nobody is noise.
  if (casualties.length === 0 && unmodelled.length === 0 && banked.length === 0) return null;

  return (
    <div className={styles.coverage}>
      <p className={styles.coverageHeading}>Not counted</p>
      {/*
        2026-10-08, user-reported. Placing a Rattleghast beside two allies removed both from the
        simulation — correctly, that is what its ability does — but removed them SILENTLY, which
        reads as the tool losing track of half the board. Naming the creature that killed them is
        the part that makes it legible rather than alarming.

        This line comes FIRST because it is the one that changes what the user should do: the
        other two describe a limit of the engine, this describes a consequence of their board.
      */}
      {casualties.length > 0 && (
        <p className={styles.coverageLine}>
          <span className={styles.coverageNames}>{casualties.map((c) => c.name).join(", ")}</span> — knocked
          out at battle start by {[...new Set(casualties.map((c) => c.knockedOutBy))].join(" and ")}
        </p>
      )}
      {unmodelled.length > 0 && (
        <p className={styles.coverageLine}>
          <span className={styles.coverageNames}>{unmodelled.join(", ")}</span> —{" "}
          {unmodelled.length === 1 ? "ability" : "abilities"} not modelled yet
        </p>
      )}
      {/*
        A SEPARATE line, because this is a different fact: the ability is fully representable, it
        just fires on something outside the battle — winning a round, buying a monster, using an
        item — so the engine has no occurrence to count. Calling them "not modelled" overstates it.
      */}
      {banked.length > 0 && (
        <p className={styles.coverageLine}>
          <span className={styles.coverageNames}>{banked.join(", ")}</span> —{" "}
          {banked.length === 1 ? "triggers" : "trigger"} between battles, not during one
        </p>
      )}
    </div>
  );
}

/**
 * The collapsed header's hint, derived from EVERYTHING the panel is offering (2026-10-08).
 *
 * ## Why this is a function rather than two expressions
 *
 * It was two, and they disagreed. The no-rearrangement branch computed its hint from the
 * arrangement search alone and wrote "(none)" — while the body underneath it listed four bench
 * swaps and an "Apply this lineup" button taking the board from 116 to 201 DPS (user-reported).
 * The header was not stale or wrong about its own search; it simply had never been told the panel
 * had gained a second one.
 *
 * A collapsed panel saying "(none)" is a panel nobody opens, so a correct answer hidden behind a
 * wrong summary is the same as no answer. Every return path now reads this, so a THIRD kind of
 * advice cannot reintroduce the same defect by being added to the body and nowhere else.
 *
 * ## What "best" means here
 *
 * The highest window-average DPS any single action in the panel reaches: rearranging, applying
 * the lineup, or performing one of the listed swaps by hand. Swaps are included even though the
 * lineup search usually dominates them, because the two are selected on different measures — the
 * lineup by time-weighted score, the swaps by plain DPS — so a swap can top the table on the
 * figure being quoted while losing on the one the lineup optimises.
 */
function bestOutcomeHint(advice: PlacementAdvice): string {
  const { currentDps, suggestedDps, coverage, placementCount, bench } = advice;
  const best = Math.max(
    currentDps,
    suggestedDps ?? currentDps,
    bench?.lineup?.dps ?? currentDps,
    ...(bench?.swaps ?? []).map((s) => s.dps),
    // Merges (2026-10-09), for the reason this whole function exists: a third kind of advice added
    // to the body and not to the header would reintroduce the "(none)" defect by a new route.
    ...advice.merges.map((m) => Math.max(m.dps, m.bestDps ?? m.dps)),
  );

  // Compared as FORMATTED values, so the condition is exactly "will these two read differently".
  // A gain too small to survive rounding would otherwise render as "116 → 116 DPS average".
  const from = formatRate(currentDps);
  const to = formatRate(best);
  if (to !== from) return `(${from} → ${to} DPS average)`;

  /*
   * 2026-10-08: a suggestion that wins on SURVIVABILITY rather than on damage.
   *
   * Since the objective started pricing shielding, healing and cleansing, "the panel has an answer"
   * and "the panel has a bigger DPS number" came apart — a lineup can trade damage for survival and
   * be right to. Measuring the header in DPS alone would then write "(none)" above a body holding
   * an Apply button, which is precisely the defect this function was extracted to fix, arriving by
   * a new route.
   */
  const trade = bench?.lineup ?? advice.suggestion.placements;
  if (trade) return `(same damage, more survivable)`;
  // A merge that gains no damage is still something to tell them about: it costs copies, and
  // knowing it is available and worth nothing is what stops them spending them.
  if (advice.merges.length > 0) return `(a merge is available)`;

  // Nothing on offer. FR-069's honesty requirement: silence here would read as "your placement is
  // optimal" when the usual reason is that the engine cannot see positional effects at all.
  const seen = coverage.actionable.length;
  return seen === 0 ? "(none)" : `(none — ${seen}/${placementCount} positional abilities modelled)`;
}

/**
 * What the board's defence bought it, and the assumptions that figure rests on (2026-10-08).
 *
 * Mandatory for the same reason the blind-spot paragraph below is (FR-069), and more so. The
 * survivability term moves the ranking on the strength of two guesses about an OPPONENT the engine
 * does not simulate: that the enemy deals what you deal, and that it applies debuffs at the rate
 * you apply them. Those are the least arbitrary assumptions available (see
 * `engine/survivability.ts`) and they are still assumptions — a Runerock that just climbed into
 * the recommended lineup on the back of them has to say so.
 *
 * Renders nothing when the board has no defence at all, because then the model did nothing: the
 * factor is exactly 1 and every figure matches what the advisor produced before this existed.
 */
function renderSurvivability(s: PlacementAdvice["survivability"]) {
  if (s.mitigationPerSecond <= 0) return null;

  const parts = [
    s.shieldPerSecond > 0 ? `${formatRate(s.shieldPerSecond)} shield` : null,
    s.healPerSecond > 0 ? `${formatRate(s.healPerSecond)} healing` : null,
    s.cleansePerSecond > 0 ? `${formatRate(s.cleansePerSecond)} from cleansing` : null,
  ].filter((p): p is string => p !== null);

  return (
    <div className={styles.coverage}>
      <p className={styles.coverageHeading}>Survivability counted</p>
      <p className={styles.coverageLine}>
        <strong>{formatRate(s.mitigationPerSecond)}</strong> effective HP/s ({parts.join(", ")}) —{" "}
        {s.factor.toFixed(2)}× survival time against an enemy dealing your{" "}
        {formatRate(s.assumedIncomingDps)} DPS.
      </p>
      {s.cleansers.length > 0 && (
        <p className={styles.coverageLine}>
          <span className={styles.coverageNames}>{s.cleansers.join(", ")}</span> — cleansing is worth{" "}
          <strong>nothing</strong> against an enemy that applies no debuffs.
        </p>
      )}
    </div>
  );
}

interface PlacementAdvisorProps {
  /** The Calculator view's one `simulate()` result — never recomputed here. */
  result: SimulationResult;
}

/**
 * FR-069 (WI-018): suggests a rearrangement of the placed creatures with higher time-weighted
 * output — and, just as importantly, states what it cannot see.
 *
 * The honesty requirement is not decoration. Positional effects are barely modelled: only one
 * placed creature's positional ability is ever actionable (Formiqueen's adjacency aura), Onsetra's
 * `behind` tag is read by nothing, and six trinkets have slot-scoped effects the engine ignores
 * entirely. So "no improvement found" nearly always means "I can't see the effects that would make
 * position matter" — and presenting that as "your placement is optimal" would be a lie the user
 * could act on.
 */
export const PlacementAdvisor = memo(function PlacementAdvisor({ result }: PlacementAdvisorProps) {
  const { config: liveConfig, replaceConfig } = useTeamConfig();

  /*
   * THE SEARCH RUNS ON A WORKER THREAD (2026-10-08, performance). See `placementAdvice.worker.ts`
   * for why nothing on the main thread could work: the search has no pause point, so scheduling
   * it differently only changes WHEN it blocks. `useDeferredValue` was the previous attempt and
   * is gone — it fixed input latency but still froze the thread ~30ms after a drop.
   *
   * What that costs this component is that the advice is now ASYNCHRONOUS. It can be absent (no
   * result yet) or describe a board the user has already left, and both are stated rather than
   * papered over: a number presented as current when it is not is worse than a late number.
   */
  const { advice, isStale } = usePlacementAdvice(liveConfig);

  /*
   * Read off the LIVE config and the LIVE result, so it is never a board behind — and so it
   * survives every state the search itself can be in. `Disclosure` renders a flat, non-expandable
   * row when its children are `null`, which is exactly the no-suggestion-and-nothing-excluded
   * case, so the same expression serves all three returns below.
   */
  const notCounted = renderNotCounted(liveConfig, result);

  // Nothing to permute and nothing benched: no search to report. The board can still have an
  // ability the engine skips, and that is the half of this section that does not need a second
  // creature to be true.
  if (liveConfig.placements.length < 2 && (liveConfig.bench?.length ?? 0) === 0) {
    return notCounted ? (
      <Disclosure label="Placement suggestion" hint="(place a second Batomon to search)">
        {notCounted}
      </Disclosure>
    ) : null;
  }
  // Before the worker's first reply there is no suggestion to show, only the fact that it is coming.
  if (!advice) {
    return (
      <Disclosure label="Placement suggestion" hint="(calculating…)">
        {notCounted}
      </Disclosure>
    );
  }

  const { suggestion, coverage, currentDps, suggestedDps, moves, placementCount } = advice;
  const survivabilitySection = renderSurvivability(advice.survivability);

  /**
   * The bench's advice, rendered into every branch below (2026-10-08).
   *
   * It is deliberately independent of whether there is an ARRANGEMENT to suggest. "Nothing scored
   * higher where your Batomon currently stand" and "this benched Batomon is worth 2k more DPS
   * than the one in the bottom-left" are unrelated answers, and the first used to suppress the
   * second by returning early — which is the case the bench matters most in, since a board that
   * cannot be improved by moving is exactly one you improve by changing who is on it.
   */
  const benchSection = advice.bench ? (
    <BenchAdvice
      advice={advice.bench}
      currentDps={currentDps}
      currentMitigation={advice.survivability.mitigationPerSecond}
      isStale={isStale}
      /*
       * Placements and bench written together, as one atomic replacement — the same lesson the
       * arrangement button below records. Applying them in two steps would briefly produce a board
       * holding two monsters in one slot, or a bench that has lost the ones it displaced.
       */
      onApplyLineup={(lineup) =>
        replaceConfig({ ...liveConfig, placements: lineup.placements, bench: lineup.bench })
      }
    />
  ) : null;
  /*
   * ABOVE the bench section, because a merge changes what the roster IS and the bench advice is
   * about what to do with it. Reading "field this Lignite Lv.1" first and "or spend it on a Lv.2"
   * second invites the user to take the first answer before they have seen the alternative.
   */
  const mergeSection = (
    <MergeAdvice
      merges={advice.merges}
      currentDps={currentDps}
      isStale={isStale}
      // Placements and bench together, as one atomic replacement — a merge removes monsters from
      // both, so writing one half would leave copies the merge has already spent.
      onApply={(merge) =>
        replaceConfig({ ...liveConfig, placements: merge.placements, bench: merge.bench })
      }
    />
  );
  const blindTags = coverage.withPositionalTag.filter((n) => !coverage.actionable.includes(n));
  const gain = suggestion.bestScore - suggestion.currentScore;
  const gainPercent = suggestion.currentScore > 0 ? (gain / suggestion.currentScore) * 100 : 0;

  // 2026-10-06 round 11 (FR-086 / WI-R11-002): when there is no suggestion there is no body at all
  // -- no method paragraph, no "nothing scored higher", no blind-spot essay. The user asked for the
  // prose gone, and in the no-suggestion case every one of those paragraphs was prose about an
  // absence.
  //
  // FR-069's honesty requirement is NOT dropped, because it would be dishonest to let silence read
  // as "your placement is optimal" when the real reason is usually that the engine cannot see
  // positional effects. It moves into the collapsed `hint`, which is visible WITHOUT expanding --
  // so the caveat is now harder to miss than it was buried at the bottom of an expanded panel.
  // While the worker catches up the figures below describe the previous board, so the hint says
  // "recalculating…" rather than quietly presenting last board's numbers as this one's.
  //
  // 2026-10-08: "no body at all" now means no body about the SEARCH. The exclusions below are not
  // prose about an absence — they name creatures on the board that are contributing nothing — and
  // a board with no better arrangement is exactly where the user wants to know why.
  if (!suggestion.placements) {
    return (
      <Disclosure label="Placement suggestion" hint={isStale ? "(recalculating…)" : bestOutcomeHint(advice)}>
        {notCounted}
        {survivabilitySection}
        {mergeSection}
        {benchSection}
      </Disclosure>
    );
  }

  return (
    <Disclosure
      label="Placement suggestion"
      /*
       * The SAME hint the no-rearrangement branch shows. It used to quote `suggestedDps` alone,
       * which understated the panel whenever the bench had a better answer than rearranging did.
       */
      hint={isStale ? "(recalculating…)" : bestOutcomeHint(advice)}
    >
      <div className={styles.arrangement}>
        {/*
          The lead. Previously this sat under a two-sentence paragraph about the scoring method,
          which meant the first thing read was methodology and the answer was third — the method is
          now a footnote at the bottom, where a reader who wants it can still find it.
        */}
        <p className={styles.headline}>
          Rearranging {moves.length === 1 ? "one Batomon" : `${moves.length} Batomon`}:{" "}
          <strong>{formatRate(currentDps)}</strong> → <strong>{formatRate(suggestedDps ?? currentDps)}</strong>{" "}
          DPS average <span className={styles.gainPercent}>+{gainPercent.toFixed(1)}%</span>
        </p>
        <ul className={styles.moves}>
          {moves.map((p) => (
            <li key={`${p.creatureId}-${p.slot.row}${p.slot.col}`}>
              {getCreatureById(p.creatureId)?.name ?? p.creatureId} → {rowLabel(p.slot.row)} row,
              slot {p.slot.col + 1}
            </li>
          ))}
        </ul>
        <Button
          variant="primary"
          /*
           * Unavailable while the worker is behind the board. `suggestion.placements` then
           * describes the PREVIOUS board, so applying it would undo the edit that is still being
           * searched — and `replaceConfig` below spreads `liveConfig`, so the two halves of the
           * written config would come from different boards.
           */
          disabled={isStale}
          onClick={() => {
            /*
             * Applied as ONE atomic replacement of the whole board.
             *
             * 2026-10-08, user-reported: this used to walk the suggestion calling
             * `movePlacement(from, to)` per creature, reading `from` out of the pre-click `config`
             * every time. `movePlacement` SWAPS when the destination is occupied, and every
             * destination here is occupied, so each call undid part of the previous one while the
             * `from` slots it was reading went stale. A six-creature cycle came out as a single
             * pairwise swap. The board then differed from the suggestion that was just applied, so
             * the advisor immediately proposed another rearrangement — the "it keeps flip-flopping
             * between two suggestions" loop. The search itself was fine; only this was wrong.
             */
            if (suggestion.placements) replaceConfig({ ...liveConfig, placements: suggestion.placements });
          }}
        >
          Apply this arrangement
        </Button>
      </div>

      {/* Before the engine's own blind spots, because this describes the user's board rather than
          a limit of the tool — and it is the part they can act on. */}
      {notCounted}

      {survivabilitySection}

      {mergeSection}

      {benchSection}

      {/*
        Method and blind spots, demoted to a footer (2026-10-09, user's "wall of text").

        Both were body prose at full weight, so the panel presented how it scored and what it
        cannot see as being as worth reading as what to do. They are kept — FR-069's honesty
        requirement is not optional, and the trinket line can invalidate the whole result — but at
        the size of a footnote and below the answer, not above it.
      */}
      <div className={styles.footer}>
        <p className={styles.footerLine}>
          Scored on damage weighted toward the opening: damage {TIME_WEIGHT_HALF_LIFE_SECONDS}s in
          counts half, and defence pushes that back. Searched{" "}
          {suggestion.evaluated.toLocaleString()} arrangements
          {advice.bench?.lineup ? ` and ${advice.bench.lineup.evaluated.toLocaleString()} lineups` : ""}.
        </p>
        {coverage.actionable.length === 0 ? (
          <p className={styles.footerWarn}>
            No placed Batomon has a positional ability this engine reads, so &ldquo;no
            improvement&rdquo; is a limit of the tool rather than a verdict on your board.
          </p>
        ) : (
          <p className={styles.footerLine}>
            Positional abilities read for {coverage.actionable.length} of {placementCount} placed
            Batomon ({coverage.actionable.join(", ")})
            {blindTags.length > 0 ? `; not read for ${blindTags.join(", ")}` : ""}.
          </p>
        )}
        {coverage.unmodelledTrinkets.length > 0 && (
          <p className={styles.footerWarn}>
            {coverage.unmodelledTrinkets.join(", ")}{" "}
            {coverage.unmodelledTrinkets.length === 1 ? "has a slot-based effect" : "have slot-based effects"}{" "}
            the engine cannot model, which may invalidate this result entirely.
          </p>
        )}
      </div>
    </Disclosure>
  );
});
