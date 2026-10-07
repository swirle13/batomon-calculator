#!/usr/bin/env bash
# One-command pipeline: recording -> frames.csv -> events.csv + timeline.md
#
#   analyze.sh <video> <out-dir> [t0] [t1] [--speed=N] [--charge-slot=SLOT[:SECONDS]]
#
# Detects the game canvas inside the frame, picks the layout and glyph set by canvas size,
# builds the scanner if needed, then runs the single extraction pass followed by event
# derivation. Any --flag is forwarded to bcevents.py. If no layout matches the canvas aspect
# it says so and points at the calibration steps rather than guessing.

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS="$SKILL_DIR/scripts"
LAYOUTS="$SKILL_DIR/layouts"

# Split positional arguments from flags, so flags can appear anywhere.
POS=()
EVENT_FLAGS=()
for a in "$@"; do
  case "$a" in
    --*) EVENT_FLAGS+=("$a") ;;
    *)   POS+=("$a") ;;
  esac
done

if [[ ${#POS[@]} -lt 2 ]]; then
  sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 1
fi

VIDEO="${POS[0]}"
OUT="${POS[1]}"
[[ -f "$VIDEO" ]] || { echo "no such file: $VIDEO" >&2; exit 1; }
mkdir -p "$OUT"

# --- build (only when the source is newer than the binary) ---
if [[ ! -x "$SCRIPTS/bcscan" || "$SCRIPTS/bcscan.swift" -nt "$SCRIPTS/bcscan" ]]; then
  echo "==> building bcscan"
  swiftc -O "$SCRIPTS/bcscan.swift" -o "$SCRIPTS/bcscan"
fi

# --- identify the recording ---
echo "==> inspecting $VIDEO"
eval "$("$SCRIPTS/bcscan" info "$VIDEO")"
echo "    frame ${frame_width}x${frame_height}, ${nominal_fps} fps, ${duration_seconds}s (frame = ${frame_ms} ms)"

T0="${POS[2]:-0}"
T1="${POS[3]:-$duration_seconds}"

# The game canvas, not the frame, is what layouts are keyed on: a recording is usually
# letterboxed or pillarboxed, and the same canvas can arrive inside very different frames.
MIDPOINT=$(python3 -c "print(f'{($T0 + $T1) / 2:.4f}')")
eval "$("$SCRIPTS/bcscan" canvas "$VIDEO" "$MIDPOINT")"
echo "    canvas ${canvas_width}x${canvas_height} at (${canvas_x},${canvas_y}), aspect ${canvas_aspect}"
echo "    black bars: ${bars_left_right} left/right, ${bars_top_bottom} top/bottom"

LAYOUT="$LAYOUTS/canvas-${canvas_width}x${canvas_height}.json"
GLYPHS="$LAYOUTS/canvas-${canvas_width}x${canvas_height}.glyphs.json"
TRUTH="$LAYOUTS/canvas-${canvas_width}x${canvas_height}.truth.csv"

# Fall back to any layout with the same aspect ratio: the geometry scales cleanly, only the
# glyph templates are scale-bound.
if [[ ! -f "$LAYOUT" ]]; then
  for cand in "$LAYOUTS"/canvas-*.json; do
    [[ -f "$cand" && "$cand" != *glyphs* ]] || continue
    CW=$(python3 -c "import json;d=json.load(open('$cand'));print(d['canvasWidth'])")
    CH=$(python3 -c "import json;d=json.load(open('$cand'));print(d['canvasHeight'])")
    SAME=$(python3 -c "print(abs($CW/$CH - $canvas_width/$canvas_height) < 0.01)")
    if [[ "$SAME" == "True" ]]; then
      echo "    no layout for this canvas size; reusing $(basename "$cand") (same aspect, scaled ${canvas_width}/${CW})"
      LAYOUT="$cand"
      GLYPHS="$LAYOUTS/canvas-${canvas_width}x${canvas_height}.glyphs.json"
      break
    fi
  done
fi

if [[ ! -f "$LAYOUT" ]]; then
  cat >&2 <<EOF

No layout matches a ${canvas_width}x${canvas_height} canvas (aspect ${canvas_aspect}), and none
of the existing layouts share its aspect ratio. Layouts are canvas-relative, so any capture of a
16:9 canvas is covered by the 1920x1080 layout regardless of frame size -- a different *aspect*
means the game laid the board out differently and needs its own calibration.

See "Calibrating a new recording" in $SKILL_DIR/reference.md.

Existing layouts:
$(ls -1 "$LAYOUTS"/canvas-*.json 2>/dev/null | grep -v glyphs | sed 's/^/  /' || echo "  (none)")
EOF
  exit 1
fi

# --- glyph set: harvest and label if absent ---
if [[ ! -f "$GLYPHS" ]]; then
  echo "==> no glyph set for this frame size; harvesting"
  "$SCRIPTS/bcscan" learn "$VIDEO" "$LAYOUT" "$OUT" "$T0" "$T1" 0.05
  mv "$OUT/glyphs.json" "$GLYPHS"
  if [[ -f "$TRUTH" ]]; then
    echo "==> labelling from $TRUTH"
    "$SCRIPTS/bcscan" autolabel "$VIDEO" "$LAYOUT" "$GLYPHS" "$TRUTH"
  else
    cat >&2 <<EOF

Harvested $GLYPHS but there is nothing to label it with.

Write $TRUTH with a few known badge readings (t,slotId,runIndex,text) taken from
frames you can read yourself, then re-run. See "Labelling the glyph set" in
$SKILL_DIR/reference.md. Use \`bcscan overlay\` to see which slot is which.
EOF
    exit 1
  fi
fi

# --- the single extraction pass ---
echo "==> scanning ${T0}s - ${T1}s (this is the only pass over the video)"
"$SCRIPTS/bcscan" scan "$VIDEO" "$LAYOUT" "$GLYPHS" "$OUT/frames.csv" "$T0" "$T1"

echo "==> deriving events"
python3 "$SCRIPTS/bcevents.py" "$OUT/frames.csv" "$OUT" ${EVENT_FLAGS[@]+"${EVENT_FLAGS[@]}"}

# --- a layout overlay, so the geometry can be eyeballed before trusting the numbers ---
"$SCRIPTS/bcscan" overlay "$VIDEO" "$LAYOUT" "$MIDPOINT" "$OUT/layout-check.png" >/dev/null
echo "    wrote $OUT/layout-check.png (verify the boxes sit on the right things)"

cat <<EOF

Done. Everything downstream should query the dataset, not the video:

  $OUT/frames.csv        one row per frame, every badge and bar
  $OUT/events.csv        derived casts, charges, stat changes, health drops
  $OUT/timeline.md       readable narrative + cooldown cadence + tie-break clusters
  $OUT/layout-check.png  layout verification

  python3 $SCRIPTS/bcquery.py cols    $OUT/frames.csv
  python3 $SCRIPTS/bcquery.py order   $OUT/frames.csv <t0> <t1>
  python3 $SCRIPTS/bcquery.py changes $OUT/frames.csv <column>

Re-deriving events is cheap and never re-reads the video:

  python3 $SCRIPTS/bcevents.py $OUT/frames.csv $OUT --speed=2 --charge-slot=ally_front_2:1
EOF
