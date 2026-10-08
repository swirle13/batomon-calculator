import { memo } from "react";
import { useTeamConfig } from "../../context/teamConfig";
import { TIME_WEIGHT_HALF_LIFE_SECONDS, analyzePositionalCoverage } from "../../engine/optimize";
import { corpus, getCreatureById } from "../../data/corpus";
import { formatRate } from "../../data/format";
import { Button, Disclosure } from "../primitives";
import { GridRow } from "../../data/enums";
import type { SimulationResult, TeamConfiguration } from "../../data/types";
import { usePlacementAdvice } from "./usePlacementAdvice";
import styles from "./PlacementAdvisor.module.css";

/** The grid renders `Back` above `Front`, so name the rows the way the user sees them. */
const rowLabel = (row: GridRow) => (row === GridRow.Back ? "top" : "bottom");

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
      <p className={styles.coverageHeading}>Not counted in this calculation</p>
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
          <span className={styles.coverageNames}>{unmodelled.join(", ")}</span> — the engine does not
          compute {unmodelled.length === 1 ? "this ability" : "these abilities"} yet
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
          {banked.length === 1 ? "this ability triggers" : "these abilities trigger"} between battles, not
          during one
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

  // A single placed creature has nothing to permute, so there is no suggestion to make — but it
  // can still have an ability the engine skips, and that is the half of this section that does
  // not need a second creature to be true.
  if (liveConfig.placements.length < 2) {
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
    const seen = coverage.actionable.length;
    const hint = seen === 0 ? "(none)" : `(none — ${seen}/${placementCount} positional abilities modelled)`;
    return (
      <Disclosure label="Placement suggestion" hint={isStale ? "(recalculating…)" : hint}>
        {notCounted}
      </Disclosure>
    );
  }

  return (
    <Disclosure
      label="Placement suggestion"
      hint={
        isStale
          ? "(recalculating…)"
          : `(${formatRate(currentDps)} → ${formatRate(suggestedDps ?? currentDps)} DPS average)`
      }
    >
      <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.45 }}>
        Searched <strong>{suggestion.evaluated}</strong> arrangements of your placed Batomon, scoring
        each by damage weighted toward the start of the fight — damage {TIME_WEIGHT_HALF_LIFE_SECONDS}s
        in counts half as much as damage at the opening, since a slow ramp may arrive after you are
        already dead.
      </p>

      <div style={{ fontSize: "0.85rem" }}>
        <p>
          Moving {moves.length === 1 ? "one Batomon" : `these ${moves.length} Batomon`} takes your{" "}
          DPS average from <strong>{formatRate(currentDps)}</strong> to{" "}
          <strong>{formatRate(suggestedDps ?? currentDps)}</strong> ({gainPercent.toFixed(1)}% more
          weighted output):
        </p>
        <ul>
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

      {/* The blind-spot disclosure. This is mandatory, not a nicety (FR-069). */}
      <p
        style={{
          fontSize: "0.78rem",
          color: "var(--text-warn)",
          borderTop: "1px solid var(--line-subtle)",
          paddingTop: "0.5rem",
          marginTop: "0.5rem",
          lineHeight: 1.45,
        }}
      >
        <strong>What this search can actually see:</strong>{" "}
        {coverage.actionable.length === 0 ? (
          <>
            <strong>none of your placed Batomon</strong> have a positional ability this engine can
            reason about, so a result of &ldquo;no improvement&rdquo; reflects that limit rather than
            your placement being optimal.
          </>
        ) : (
          <>
            {coverage.actionable.length} of {placementCount} placed Batomon (
            {coverage.actionable.join(", ")}) have a positional ability the engine acts on.
          </>
        )}
        {blindTags.length > 0 && (
          <>
            {" "}
            {blindTags.join(", ")} {blindTags.length === 1 ? "has" : "have"} a positional ability
            recorded in the corpus that the engine does <strong>not</strong> yet read, so it was
            ignored here.
          </>
        )}
        {coverage.unmodelledTrinkets.length > 0 && (
          <>
            {" "}
            Your selected {coverage.unmodelledTrinkets.join(", ")}{" "}
            {coverage.unmodelledTrinkets.length === 1 ? "has a" : "have"} slot-based effect
            {coverage.unmodelledTrinkets.length === 1 ? "" : "s"} the engine cannot model, which may
            invalidate this result entirely.
          </>
        )}
      </p>
    </Disclosure>
  );
});
