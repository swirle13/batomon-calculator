#!/usr/bin/env python3
"""Derive battle events from a bcscan frames.csv.

Reads the one-row-per-frame dataset and writes:
  events.csv    every detected event, one row each, machine-queryable
  timeline.md   the same events as a readable narrative, plus per-slot cooldown stats
                and the near-simultaneous clusters that matter for tie-break work

Nothing here touches the video. frames.csv is the single source of truth, so re-running this
after changing a threshold costs a second rather than a minute.

Usage:
  bcevents.py <frames.csv> <out-dir> [options]

    --cluster-ms=60              how close two casts must be to count as a tie-break candidate
    --speed=N                    the fast-forward multiplier the recording was made at; adds
                                 game-second figures alongside the video-second ones
    --dot-interval=1.0           game-seconds between damage-over-time ticks; 1 for Poison,
                                 0.5 for Burn. Used to turn the measured tick cadence into the
                                 fast-forward multiplier.
    --charge-slot=SLOT[:SECONDS] a slot whose creature has a charge-on-event ability, e.g.
                                 --charge-slot=ally_front_2:1 for Cobrex. Used to estimate the
                                 speed factor and that mon's true cooldown. Must be given
                                 explicitly: the tool cannot tell which mon charges, and the
                                 cooldown bars are narrow enough that spell effects crossing one
                                 look like grants.
"""

from __future__ import annotations

import csv
import os
import sys
from collections import defaultdict

# A cast is a cooldown bar falling from (near) full to (near) empty. Both thresholds are
# fractions of that slot's own bar height, which bcscan normalizes so full == that mon's
# whole cooldown regardless of its length.
FULL_FRAC = 0.85
EMPTY_FRAC = 0.25
# How many frames back to look for the "was full" half of a cast. The bar renders a short
# flash at full before the reset lands, so the two are never on the same frame.
CAST_LOOKBACK = 6
# A bar that was near-empty shortly before reading full did not fill; a spell effect crossed it.
# A real cast is preceded by a ramp, so the typical level this far back is already well up the bar.
CAST_RAMP_LOOKBACK = 24
CAST_RAMP_FRAC = 0.5
# Mirror of the ramp test, looking forward: a bar that was spent stays spent and refills
# gradually, so its typical level over the next fraction of a second is still near empty. This
# is what rejects a dark spell effect *covering* a bar, which reads as a drop to zero and then a
# jump back to where it was. Compared as a median, so a bright flash in the same window does not
# throw it. Expressed in seconds rather than frames because it is bounded by the shortest real
# cooldown, not by the capture rate; at very high fast-forward it may need lowering.
CAST_SPENT_SECONDS = 0.6
# A charge grant shows as the bar jumping further in one frame than it could have filled.
CHARGE_MIN_PX = 4
# Frames the new bar level must hold for a jump to count as a charge rather than a VFX flash.
CHARGE_PERSIST = 3
# A flash can hold for longer than CHARGE_PERSIST, so the level is also checked over a longer
# window: a granted charge is never given back, while a flash falls off within a few frames.
CHARGE_HOLD = 25
# How far off a perfect tick a health drop may sit and still count as on-cadence, as a fraction
# of the period. Loose enough to absorb render lag, tight enough that cast damage does not fit.
DOT_PHASE_TOLERANCE = 0.08
# Fraction of expected tick slots that must actually contain a health drop. This is what stops
# the search aliasing onto a submultiple of the true period.
DOT_MIN_COVERAGE = 0.8


def read_frames(path):
    with open(path, newline="") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        sys.exit(f"{path}: no data rows")
    return rows


def slot_ids(fieldnames):
    return [f[:-3] for f in fieldnames if f.endswith("_cd")]


def badge_kinds(fieldnames, slot):
    pre = slot + "_"
    return [
        f[len(pre) :]
        for f in fieldnames
        if f.startswith(pre) and not f.endswith(("_cd", "_raw"))
    ]


def to_int(s):
    """Badge text to a number. 'K' is the game's thousands abbreviation, so '16K' is 16000
    with three digits of precision thrown away -- flagged by the caller, not silently exact."""
    if not s:
        return None
    s = s.strip()
    if not s or s == "?":
        return None
    if s.startswith("X"):
        s = s[1:]
    mult = 1
    if s.endswith("K"):
        mult, s = 1000, s[:-1]
    if not s.isdigit():
        return None
    return int(s) * mult


def find_battle_window(rows, fields, times):
    """The frames that are actually a battle: (start, end, losing_side).

    Both edges have to be found, not just the end. A recording usually opens on black frames or
    a transition, where the health bars read zero -- and a naive "first zero is the end" test
    fires on frame one and throws the whole battle away. So the battle is taken to begin once
    both bars are substantially full, and to end at the first zero after that.
    """
    sides = [s for s in ("ally", "enemy") if f"hp_{s}_px" in fields]
    if not sides:
        return None, None, None

    def px(r, s):
        return int(r[f"hp_{s}_px"] or 0)

    def width(r, s):
        return int(r[f"hp_{s}_width"] or 0) or 1

    start = None
    for r, t in zip(rows, times):
        if all(px(r, s) > 0.5 * width(r, s) for s in sides):
            start = t
            break
    if start is None:
        return None, None, None

    for r, t in zip(rows, times):
        if t <= start:
            continue
        for s in sides:
            if px(r, s) == 0:
                return start, t, s
    return start, None, None


def detect(rows, cluster_ms, charge_slots):
    fields = list(rows[0].keys())
    slots = slot_ids(fields)
    all_times = [float(r["t"]) for r in rows]

    # Analyse the battle only. Before it, the recording is on a transition or the pre-battle
    # board; after it, the victory screen puts unrelated artwork under the layout rectangles.
    b_start, b_end, loser = find_battle_window(rows, fields, all_times)
    lo = b_start if b_start is not None else all_times[0]
    hi = b_end if b_end is not None else all_times[-1]
    rows = [r for r, t in zip(rows, all_times) if lo <= t <= hi]
    if not rows:
        rows = [r for r in rows] or []
    battle_end = (b_end, loser) if b_end is not None else None
    battle_start = b_start
    times = [float(r["t"]) for r in rows]
    events = []

    # Frame interval from the data rather than from a declared frame rate: recordings are often
    # variable rate, and the declared one has been wrong before.
    steps = sorted(b - a for a, b in zip(times, times[1:]) if b > a)
    frame_dt = steps[len(steps) // 2] if steps else 1 / 60
    spent_frames = max(1, round(CAST_SPENT_SECONDS / frame_dt))

    # ---- cooldown bars: casts and charge grants ----
    bar_stats = {}
    for slot in slots:
        cd = [int(r[slot + "_cd"] or 0) for r in rows]
        height = max(cd) if cd else 0
        if height < 10:
            bar_stats[slot] = {"height": height, "casts": [], "note": "bar never read"}
            continue
        full, empty = height * FULL_FRAC, height * EMPTY_FRAC

        casts = []
        # One cast per descent, enforced by the invariant rather than by a time window: a mon
        # cannot cast again until its bar has refilled. An earlier version collapsed repeats
        # within 50 ms, which depended on the capture's frame rate and let a second "cast"
        # through whenever the frames either side of `CAST_LOOKBACK` happened to straddle it.
        armed = True
        for i in range(1, len(cd)):
            if cd[i] >= full:
                armed = True
            if cd[i] > empty or not armed:
                continue
            back = cd[max(0, i - CAST_LOOKBACK) : i]
            if back and max(back) >= full:
                # Reject the flash case: the bar read full, but it was near-empty a moment
                # earlier and near-empty again afterwards, so nothing was ever spent.
                # The median, not the maximum: a flash can run long enough to reach into this
                # window, but not long enough to dominate it.
                ramp = sorted(cd[max(0, i - CAST_LOOKBACK - CAST_RAMP_LOOKBACK) : max(0, i - CAST_LOOKBACK)])
                if ramp and ramp[len(ramp) // 2] < height * CAST_RAMP_FRAC:
                    continue
                spent = sorted(cd[i : i + spent_frames])
                if spent and spent[len(spent) // 2] > empty:
                    continue
                armed = False
                casts.append(times[i])
                events.append(
                    {
                        "t": times[i],
                        "kind": "cast",
                        "slot": slot,
                        "field": "cooldown",
                        "from": max(back),
                        "to": cd[i],
                        "delta": "",
                        "detail": "bar full -> reset",
                        "confidence": "high",
                    }
                )

        # Natural fill per frame, from the median upward step, so a charge can be told apart
        # from ordinary progress.
        ups = sorted(
            d for d in (cd[i] - cd[i - 1] for i in range(1, len(cd))) if 0 < d <= 3
        )
        typical = ups[len(ups) // 2] if ups else 1
        for i in range(1, len(cd) - CHARGE_PERSIST):
            d = cd[i] - cd[i - 1]
            if d < max(CHARGE_MIN_PX, typical * 3) or cd[i] > height:
                continue
            # A real charge moves the bar and the bar *stays* moved. The bars are only 4px wide,
            # so a white VFX flash crossing one reads as a big jump for a frame or two and then
            # falls back; requiring the new level to hold removes almost all of that.
            after = cd[i + 1 : i + 1 + CHARGE_PERSIST]
            if not after or min(after) < cd[i] - 2:
                continue
            # Over a longer window the bar may only leave the new level by being spent, so a
            # fall back towards where it started — with no cast in between — was a flash.
            held = cd[i + 1 : i + 1 + CHARGE_HOLD]
            if held and min(held) <= cd[i - 1] + d // 2 and max(held) > empty:
                continue
            events.append(
                {
                    "t": times[i],
                    "kind": "charge",
                    "slot": slot,
                    "field": "cooldown",
                    "from": cd[i - 1],
                    "to": cd[i],
                    "delta": d,
                    "detail": f"jump of {d}px (normal fill {typical}px/frame)",
                    "confidence": "medium",
                }
            )

        intervals = [round(b - a, 4) for a, b in zip(casts, casts[1:])]
        bar_stats[slot] = {"height": height, "casts": casts, "intervals": intervals}

    # ---- badge values: stat changes ----
    for slot in slots:
        for kind in badge_kinds(fields, slot):
            col = f"{slot}_{kind}"
            prev, prev_t = None, None
            for r, t in zip(rows, times):
                v = to_int(r.get(col))
                if v is None:
                    continue
                if prev is not None and v != prev:
                    events.append(
                        {
                            "t": t,
                            "kind": "stat",
                            "slot": slot,
                            "field": kind,
                            "from": prev,
                            "to": v,
                            "delta": v - prev,
                            "detail": f"{kind} {prev} -> {v}",
                            # A single-frame blip between two stable values is a misread, not a change.
                            "confidence": "high"
                            if prev_t is None or t - prev_t < 0.5
                            else "medium",
                        }
                    )
                prev, prev_t = v, t

    # ---- health bars ----
    for side in ("ally", "enemy"):
        col = f"hp_{side}_px"
        if col not in fields:
            continue
        series = [int(r[col] or 0) for r in rows]
        prev = None
        for i, t in enumerate(times):
            v = series[i]
            # The fill boundary jitters by a few pixels when VFX cross the bar, so only accept a
            # drop that still holds a few frames later. Health only ever decreases.
            if prev is not None and v < prev - 1:
                after = series[i + 1 : i + 1 + CHARGE_PERSIST]
                if after and max(after) <= prev - 1:
                    events.append(
                        {
                            "t": t,
                            "kind": "hp",
                            "slot": side,
                            "field": "hp_px",
                            "from": prev,
                            "to": v,
                            "delta": v - prev,
                            "detail": f"{side} health bar {prev}px -> {v}px",
                            "confidence": "medium",
                        }
                    )
                    prev = v
            elif prev is None or v > prev:
                prev = v

    if battle_end:
        events.append(
            {
                "t": battle_end[0],
                "kind": "battle_end",
                "slot": battle_end[1],
                "field": "hp_px",
                "from": "",
                "to": 0,
                "delta": "",
                "detail": f"{battle_end[1]} health reached zero — data past here is the post-battle screen",
                "confidence": "high",
            }
        )

    events.sort(key=lambda e: (e["t"], e["kind"], e["slot"]))

    # ---- speed-factor estimate from the damage-over-time metronome ----
    #
    # Poison ticks once per game second (Burn twice). Each tick removes health, so the health bar
    # steps down on a fixed cadence that is a clock running in *game* time. Finding that cadence in
    # video time gives the fast-forward multiplier directly, with no calibration recording and no
    # assumption about anybody's cooldown.
    #
    # Cast damage lands between ticks and has to be tolerated rather than removed: the search looks
    # for the period that the largest number of drops line up with, not one that explains them all.
    # Each side has its own metronome, so they must be fitted separately -- interleaving two
    # independent cadences into one series destroys both.
    dot = None
    for side in ("enemy", "ally"):
        drops = sorted(
            {e["t"] for e in events if e["kind"] == "hp" and e["slot"] == side}
        )
        if len(drops) < 5:
            continue
        # Grid-search the period, scored by COVERAGE rather than by match count.
        #
        # Match count alone aliases badly: half the true period matches every real tick plus the
        # cast-damage drops in between, so it scores higher and reports double the speed. The fix
        # is to ask how many of the *expected* tick slots are occupied. A damage-over-time effect
        # ticks on every slot while it is active, so the true period has near-total coverage while
        # a submultiple leaves half its slots empty.
        best = None
        step = 0.002
        period = 0.08
        while period <= 1.3:
            for anchor in drops:
                ks, ts = [], []
                for t in drops:
                    k = round((t - anchor) / period)
                    if abs((t - anchor) - k * period) < period * DOT_PHASE_TOLERANCE:
                        ks.append(k)
                        ts.append(t)
                if len(ks) < 5:
                    continue
                # Distinct slots: two drops landing in one slot (a tick plus cast damage within
                # the tolerance window) is one slot filled, not two, and must not inflate coverage.
                filled = len(set(ks))
                expected_slots = max(ks) - min(ks) + 1
                coverage = filled / expected_slots
                if coverage < DOT_MIN_COVERAGE:
                    continue
                residual = sum(
                    abs((t - anchor) - k * period) for k, t in zip(ks, ts)
                ) / len(ks)
                score = (filled, -residual)
                if best is None or score > best[0]:
                    best = (score, period, ks, ts, coverage)
            period += step
        if best is None:
            continue

        _, period, idx, t_fit, coverage = best
        # Least-squares the period over the matched ticks only.
        n = len(idx)
        mean_k, mean_t = sum(idx) / n, sum(t_fit) / n
        den = sum((k - mean_k) ** 2 for k in idx)
        if den > 0:
            period = sum((k - mean_k) * (t - mean_t) for k, t in zip(idx, t_fit)) / den
        candidate = {
            "side": side,
            "period": round(period, 4),
            "matches": n,
            "coverage": round(coverage, 3),
            "total_drops": len(drops),
            "span": (round(min(t_fit), 3), round(max(t_fit), 3)),
        }
        # Prefer the better-supported fit: coverage first, then how many drops back it, then how
        # much of the battle it spans. A side that barely took damage can produce a high-coverage
        # fit from four points, and that is not evidence.
        key = (candidate["coverage"], candidate["matches"], candidate["total_drops"])
        if dot is None or key > (dot["coverage"], dot["matches"], dot["total_drops"]):
            dot = candidate

    # ---- speed-factor estimate, where a charge ability makes one possible ----
    #
    # A charge grant is a known number of GAME seconds, and it shows up as a known number of
    # bar pixels. Divide a slot's natural fill rate (pixels per VIDEO second) by its pixels per
    # game second and the fast-forward multiplier falls out, with no assumptions about the run's
    # cooldown modifiers. Only works for slots that actually charged.
    speed_estimates = []
    for slot, charge_seconds in charge_slots.items():
        if slot not in slots:
            print(
                f"warning: --charge-slot named '{slot}', which is not in this dataset",
                file=sys.stderr,
            )
            continue
        grants = [
            e["delta"] for e in events if e["kind"] == "charge" and e["slot"] == slot
        ]
        if len(grants) < 3:
            print(
                f"warning: only {len(grants)} charge grants on {slot}; too few to estimate speed",
                file=sys.stderr,
            )
            continue
        px_per_grant = sorted(grants)[len(grants) // 2]
        cd = [int(r[slot + "_cd"] or 0) for r in rows]
        # longest stretch of natural fill: steps of 0 or 1 only, no grants and no resets
        best, start = (0, 0), 0
        for i in range(1, len(cd)):
            if cd[i] - cd[i - 1] in (0, 1):
                if i - start > best[1] - best[0]:
                    best = (start, i)
            else:
                start = i
        a, b = best
        if b - a < 20:
            print(
                f"warning: no clean fill stretch on {slot}; cannot estimate speed",
                file=sys.stderr,
            )
            continue
        rise, dur = cd[b] - cd[a], times[b] - times[a]
        if rise <= 0 or dur <= 0:
            continue
        px_per_video_s = rise / dur
        px_per_game_s = px_per_grant / charge_seconds
        speed_estimates.append(
            {
                "slot": slot,
                "charge_seconds": charge_seconds,
                "px_per_grant": px_per_grant,
                "px_per_game_s": round(px_per_game_s, 2),
                "px_per_video_s": round(px_per_video_s, 2),
                "window": (round(times[a], 3), round(times[b], 3)),
                "speed": round(px_per_video_s / px_per_game_s, 3),
                "full_cooldown_game_s": round(height / px_per_game_s, 2),
            }
        )

    # ---- clusters of near-simultaneous casts: the tie-break candidates ----
    casts = [e for e in events if e["kind"] == "cast"]
    clusters, cur = [], []
    for e in casts:
        if cur and (e["t"] - cur[-1]["t"]) * 1000 > cluster_ms:
            if len(cur) > 1:
                clusters.append(cur)
            cur = []
        cur.append(e)
    if len(cur) > 1:
        clusters.append(cur)

    return events, bar_stats, clusters, speed_estimates, battle_start, battle_end, dot


def write_events(events, path):
    cols = ["t", "kind", "slot", "field", "from", "to", "delta", "confidence", "detail"]
    with open(path, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        for e in events:
            w.writerow({c: e.get(c, "") for c in cols})


def write_timeline(
    events,
    bar_stats,
    clusters,
    speed_estimates,
    battle_start,
    battle_end,
    dot,
    rows,
    path,
    cluster_ms,
    speed,
    dot_interval,
):
    times = [float(r["t"]) for r in rows]
    out = []
    out.append("# Battle timeline")
    out.append("")
    out.append(
        f"Battle window {times[0]:.4f}s - {times[-1]:.4f}s, {len(rows)} frames analysed."
    )
    out.append("")
    if battle_start is not None:
        out.append(
            f"Battle started at t={battle_start:.4f} (both health bars full). Frames before"
        )
        out.append(
            "that are the pre-battle board or a transition and are excluded here -- though the"
        )
        out.append(
            "pre-battle frames are worth querying directly in `frames.csv`, since they show"
        )
        out.append("base stats before any battle-start effect has resolved.")
        out.append("")
    if battle_end:
        out.append(
            f"**Battle ended at t={battle_end[0]:.4f}** ({battle_end[1]} health reached zero)."
        )
        out.append("Everything after that is the post-battle screen and is excluded.")
        out.append("")

    out.append("## Clock")
    out.append("")
    if speed:
        out.append(
            f"Speed factor supplied as **{speed}x**, so every interval below is also given in"
        )
        out.append("game-seconds. Check that against the estimate, if there is one.")
    else:
        out.append(
            "No speed factor supplied (`--speed=N`), so all times are **video** seconds. With"
        )
        out.append(
            "fast-forward engaged these are compressed relative to game time. Ordering and"
        )
        out.append("ratios are unaffected; absolute second-counts are not usable.")
    out.append("")
    if dot:
        out.append(
            f"**Candidate damage-over-time cadence: a health drop every "
            f"{dot['period']:.4f} s of video**,"
        )
        out.append(
            f"on the {dot['side']} health bar: {dot['matches']} of {dot['total_drops']} drops "
            f"across t={dot['span'][0]}-{dot['span'][1]}, filling "
            f"{dot['coverage'] * 100:.0f}% of the expected tick slots."
        )
        out.append("")
        out.append(
            "Poison ticks once per game second (Burn twice), so this cadence is a clock"
        )
        out.append("running in game time:")
        out.append("")
        out.append(
            f"  tick interval assumed {dot_interval} game-s  ->  "
            f"**speed ~ {dot_interval / dot['period']:.2f}x**"
        )
        out.append("")
        out.append(
            "**Treat this as a hypothesis, not a measurement.** Cast damage moves the same bar,"
        )
        out.append(
            "so the fit has to tolerate unexplained drops, and on the reference recording the"
        )
        out.append(
            "answer moved between 1.96x and 2.37x depending on which side was fitted. Judge it"
        )
        out.append(
            "by the coverage and drop counts above: a fit backed by six ticks spanning most of"
        )
        out.append(
            "the battle is worth something, one backed by four points on a barely-damaged bar"
        )
        out.append("is not. Pass `--dot-interval=0.5` if these are Burn ticks.")
        out.append("")

    if speed_estimates:
        out.append(
            "A second, independent route via charge grants (a grant is a known number of *game* seconds, and"
        )
        out.append(
            "shows up as a known number of bar pixels, so the ratio against the natural fill"
        )
        out.append(
            "rate gives the multiplier with no assumptions about cooldown modifiers):"
        )
        out.append("")
        out.append(
            "| Slot | charge | px/grant | px/game-s | px/video-s | implied speed | that mon's full cooldown |"
        )
        out.append("|---|---|---|---|---|---|---|")
        for e in speed_estimates:
            out.append(
                f"| `{e['slot']}` | {e['charge_seconds']}s | {e['px_per_grant']} | "
                f"{e['px_per_game_s']} | {e['px_per_video_s']} | **{e['speed']}x** | "
                f"{e['full_cooldown_game_s']}s |"
            )
        out.append("")
        out.append(
            "The last column is a bonus and is **fast-forward independent**: the bar's full"
        )
        out.append(
            "height divided by pixels-per-game-second is that mon's effective cooldown in"
        )
        out.append(
            "real game seconds, which compared against its base cooldown gives the run's"
        )
        out.append("cooldown modifier directly.")
        out.append("")
        out.append(
            "Treat this speed figure as a sanity check only. Both inputs carry a pixel or two"
        )
        out.append(
            "of error, which is 10-20% on the result, and on the reference recording it"
        )
        out.append(
            "disagreed with the metronome (1.50x vs 1.98x). When two routes disagree, one of"
        )
        out.append(
            "the assumptions is false -- do not average them. Record the same board at 1x to"
        )
        out.append("settle it.")
    if not dot and not speed_estimates:
        out.append(
            "Neither a DOT cadence nor charge grants were found, so the speed factor cannot"
        )
        out.append(
            "be estimated here. Record a known board at 1x to calibrate each level once."
        )
    out.append("")

    out.append("## Cooldown cadence per slot")
    out.append("")
    out.append("| Slot | Bar height (px) | Casts | Cast times | Intervals |")
    out.append("|---|---|---|---|---|")
    for slot, s in bar_stats.items():
        if not s.get("casts"):
            out.append(f"| `{slot}` | {s['height']} | 0 | — | — |")
            continue
        ts = ", ".join(f"{c:.4f}" for c in s["casts"][:8])
        ivs = s.get("intervals", [])[:8]
        if speed:
            iv = ", ".join(f"{i:.3f} ({i * speed:.2f}g)" for i in ivs)
        else:
            iv = ", ".join(f"{i:.3f}" for i in ivs)
        out.append(f"| `{slot}` | {s['height']} | {len(s['casts'])} | {ts} | {iv} |")
    out.append("")
    out.append(
        "An interval that stays constant across cycles is that mon's effective cooldown."
    )
    out.append(
        "Comparing it against the creature's base cooldown gives the run's cooldown"
    )
    out.append("modifier, without needing to know the fast-forward factor.")
    out.append("")

    out.append(f"## Near-simultaneous cast clusters (within {cluster_ms:.0f} ms)")
    out.append("")
    if not clusters:
        out.append(
            "None. No two mons cast close enough together to be tie-break candidates."
        )
    else:
        out.append(
            "These are the tie-break candidates. A cluster is **not** proof of a tie: if the"
        )
        out.append(
            "gap is more than a frame or two, the later mon may simply have become ready"
        )
        out.append("later. Check the gap column before drawing conclusions.")
        out.append("")
        for i, c in enumerate(clusters, 1):
            span = (c[-1]["t"] - c[0]["t"]) * 1000
            out.append(
                f"**Cluster {i}** — t={c[0]['t']:.4f} to {c[-1]['t']:.4f} ({span:.1f} ms span)"
            )
            out.append("")
            out.append("| t | slot | gap from previous |")
            out.append("|---|---|---|")
            for j, e in enumerate(c):
                gap = "—" if j == 0 else f"{(e['t'] - c[j - 1]['t']) * 1000:.1f} ms"
                out.append(f"| {e['t']:.4f} | `{e['slot']}` | {gap} |")
            out.append("")

    out.append("## Event log")
    out.append("")
    out.append(
        "`stat` rows are the load-bearing ones: a badge delta is a *value* the game"
    )
    out.append("computed, which is what pins down which inputs an effect read.")
    out.append("")
    out.append("| t | kind | slot | change | delta | conf |")
    out.append("|---|---|---|---|---|---|")
    for e in events:
        if e["kind"] == "charge" and e["confidence"] != "high":
            pass  # keep: charge grants are the whole point for charge-based mons
        delta = e.get("delta", "")
        delta = f"{delta:+}" if isinstance(delta, int) else ""
        out.append(
            f"| {e['t']:.4f} | {e['kind']} | `{e['slot']}` | {e['detail']} | {delta} | {e['confidence'][0].upper()} |"
        )
    out.append("")

    with open(path, "w") as fh:
        fh.write("\n".join(out) + "\n")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 2:
        sys.exit(__doc__)
    cluster_ms, speed, charge_slots, dot_interval = 60.0, None, {}, 1.0
    for a in sys.argv[1:]:
        if a.startswith("--cluster-ms="):
            cluster_ms = float(a.split("=", 1)[1])
        elif a.startswith("--speed="):
            speed = float(a.split("=", 1)[1])
        elif a.startswith("--dot-interval="):
            dot_interval = float(a.split("=", 1)[1])
        elif a.startswith("--charge-slot="):
            # slot[:seconds] -- the engine cannot know which mon has a charge ability, and
            # guessing produces nonsense from VFX noise on slots that have none
            spec = a.split("=", 1)[1]
            slot, _, secs = spec.partition(":")
            charge_slots[slot] = float(secs) if secs else 1.0

    frames_path, out_dir = args[0], args[1]
    os.makedirs(out_dir, exist_ok=True)
    rows = read_frames(frames_path)
    events, bar_stats, clusters, speed_estimates, battle_start, battle_end, dot = (
        detect(rows, cluster_ms, charge_slots)
    )

    write_events(events, os.path.join(out_dir, "events.csv"))
    write_timeline(
        events,
        bar_stats,
        clusters,
        speed_estimates,
        battle_start,
        battle_end,
        dot,
        rows,
        os.path.join(out_dir, "timeline.md"),
        cluster_ms,
        speed,
        dot_interval,
    )

    by_kind = defaultdict(int)
    for e in events:
        by_kind[e["kind"]] += 1
    if battle_start is not None:
        print(
            f"battle window: t={battle_start:.4f} .. "
            + (
                f"{battle_end[0]:.4f} ({battle_end[1]} reached 0 HP)"
                if battle_end
                else "end of clip"
            )
        )
    print(
        f"{len(events)} events: "
        + ", ".join(f"{k}={v}" for k, v in sorted(by_kind.items()))
    )
    print(
        f"{len(clusters)} near-simultaneous cast cluster(s) within {cluster_ms:.0f} ms"
    )
    if dot:
        print(
            f"DOT metronome ({dot['side']}): tick every {dot['period']:.4f}s video, "
            f"{dot['matches']}/{dot['total_drops']} drops, {dot['coverage'] * 100:.0f}% slot "
            f"coverage -> speed {dot_interval / dot['period']:.3f}x at a {dot_interval}s tick"
        )
    for e in speed_estimates:
        print(
            f"charge-based speed estimate from {e['slot']}: {e['speed']}x "
            f"(its effective cooldown: {e['full_cooldown_game_s']} game-s)"
        )
    print(f"wrote {out_dir}/events.csv and {out_dir}/timeline.md")


if __name__ == "__main__":
    main()
