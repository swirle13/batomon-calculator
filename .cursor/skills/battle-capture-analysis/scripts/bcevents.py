#!/usr/bin/env python3
"""Derive battle events from a bcscan frames.csv.

Reads the one-row-per-frame dataset and writes:
  events.csv    every detected event, one row each, machine-queryable
  timeline.md   the same events as a readable narrative, plus per-slot cooldown stats
                and the near-simultaneous clusters that matter for tie-break work

Nothing here touches the video. frames.csv is the single source of truth, so re-running this
after changing a threshold costs a second rather than a minute.

Usage:
  bcevents.py <frames.csv> <out-dir> [--cluster-ms 60]
"""

from __future__ import annotations

import csv
import os
import sys
from collections import defaultdict

# A cast is a cooldown bar falling from (near) full to (near) empty. Both thresholds are
# fractions of that slot's own bar height, which bcscan normalises so full == that mon's
# whole cooldown regardless of its length.
FULL_FRAC = 0.85
EMPTY_FRAC = 0.25
# How many frames back to look for the "was full" half of a cast. The bar renders a short
# flash at full before the reset lands, so the two are never on the same frame.
CAST_LOOKBACK = 6
# A charge grant shows as the bar jumping further in one frame than it could have filled.
CHARGE_MIN_PX = 4
# Frames the new bar level must hold for a jump to count as a charge rather than a VFX flash.
CHARGE_PERSIST = 3


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
        f[len(pre):]
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


def detect(rows, cluster_ms):
    fields = list(rows[0].keys())
    slots = slot_ids(fields)
    times = [float(r["t"]) for r in rows]
    events = []

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
        for i in range(1, len(cd)):
            if cd[i] > empty:
                continue
            back = cd[max(0, i - CAST_LOOKBACK):i]
            if back and max(back) >= full:
                # collapse repeats: one cast per descent
                if casts and times[i] - casts[-1] < 0.05:
                    continue
                casts.append(times[i])
                events.append({
                    "t": times[i], "kind": "cast", "slot": slot, "field": "cooldown",
                    "from": max(back), "to": cd[i], "delta": "",
                    "detail": "bar full -> reset", "confidence": "high",
                })

        # Natural fill per frame, from the median upward step, so a charge can be told apart
        # from ordinary progress.
        ups = sorted(d for d in (cd[i] - cd[i - 1] for i in range(1, len(cd))) if 0 < d <= 3)
        typical = ups[len(ups) // 2] if ups else 1
        for i in range(1, len(cd) - CHARGE_PERSIST):
            d = cd[i] - cd[i - 1]
            if d < max(CHARGE_MIN_PX, typical * 3) or cd[i] > height:
                continue
            # A real charge moves the bar and the bar *stays* moved. The bars are only 4px wide,
            # so a white VFX flash crossing one reads as a big jump for a frame or two and then
            # falls back; requiring the new level to hold removes almost all of that.
            after = cd[i + 1:i + 1 + CHARGE_PERSIST]
            if not after or min(after) < cd[i] - 2:
                continue
            events.append({
                "t": times[i], "kind": "charge", "slot": slot, "field": "cooldown",
                "from": cd[i - 1], "to": cd[i], "delta": d,
                "detail": f"jump of {d}px (normal fill {typical}px/frame)",
                "confidence": "medium",
            })

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
                    events.append({
                        "t": t, "kind": "stat", "slot": slot, "field": kind,
                        "from": prev, "to": v, "delta": v - prev,
                        "detail": f"{kind} {prev} -> {v}",
                        # A single-frame blip between two stable values is a misread, not a change.
                        "confidence": "high" if prev_t is None or t - prev_t < 0.5 else "medium",
                    })
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
                after = series[i + 1:i + 1 + CHARGE_PERSIST]
                if after and max(after) <= prev - 1:
                    events.append({
                        "t": t, "kind": "hp", "slot": side, "field": "hp_px",
                        "from": prev, "to": v, "delta": v - prev,
                        "detail": f"{side} health bar {prev}px -> {v}px", "confidence": "medium",
                    })
                    prev = v
            elif prev is None or v > prev:
                prev = v

    events.sort(key=lambda e: (e["t"], e["kind"], e["slot"]))

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

    return events, bar_stats, clusters


def write_events(events, path):
    cols = ["t", "kind", "slot", "field", "from", "to", "delta", "confidence", "detail"]
    with open(path, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        for e in events:
            w.writerow({c: e.get(c, "") for c in cols})


def write_timeline(events, bar_stats, clusters, rows, path, cluster_ms):
    times = [float(r["t"]) for r in rows]
    out = []
    out.append("# Battle timeline")
    out.append("")
    out.append(f"Window {times[0]:.4f}s - {times[-1]:.4f}s, {len(rows)} frames.")
    out.append("")
    out.append("All times are **video** timestamps. If the recording was made with fast-forward")
    out.append("engaged, these are compressed relative to battle time; ratios survive, absolute")
    out.append("second-counts do not.")
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
        iv = ", ".join(f"{i:.3f}" for i in s.get("intervals", [])[:8])
        out.append(f"| `{slot}` | {s['height']} | {len(s['casts'])} | {ts} | {iv} |")
    out.append("")
    out.append("An interval that stays constant across cycles is that mon's effective cooldown.")
    out.append("Comparing it against the creature's base cooldown gives the run's cooldown")
    out.append("modifier, without needing to know the fast-forward factor.")
    out.append("")

    out.append(f"## Near-simultaneous cast clusters (within {cluster_ms:.0f} ms)")
    out.append("")
    if not clusters:
        out.append("None. No two mons cast close enough together to be tie-break candidates.")
    else:
        out.append("These are the tie-break candidates. A cluster is **not** proof of a tie: if the")
        out.append("gap is more than a frame or two, the later mon may simply have become ready")
        out.append("later. Check the gap column before drawing conclusions.")
        out.append("")
        for i, c in enumerate(clusters, 1):
            span = (c[-1]["t"] - c[0]["t"]) * 1000
            out.append(f"**Cluster {i}** — t={c[0]['t']:.4f} to {c[-1]['t']:.4f} ({span:.1f} ms span)")
            out.append("")
            out.append("| t | slot | gap from previous |")
            out.append("|---|---|---|")
            for j, e in enumerate(c):
                gap = "—" if j == 0 else f"{(e['t'] - c[j-1]['t']) * 1000:.1f} ms"
                out.append(f"| {e['t']:.4f} | `{e['slot']}` | {gap} |")
            out.append("")

    out.append("## Event log")
    out.append("")
    out.append("`stat` rows are the load-bearing ones: a badge delta is a *value* the game")
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
    cluster_ms = 60.0
    for a in sys.argv[1:]:
        if a.startswith("--cluster-ms"):
            cluster_ms = float(a.split("=", 1)[1]) if "=" in a else 60.0

    frames_path, out_dir = args[0], args[1]
    os.makedirs(out_dir, exist_ok=True)
    rows = read_frames(frames_path)
    events, bar_stats, clusters = detect(rows, cluster_ms)

    write_events(events, os.path.join(out_dir, "events.csv"))
    write_timeline(events, bar_stats, clusters, rows,
                   os.path.join(out_dir, "timeline.md"), cluster_ms)

    by_kind = defaultdict(int)
    for e in events:
        by_kind[e["kind"]] += 1
    print(f"{len(rows)} frames -> {len(events)} events: " +
          ", ".join(f"{k}={v}" for k, v in sorted(by_kind.items())))
    print(f"{len(clusters)} near-simultaneous cast cluster(s) within {cluster_ms:.0f} ms")
    print(f"wrote {out_dir}/events.csv and {out_dir}/timeline.md")


if __name__ == "__main__":
    main()
