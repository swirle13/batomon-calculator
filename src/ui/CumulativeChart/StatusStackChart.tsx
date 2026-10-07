import { useState } from "react";
import type { SimulationResult } from "../../data/types";
import { STAT_COLORS } from "../../data/statColors";
import { SeriesChart } from "./SeriesChart";

interface StatusStackChartProps {
  result: SimulationResult;
}

/**
 * Live status stacks on the enemy over time — what is on them *now*, not what has been dealt.
 *
 * ## Why this is a third chart rather than a line on the others
 *
 * The other two both measure damage: one cumulative, one as a rate. This measures a *population*,
 * and it is the only view in which Burn behaves visibly differently from Poison. Poison and Shock
 * only ever climb, so on a damage chart they look alike; Burn climbs as it is applied and sheds one
 * layer every 0.5s tick, so a Burn team's stacks visibly burn off between casts. That rise-and-fall
 * is invisible on a cumulative chart, which is monotonic by construction, and muddied on a rate
 * chart, which mixes it with everything else.
 *
 * Collapsed by default: it answers a narrower question than the other two, and an always-open third
 * chart pushes the tables further down for every user who did not ask it.
 *
 * Shield is deliberately absent — it is absorption on your own side, not a stack pool on the enemy,
 * so it has no meaning on this axis.
 */
export function StatusStackChart({ result }: StatusStackChartProps) {
  const [open, setOpen] = useState(false);

  const series = result.statusStackSeries;
  const xValues = series.map((p) => p.tSeconds);
  const windowSeconds = xValues.length > 0 ? xValues[xValues.length - 1]! : 0;
  const anyStacks = series.some((p) => p.Burn > 0 || p.Poison > 0 || p.Shock > 0);

  return (
    <section>
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{ font: "inherit", background: "none", border: "none", color: "inherit", cursor: "pointer" }}
          aria-expanded={open}
        >
          {open ? "▾" : "▸"} Status stacks on the enemy over time
        </button>
      </h2>

      {open &&
        (anyStacks ? (
          <>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", maxWidth: "48rem", margin: "0 auto 0.5rem" }}>
              How many stacks are <em>live</em> at each moment, not how much damage they have dealt.
              Poison and Shock only accumulate. Burn sheds one layer every 0.5s tick no matter how
              large it is, so it rises on each cast and drains between them.
            </p>
            <SeriesChart
              xValues={xValues}
              series={[
                // stepAfter throughout: a stack count changes at an instant and holds until the
                // next change. A straight line between samples would draw fractional stacks that
                // never exist.
                { name: "Burn", values: series.map((p) => p.Burn), color: STAT_COLORS.burn, lineType: "stepAfter" },
                { name: "Poison", values: series.map((p) => p.Poison), color: STAT_COLORS.poison, lineType: "stepAfter" },
                { name: "Shock", values: series.map((p) => p.Shock), color: STAT_COLORS.shock, lineType: "stepAfter" },
              ]}
              xLabel="seconds (0.5s increments)"
              yLabel="stacks on enemy"
              xMax={windowSeconds}
              xTickInterval={1}
              ariaLabel="Line chart of live Burn, Poison and Shock stacks on the enemy over the simulated time window"
              formatValue={(v) => v.toFixed(0)}
            />
          </>
        ) : (
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            This team applies no Burn, Poison or Shock, so there is nothing to track here.
          </p>
        ))}
    </section>
  );
}
