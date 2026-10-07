# Mobile responsiveness: what is actually non-responsive, and what is not

Captured 2026-10-07 at the user's request, ahead of a dedicated mobile spec. The prompt was "the
batomon picker UI is no longer reactively scaled for mobile devices — capture what you did in your
last changes that might've caused this behaviour".

## The honest answer: my recent changes are not the cause

I traced each one. The picker modal itself is responsive and was not touched in a way that affects
width:

| mechanism | value | responsive? |
|---|---|---|
| modal panel | `width: min(var(--modal-width, 900px), 94vw)` | **yes** — viewport-capped |
| card grid | `repeat(auto-fill, minmax(11rem, 1fr))` | **yes** — collapses to one column |
| filter toolbar | `display: flex; flex-wrap: wrap` | **yes** — wraps |
| search field | `flex: 1 1 12rem` | **yes** — shrinks |

The recent CSS additions — the out-of-region dim and label, the Clear button — are additive, carry
no fixed dimensions, and sit inside containers that already wrap.

`git log -S` places the one genuinely non-shrinking rule in **round 8** (`2ef0b67`), well before any
of this work.

## What IS non-responsive

### 1. The detail column cannot shrink — `src/App.tsx`

```tsx
<div style={{ flex: "0 0 var(--detail-panel-width)" }}>   // 22rem = 352px
```

`flex: 0 0` means no grow **and no shrink**, and the element has no `min-width: 0`. The row wraps,
so on a phone the column drops below the grid rather than squeezing it — but once wrapped it still
demands 352px. Below roughly a 370px viewport that overflows horizontally.

The sibling column has `minWidth: 0`; this one does not. That asymmetry is the bug.

**Not introduced recently**, but worth naming: moving Modifiers and Share into the left column
(2026-10-07) made the page taller and the wrap more visible, so the pre-existing constraint is
easier to hit now.

### 2. Fixed-width type chips — `--type-chip-width: 7rem`

Added 2026-10-06 for "each type chip card needs to have a fixed chip width, same as in game". It
does what was asked, and it is a **latent** constraint: two chips side by side are 14rem plus gaps,
so any container holding them cannot shrink below ~15rem no matter what its own rules say.

It is not causing the current overflow — the picker tiles use `TypeSplit` (a colour background),
not chips, so only `BatomonCard` is affected, and that sits inside the 22rem column anyway. But it
will block that column from ever being made shrinkable until it is addressed.

### 3. Fixed modal width request

`CreatureSearchModal` passes `width="880px"`. Harmless today because the primitive caps it at
`94vw`, but the call site states a desktop number with no viewport awareness, so it reads as safe
only by accident of the primitive.

## For the mobile spec

Rough order of value:

1. `min-width: 0` plus a shrink factor on the detail column, or a media query that stacks the two
   columns outright below a breakpoint.
2. Make `--type-chip-width` a clamp rather than a fixed length, so chips keep their aligned look on
   desktop without pinning a minimum width on every ancestor.
3. Replace fixed px at call sites (`width="880px"`, `--detail-panel-width`) with viewport-relative
   or clamped values.
4. There is **no breakpoint system**, though not quite none at all — I checked rather than assumed,
   and `src/` has six `@media` rules: three `max-width: 1024px` in `index.css`, one
   `max-width: 640px` in `tokens.css` scaling `--sprite-grid` down, plus `prefers-color-scheme` and
   `prefers-reduced-motion`. So there are two ad-hoc breakpoints (1024 and 640) applied to a handful
   of properties, not a system. Consolidating those onto one named scale is the real work; the three
   items above are symptoms of their absence.

## A regression this investigation caught in the same change

Raising `--sprite-picker` from 64px to 112px (this round, at the user's request) would have made the
picker **worse** on mobile: a 112px sprite in an 11rem card is roughly two columns on a phone where
64px gave three or four, and nothing scaled it back down. The existing 640px breakpoint scaled
`--sprite-grid` but knew nothing about the picker.

Fixed in the same commit — the 640px rule now also sets `--sprite-picker: 72px` and
`--picker-card-min-width: 8rem`. Worth recording because it is exactly the failure mode the mobile
spec needs to prevent: a desktop-motivated size change with no viewport counterpart.
