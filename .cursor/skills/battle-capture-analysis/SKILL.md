---
name: battle-capture-analysis
description: Extracts frame-accurate battle state from a Batomon Showdown screen recording into a queryable dataset, then derives cast times, cooldown cadence, charge grants, stat changes, and near-simultaneous cast clusters. Use when a recording of a fight needs to be turned into evidence about game mechanics — resolution order, tie-breaks, effect timing, which values an ability reads — or when verifying the simulation engine against real gameplay.
disable-model-invocation: true
---

# Battle capture analysis

Turns a screen recording of a fight into two files that answer mechanics questions without
touching the video again.

**Extract once, query many times.** The video pass is slow (~1 minute per 10 seconds of
footage) and every follow-up question would otherwise re-run it. So the pipeline front-loads
everything into `frames.csv` — one row per frame, every stat badge and cooldown bar on the
board — and all later analysis is a query against that file.

## Quick start

```bash
.cursor/skills/battle-capture-analysis/scripts/analyze.sh <recording.mp4> <out-dir> [t0] [t1] \
    [--speed=N] [--charge-slot=SLOT[:SECONDS]]
```

Produces, in `<out-dir>`:

| File | What it holds |
|---|---|
| `frames.csv` | One row per frame. Every mon's cooldown bar fill and typed stat badges, both teams. **The dataset.** |
| `events.csv` | Derived events: casts, charge grants, stat changes, health drops. Machine-queryable. |
| `timeline.md` | Readable narrative, per-slot cooldown cadence, and the near-simultaneous cast clusters. |
| `layout-check.png` | The frame with every measurement box drawn on it. Check this before trusting numbers. |

Re-deriving events never re-reads the video, so changing a flag or threshold costs a second:

```bash
python3 scripts/bcevents.py out/frames.csv out --speed=2 --charge-slot=ally_front_2:1
```

Then query the dataset:

```bash
python3 scripts/bcquery.py cols    out/frames.csv            # what was captured
python3 scripts/bcquery.py order   out/frames.csv 4.1 4.4    # which effect landed first
python3 scripts/bcquery.py changes out/frames.csv ally_front_0_dmg
python3 scripts/bcquery.py at      out/frames.csv 3.26       # full board state at a moment
```

## Frame size vs. game canvas

**Layouts are keyed on the game canvas, not the video frame, so one layout covers any capture of
the same aspect ratio.** A phone recording at 2316x1080 holds a 1920x1080 canvas pillarboxed with
198px black bars either side; a desktop capture of the same game has no bars at all. The pipeline
detects the canvas per recording and scales the layout onto it.

```bash
bcscan canvas <video>        # frame size, canvas size and position, aspect, bar widths
```

Detection votes across nine frames rather than trusting one. A single frame undershoots, because
the game's own artwork can be near-black at the canvas edge; a union across frames overshoots,
because one transition frame with content in the bar region widens it permanently.

Two consequences worth knowing:

- **A different frame size with the same 16:9 canvas needs nothing.** Desktop recordings work.
- **A different canvas *size* needs the glyph set re-learned**, because templates are pixel masks
  at a specific scale. The geometry scales fine and `analyze.sh` will reuse a same-aspect layout
  and tell you, but `learn` + `autolabel` has to run once for the new scale. That is two commands.
- A different canvas *aspect* means the game laid the board out differently, and needs its own
  layout calibrated.

## What the dataset contains

Slots are `{ally,enemy}_{back,front}_{0,1,2}` — row then column, left to right from the
viewer's perspective. Per slot:

- `<slot>_cd` — cooldown bar fill in pixels. **normalized: the bar's full height is that mon's
  entire cooldown**, whatever its length. So `cd` is effectively percent-charged, and the step
  between consecutive casts gives the effective cooldown without needing to know the game's
  clock.
- `<slot>_dmg`, `_poison`, `_heal`, `_mult`, `_burn`, `_other` — stat badges, keyed by **what
  the badge is** (from its fill colour), not by where it sat under the mon.
- `<slot>_raw` — the left-to-right reading as `kind=value|kind=value`, preserving position.

Plus `hp_ally_px` / `hp_enemy_px`, the health bar fill boundary.

An empty badge cell means the read was **rejected**, not that the value was zero. That is
deliberate: a badge obscured by a spell effect produces a blank rather than a guess, because a
silently wrong number in the dataset is far worse than a gap.

## How to use it for mechanics work

The three signals that carry almost all the evidence:

1. **Cooldown bar resets are cast times.** A bar going from near-full to near-empty is a cast.
   `timeline.md`'s cadence table gives every cast time and the intervals between them.
2. **Badge deltas are values the game computed.** This is the load-bearing one. When a buff
   lands and one mon gains +6 while another gains +10, the arithmetic tells you the game
   re-evaluated a percentage multiplier over `base + flat` rather than adding to a snapshot.
   Use `bcquery.py order` to see deltas in the order they landed.
3. **Mid-fill bar jumps are charge grants.** A bar advancing further in one frame than it could
   have filled is a charge ability firing. Divide the jump by the bar height to convert it into
   seconds of that mon's cooldown.

## Reading the results honestly

These limits are not incidental; they decide which conclusions the footage can support.

- **Fast-forward does not affect ordering or ratios, only absolute times.** Every cast time,
  interval and badge delta is still exact; they are just in video seconds. Pass `--speed=N` to get
  game-seconds printed alongside.
- **`timeline.md` proposes a speed factor two different ways, and they may disagree.** Poison ticks
  once per game second, so health-bar drops give a cadence; and a charge grant converts bar pixels
  into game seconds. On the reference recording these said ~2.0x and ~1.5x. Both are hypotheses:
  cast damage pollutes the first and pixel error dominates the second. **The only exact method is
  to record the same board at 1x and at each fast-forward level once**, then pass `--speed=N`
  forever. Do not average disagreeing estimates — one of the assumptions is false.
- **One quantity is fast-forward independent and worth more than the rest**: a charge ability
  grants a known number of *game* seconds and shows up as a known number of bar pixels, so
  `--charge-slot` yields that mon's effective cooldown in real game seconds with no calibration at
  all. The tool cannot tell which mon charges, so name it explicitly — the bars are 4px wide and
  spell effects crossing one look like grants.
- **A cluster is not a tie.** `timeline.md` lists casts that land close together, but if the gap
  is more than a frame or two the later mon may simply have become ready later. Check the gap
  column. Proving a tie-break rule needs a recording where two mons become ready on the *same*
  frame.
- **Analysis stops at battle end.** The frame where a side's health hits zero is detected and
  everything after is dropped, because the post-battle screen puts unrelated artwork under the
  layout rectangles. On the reference recording that removed 151 of 397 "events".
- **Spell effects hide badges.** Expect gaps during heavy VFX. If a value changes while hidden,
  you see the total change, not the individual steps.
- **Large numbers lose precision.** The game abbreviates past ~10000, so `16K` is parsed as
  16000 with the last three digits genuinely unknown.
- **Charge events are marked medium confidence.** Cooldown bars are 4px wide, so a white effect
  crossing one can read as a jump. The detector requires the new level to hold for three frames,
  which removes most of it, but check `_cd` directly before relying on a single grant.

## When something looks wrong

Check `layout-check.png` first — a shifted box explains most bad data. Then:

| Symptom | Cause | Fix |
|---|---|---|
| A mon appears to cast twice, a fraction of a second apart | A cast animation's flash crossed its own bar | Already rejected by the ramp test; if one survives, check `<slot>_cd` — a real cast is preceded by a ramp, a flash by a near-empty bar |
| All badges blank | Glyph set unlabelled or wrong frame size | `bcscan glyphdump`, then `autolabel` (see reference.md) |
| Badges blank for one mon | Band misplaced | `bcscan findtext` to re-measure, edit the layout |
| `cd` stuck at 0 | Bar column off by a pixel or two | `bcscan findbars` to re-measure |
| Digits misread | Advance mis-measured | Re-run `learn`; check the reported advance is non-integer and near the ink width + 3 |
| No layout for this frame size | New capture resolution | Calibrate a new layout — reference.md |

## Reference

- Calibrating a new recording, labelling the glyph set, the full subcommand list, the data
  dictionary, and how the recogniser works: [reference.md](reference.md)
- A worked example — the findings this pipeline was built to produce, with the evidence for
  each: `specs/001-batomon-dps-calculator/orchestration/engine-handoff-gameplay-capture.md`
