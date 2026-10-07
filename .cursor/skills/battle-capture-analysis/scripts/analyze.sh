#!/usr/bin/env bash
# One-command pipeline: recording -> frames.csv -> events.csv + timeline.md
#
#   analyze.sh <video> <out-dir> [t0] [t1]
#
# Picks the layout and glyph set by the recording's frame size, builds the scanner if needed,
# then runs the single extraction pass followed by event derivation. If no layout exists for
# this frame size it says so and points at the calibration steps rather than guessing.

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS="$SKILL_DIR/scripts"
LAYOUTS="$SKILL_DIR/layouts"

if [[ $# -lt 2 ]]; then
  sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 1
fi

VIDEO="$1"
OUT="$2"
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
echo "    ${frame_width}x${frame_height}, ${nominal_fps} fps, ${duration_seconds}s (frame = ${frame_ms} ms)"

T0="${3:-0}"
T1="${4:-$duration_seconds}"

LAYOUT="$LAYOUTS/${frame_width}x${frame_height}.json"
GLYPHS="$LAYOUTS/${frame_width}x${frame_height}.glyphs.json"
TRUTH="$LAYOUTS/${frame_width}x${frame_height}.truth.csv"

if [[ ! -f "$LAYOUT" ]]; then
  cat >&2 <<EOF

No layout for ${frame_width}x${frame_height}. Layouts are per frame size because every
measurement is a pixel rectangle. To calibrate a new one, see "Calibrating a new recording"
in $SKILL_DIR/reference.md — it is four findbars/findtext calls and a copy of an existing
layout file.

Existing layouts:
$(ls -1 "$LAYOUTS"/*.json 2>/dev/null | grep -v glyphs | sed 's/^/  /' || echo "  (none)")
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
python3 "$SCRIPTS/bcevents.py" "$OUT/frames.csv" "$OUT"

# --- a layout overlay, so the geometry can be eyeballed before trusting the numbers ---
MID=$(python3 -c "print(f'{($T0 + $T1) / 2:.4f}')")
"$SCRIPTS/bcscan" overlay "$VIDEO" "$LAYOUT" "$MID" "$OUT/layout-check.png" >/dev/null
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
EOF
