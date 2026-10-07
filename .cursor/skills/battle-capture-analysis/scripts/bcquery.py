#!/usr/bin/env python3
"""Query a bcscan frames.csv without re-reading the video.

frames.csv is the whole dataset; every follow-up question should be answered from it. These are
the queries that actually came up while reverse-engineering resolution order, packaged so they
are one command instead of a fresh script each time.

  bcquery.py cols    <frames.csv> [substring]
      List columns, optionally filtered. Start here to find out what was captured.

  bcquery.py at      <frames.csv> <t>
      Every non-empty measurement at the frame nearest t. The "what was on screen" query.

  bcquery.py series  <frames.csv> <col> [col...]
      Timeline of the given columns, collapsing runs of unchanged values. This is the
      workhorse: it turns 1000 frames into the dozen moments where something happened.

  bcquery.py changes <frames.csv> <col> [col...]
      Only the transitions, with deltas for numeric columns.

  bcquery.py window  <frames.csv> <t0> <t1> [col...]
      Every frame in a time range. Use when you need to see frame-by-frame ordering.

  bcquery.py order   <frames.csv> <t0> <t1>
      Badge changes in a window, in the order they landed, across all slots. This is the
      query that answers "which effect resolved first".
"""

from __future__ import annotations

import csv
import sys


def load(path):
    with open(path, newline="") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        sys.exit(f"{path}: no data rows")
    return rows


def num(s):
    if not s or s == "?":
        return None
    s = s.lstrip("X")
    mult = 1000 if s.endswith("K") else 1
    s = s[:-1] if s.endswith("K") else s
    return int(s) * mult if s.isdigit() else None


def resolve_cols(rows, names):
    """Accept exact column names or substrings, so `bcquery series ally_front_0` works."""
    fields = list(rows[0].keys())
    out = []
    for n in names:
        if n in fields:
            out.append(n)
            continue
        hits = [f for f in fields if n in f]
        if not hits:
            sys.exit(f"no column matching '{n}'. Try: bcquery.py cols {sys.argv[2]}")
        out.extend(hits)
    seen, uniq = set(), []
    for c in out:
        if c not in seen:
            seen.add(c)
            uniq.append(c)
    return uniq


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    mode, path = sys.argv[1], sys.argv[2]
    rows = load(path)
    rest = sys.argv[3:]

    if mode == "cols":
        filt = rest[0] if rest else ""
        for f in rows[0].keys():
            if filt in f:
                print(f)
        return

    if mode == "at":
        t = float(rest[0])
        row = min(rows, key=lambda r: abs(float(r["t"]) - t))
        print(f"frame at t={row['t']} (requested {t})")
        for k, v in row.items():
            if v not in ("", None) and k not in ("t", "frame"):
                print(f"  {k:28s} {v}")
        return

    if mode == "window":
        t0, t1 = float(rest[0]), float(rest[1])
        cols = resolve_cols(rows, rest[2:]) if len(rest) > 2 else \
            [c for c in rows[0] if c.endswith("_raw") or c.endswith("_cd")]
        print("t        " + " ".join(f"{c[:22]:>22s}" for c in cols))
        for r in rows:
            if t0 <= float(r["t"]) <= t1:
                print(f"{float(r['t']):8.4f} " + " ".join(f"{(r[c] or '-')[:22]:>22s}" for c in cols))
        return

    if mode in ("series", "changes"):
        cols = resolve_cols(rows, rest)
        prev = None
        print("t        " + " ".join(f"{c[:22]:>22s}" for c in cols))
        for r in rows:
            cur = tuple(r[c] for c in cols)
            if mode == "changes" and prev is not None:
                # ignore transitions into a failed read; they are occlusion, not change
                if any(a != b and b in ("", "?") for a, b in zip(prev, cur)):
                    continue
            if cur != prev:
                line = f"{float(r['t']):8.4f} " + " ".join(f"{(v or '-')[:22]:>22s}" for v in cur)
                if mode == "changes" and prev is not None:
                    deltas = []
                    for a, b in zip(prev, cur):
                        na, nb = num(a), num(b)
                        deltas.append(f"{nb - na:+d}" if na is not None and nb is not None and na != nb else "")
                    if any(deltas):
                        line += "   " + " ".join(d for d in deltas if d)
                print(line)
                prev = cur
        return

    if mode == "order":
        t0, t1 = float(rest[0]), float(rest[1])
        # badge columns only: cooldown bars have their own ordering view (bcevents clusters),
        # and the health bars jitter by a pixel under VFX, which would bury the real changes
        cols = [c for c in rows[0]
                if not c.endswith(("_raw", "_cd", "_width"))
                and not c.startswith("hp_")
                and c not in ("t", "frame")]
        last = {}
        for r in rows:
            if not (t0 <= float(r["t"]) <= t1):
                # still track values before the window so the first in-window change has a baseline
                if float(r["t"]) < t0:
                    for c in cols:
                        v = num(r[c])
                        if v is not None:
                            last[c] = v
                continue
            for c in cols:
                v = num(r[c])
                if v is None:
                    continue
                if c in last and v != last[c]:
                    print(f"{float(r['t']):8.4f}  {c:30s} {last[c]:>8d} -> {v:<8d} {v - last[c]:+d}")
                last[c] = v
        return

    sys.exit(__doc__)


if __name__ == "__main__":
    main()
