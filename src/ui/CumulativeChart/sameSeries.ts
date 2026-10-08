/**
 * Value equality for a chart's sampled series, used as the `memo` comparator for all three charts.
 *
 * ## Why reference equality is not enough
 *
 * `simulate()` returns a fresh `SimulationResult` for every edit, so `result.cumulativeSeries` is a
 * new array even when it holds exactly the same numbers. Memoizing on `result` therefore made the
 * charts re-render on every change to the team — including changes they cannot possibly show.
 *
 * Swapping two placed Batomon is the case that matters, because it is the one the user performs by
 * dragging, and it is measurably the most expensive thing the page does. A swap produces
 * **byte-identical** `cumulativeSeries`, `dpsRateSeries` and `statusStackSeries`: position feeds
 * `perCreatureDps`, which the tables read, but almost nothing positional reaches the simulated
 * damage curve (see `PlacementAdvisor` on how little of position the engine models). So all three
 * Recharts trees were being torn down and rebuilt to draw precisely the same picture.
 *
 * ## Why this is cheap
 *
 * The identity check below short-circuits the common case. Hovering the grid re-renders
 * `CalculatorView` without touching `result`, so the arrays are the SAME array and this returns on
 * the first line — the behaviour the old reference-equality `memo` already had. The full walk only
 * runs when a new result exists, i.e. at human speed, over ~61 samples.
 *
 * ## The condition for this being correct
 *
 * A comparator must consider every prop its component reads, and each chart is memoized on the one
 * series it draws because that is genuinely all it reads off `result`. **A chart that starts
 * reading a second field must compare that field here too**, or it will silently keep rendering
 * stale content — the usual failure mode of a hand-written `memo` comparator, and the reason this
 * is a shared helper with the rule written down rather than three inline arrow functions.
 */
export function sameSeries(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!sameSeries(a[i], b[i])) return false;
    }
    return true;
  }

  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!sameSeries((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
}
