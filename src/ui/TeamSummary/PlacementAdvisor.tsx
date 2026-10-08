import { useMemo } from "react";
import { corpus } from "../../data/corpus";
import { useTeamConfig } from "../../context/teamConfig";
import {
  analyzePositionalCoverage,
  suggestPlacement,
  TIME_WEIGHT_HALF_LIFE_SECONDS,
} from "../../engine/optimize";
import { getCreatureById } from "../../data/corpus";
import { simulate, windowAverageDps } from "../../engine/simulate";
import { slotKey } from "../../engine/grid";
import { formatRate } from "../../data/format";
import { Button, Disclosure } from "../primitives";
import { GridRow } from "../../data/enums";

/** The grid renders `Back` above `Front`, so name the rows the way the user sees them. */
const rowLabel = (row: GridRow) => (row === GridRow.Back ? "top" : "bottom");

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
export function PlacementAdvisor() {
  const { config, replaceConfig } = useTeamConfig();

  const { suggestion, coverage, currentDps, suggestedDps, moves } = useMemo(() => {
    const suggestion = suggestPlacement(config, corpus);
    // Only the creatures that actually change slot. Listing the ones already in place made a
    // six-line list of which two lines were instructions, and the user read the no-op lines as the
    // advisor contradicting itself.
    const currentBySlot = new Map(config.placements.map((p) => [slotKey(p.slot), p.creatureId]));
    return {
      suggestion,
      coverage: analyzePositionalCoverage(config, corpus),
      currentDps: windowAverageDps(simulate(config, corpus)),
      suggestedDps: suggestion.placements
        ? windowAverageDps(simulate({ ...config, placements: suggestion.placements }, corpus))
        : null,
      moves: (suggestion.placements ?? []).filter((p) => currentBySlot.get(slotKey(p.slot)) !== p.creatureId),
    };
  }, [config]);

  if (config.placements.length < 2) return null;

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
  if (!suggestion.placements) {
    const seen = coverage.actionable.length;
    return (
      <Disclosure
        label="Placement suggestion"
        hint={seen === 0 ? "(none)" : `(none — ${seen}/${config.placements.length} positional abilities modelled)`}
      />
    );
  }

  return (
    <Disclosure
      label="Placement suggestion"
      hint={`(${formatRate(currentDps)} → ${formatRate(suggestedDps ?? currentDps)} DPS average)`}
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
            if (suggestion.placements) replaceConfig({ ...config, placements: suggestion.placements });
          }}
        >
          Apply this arrangement
        </Button>
      </div>

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
            {coverage.actionable.length} of {config.placements.length} placed Batomon (
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
}
