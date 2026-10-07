# battle-capture-analysis — reference

Detail behind [SKILL.md](SKILL.md): the subcommand list, how to calibrate a new recording, the
data dictionary, and why the recogniser is built the way it is.

## Why native Swift

`bcscan.swift` uses AVFoundation and CoreGraphics directly, with no ffmpeg and no Python
packages, because this machine has neither and installing them is a worse dependency than ~700
lines of Swift. `swiftc` ships with Xcode's command line tools. `analyze.sh` rebuilds the binary
automatically when the source is newer, and the binary is gitignored.

## Subcommands

```
bcscan info      <video>
bcscan probe     <video> <t> <x> <y> <w> <h>
bcscan palette   <video> <t> <x> <y> <w> <h>
bcscan findbars  <video> <t> <x0> <x1> <yTop> <yBot>
bcscan findtext  <video> <t> <x0> <x1> <yTop> <yBot> [minCol]
bcscan overlay   <video> <layout.json> <t> <out.png>
bcscan sheet     <video> <layout.json> <out.png> <t0> <nframes> <stride>
bcscan learn     <video> <layout.json> <out-dir> <t0> <t1> <stride>
bcscan glyphdump <glyphs.json> [limit] [cols]
bcscan label     <glyphs.json> <idx:char,idx:char,...>
bcscan autolabel <video> <layout.json> <glyphs.json> <truth.csv>
bcscan scan      <video> <layout.json> <glyphs.json> <out.csv> <t0> <t1>
```

`probe` and `palette` are the eyes: `probe` dumps a rect as an ASCII luminance map, `palette`
lists its most common colours. Everything else was calibrated with those two.

`sheet` builds a contact sheet with one row per frame — useful for watching an animation play
out, but prefer querying `frames.csv` over looking at pictures.

## Calibrating a new recording

Only needed when the frame size changes. Layouts live in `layouts/<width>x<height>.json`.

**1. Find the cooldown bar columns.** Bars are narrow bright vertical tracks left of each mon.
Sweep a y-band that crosses them; the bars are the ~4px runs repeating at a constant pitch.

```bash
bcscan findbars <video> 3.0 400 2000 437 507    # back row
bcscan findbars <video> 3.0 400 2000 657 727    # front row
```

In the reference 2316x1080 layout this gave back-row bars at x = 526, 742, 958 (ally) and 1354,
1570, 1786 (enemy); front-row at 454, 670, 886 and 1426, 1642, 1858. Pitch is 216 px in both
rows. Bar track y is 437–507 (back) and 657–727 (front), 71 px tall.

To find the y range for a new capture, `probe` a tall thin rect at a bar's x and look for the
column that is solid bright when the mon is about to cast.

**2. Find the badge bands.** Badges sit below each mon.

```bash
bcscan findtext <video> 3.0 400 1150 510 555    # ally back row
bcscan findtext <video> 3.0 380 1100 712 760    # ally front row
```

Each reported run is one badge. Give each slot a band one slot-pitch wide, centred on its mon,
so bands tile without overlapping. Keep the front-row band **below** the cooldown bar's bottom
edge or the bar reads as a badge.

**3. Find the health bars.** The fill boundary is measured, not the text, so the rect just needs
to span the bar. Give it a y range that covers the green and an x range from the bar's left edge
to its right edge.

**4. Verify.**

```bash
bcscan overlay <video> layouts/<new>.json 4.0 /tmp/check.png
```

Red boxes must sit on cooldown bars, blue on badge groups, yellow on health bars. Fix the JSON
until they do. This takes one iteration and saves a bad dataset.

## Labelling the glyph set

The game draws numbers in a fixed-pitch pixel font, so recognition is template matching. The
templates are harvested from the recording itself, then labelled.

**1. Harvest.** `analyze.sh` does this automatically if `layouts/<size>.glyphs.json` is missing;
manually it is:

```bash
bcscan learn <video> layouts/<size>.json /tmp/g 2.0 11.0 0.05
```

It reports the measured **advance** (spacing between characters) and **ink width**, then writes
`glyphs.json` with templates ordered by frequency. Expect a few hundred templates: the real
characters are the frequent ones and the long tail is spell-effect debris.

**2. Label from ground truth** — the reliable path. Write `layouts/<size>.truth.csv` with badge
readings you can see with your own eyes:

```
t,slotId,runIndex,text
3.2600, ally_back_0, 0, 7082
3.2600, ally_back_1, 2, X2
```

`runIndex` is the badge's position under that mon, left to right, 0-based. Use `bcscan overlay`
to confirm which slot is which. Then:

```bash
bcscan autolabel <video> layouts/<size>.json layouts/<size>.glyphs.json layouts/<size>.truth.csv
```

It slices those badges on the advance grid, matches each character cell to a template, and
assigns labels by majority vote. It is self-checking: a line whose character count disagrees
with the slice count is reported and skipped rather than poisoning the set. Aim to cover `0`–`9`,
`X` (multicast) and `K` (thousands abbreviation) — around 30 ground-truth lines from two clean
frames is enough. The reference recording needed `39` for `3` and `16K` for `K`.

**3. Label by eye** — fallback when you cannot read any frame confidently:

```bash
bcscan glyphdump layouts/<size>.glyphs.json 40 6
bcscan label layouts/<size>.glyphs.json 0:X,1:2,2:0,3:1,...
```

`glyphdump` prints templates as ASCII bitmaps with indices. Leave noise entries blank; blank
templates are ignored at scan time.

## How the recogniser works, and the two things that broke it

Worth knowing because both failure modes produce *plausible wrong numbers*, which is the one
outcome the dataset must not contain.

**The advance is fractional.** The recording is an upscale of the game's framebuffer, so a font
that advances a whole number of game pixels advances by a fraction of a capture pixel — 14.412 px
in the reference recording, against an 11 px ink width. Treating it as an integer makes the slice
grid drift a pixel per character and shreds anything longer than three digits. `learn` measures it
by averaging the step between consecutive characters' ink across every multi-digit badge.

**Characters must be sliced by position, not by their own ink.** Segmenting each character at its
own ink boundary gives a box that shifts depending on which stroke happens to be leftmost, which
splits one digit into dozens of near-identical templates (2500+ before this was fixed, versus
~600 after, of which ~55 get labelled). Slicing on the advance grid instead puts every instance
of a character in the same window. Residual phase error is absorbed by matching over a ±3 px
shift.

Matching rejects a cell when the nearest template is far away, **and** when the two nearest
templates carry different labels and are close enough that choosing between them is a coin flip.
A badge is only emitted if every one of its characters matched.

## Data dictionary

`frames.csv`, one row per frame:

| Column | Meaning |
|---|---|
| `t` | Video timestamp, seconds, 4dp |
| `frame` | Frame index from `t0` |
| `<slot>_cd` | Cooldown bar fill, px. Full height = that mon's whole cooldown |
| `<slot>_dmg` | Damage badge (crimson fill) |
| `<slot>_poison` | Poison badge (purple fill) |
| `<slot>_heal` | Heal badge (blue fill) |
| `<slot>_mult` | Multicast badge (`X`-prefixed) |
| `<slot>_burn` | Burn badge (orange fill) |
| `<slot>_other` | Badge whose fill hue is not in the table above |
| `<slot>_raw` | Left-to-right reading, `kind=value|kind=value`; `?` = read rejected |
| `hp_<side>_px` | Health bar fill boundary, px from the bar's left edge |
| `hp_<side>_width` | Bar width, px, so the fraction is `px / width` |

Badge kinds come from the fill hue: Damage ~345°, Burn ~30°, Poison ~259°, Heal ~195°. Heal and
Multicast share a colour, so Multicast is identified by its `X` prefix. Unknown hues land in
`_other` and still appear in `_raw`, so a badge kind this skill has not seen is visible rather
than dropped.

`events.csv`:

| Column | Meaning |
|---|---|
| `t` | Video timestamp |
| `kind` | `cast`, `charge`, `stat`, `hp` |
| `slot` | Slot id, or `ally`/`enemy` for `hp` |
| `field` | `cooldown`, or the badge kind |
| `from`, `to`, `delta` | The transition |
| `confidence` | `high` / `medium` — see SKILL.md's caveats |
| `detail` | Human-readable description |

## Tuning event detection

`bcevents.py` constants, all near the top of the file:

| Constant | Default | Effect |
|---|---|---|
| `FULL_FRAC` | 0.85 | How full a bar must get to count as ready |
| `EMPTY_FRAC` | 0.25 | How empty it must then be to count as a cast |
| `CAST_LOOKBACK` | 6 | Frames to look back for the "was full" half |
| `CHARGE_MIN_PX` | 4 | Smallest bar jump treated as a charge |
| `CHARGE_PERSIST` | 3 | Frames the new level must hold (VFX rejection) |

Re-running after a change costs a second, since it reads `frames.csv` rather than the video.
`--cluster-ms=N` controls how close two casts must be to be grouped as a tie-break candidate;
60 ms is the default and ~7 frames at 111 fps.

## Recording checklist

Worth getting right, because re-recording is cheaper than working around a bad capture.

1. **Fast-forward off.** Otherwise every absolute timing is unusable.
2. Highest frame rate available. The reference capture is 111 fps, which is ~9 ms per frame and
   plenty to separate same-tick events.
3. Start recording before the battle begins. The pre-battle board shows base stats, and the
   difference between those and the first in-battle frame is what reveals the battle-start
   phases.
4. Do not tap during the battle; UI overlays cover the badges.
5. For a mechanics question, build the **smallest board that can answer it**. Two mons with one
   interaction produce unambiguous badge deltas; six mons under Link Cable produce cascades that
   can only be read in aggregate.
