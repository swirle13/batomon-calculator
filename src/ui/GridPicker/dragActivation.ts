/**
 * The drag-activation thresholds, in their own module so `GridPicker.tsx` exports only its
 * component.
 *
 * ## Why it is not in GridPicker.tsx, where it is used
 *
 * React Fast Refresh can only hot-swap a module whose exports are all components. A module that
 * also exports a plain object gets a NEW object identity on every re-evaluation, which the refresh
 * runtime reads as an incompatible export and answers by invalidating the module instead of
 * swapping it — so the whole importing tree remounts on every keystroke-save:
 *
 *     [vite] hmr invalidate /src/ui/GridPicker/GridPicker.tsx
 *            Could not Fast Refresh ("POINTER_ACTIVATION_CONSTRAINT" export is incompatible)
 *
 * The exports exist only so a test can assert them, which makes a separate module the obvious
 * home: it costs one file and buys back a working dev server.
 *
 * ## Why the constant is asserted rather than the behaviour (tasks.md T147)
 *
 * jsdom cannot reproduce either half of the real click-vs-drag behaviour — its synthetic pointer
 * events do not drive @dnd-kit's activation, and its `fireEvent.click` is not subject to the
 * capture-phase suppression @dnd-kit installs — so a behavioural test there would pass for the
 * wrong reason in both directions. The presence of this constraint IS the fix; its absence was the
 * bug. End-to-end behaviour is verified in a real browser per quickstart Scenario 25.
 */
export const POINTER_ACTIVATION_CONSTRAINT = { distance: 8 } as const;

/**
 * Touch gets a LONG PRESS, not a distance (2026-10-08, user-reported: cards could not be dragged
 * on a phone at all).
 *
 * A distance threshold cannot work on touch, because the finger and the page scroll compete for
 * the same gesture: the browser claims a vertical swipe as a scroll before the 8px is travelled,
 * fires `pointercancel`/`touchcancel`, and the drag never activates. Every direction fails this
 * way on a board that is taller than a phone screen.
 *
 * A delay separates the two intents by TIME instead. Under `delay`, a swipe scrolls the page as
 * normal (the `tolerance` aborts activation once the finger has moved that far), while a press
 * held still for `delay` becomes a drag — at which point the sensor preventDefaults the subsequent
 * touchmoves, so the page stays put for the rest of the gesture.
 *
 * 180ms is below the ~500ms at which mobile browsers raise their own long-press menus and above
 * the length of a tap, so the tap that opens the creature picker is unaffected. `tolerance: 8`
 * matches the mouse's distance for the same reason it was chosen there: it absorbs the jitter of
 * holding a finger still without swallowing a deliberate swipe.
 */
export const TOUCH_ACTIVATION_CONSTRAINT = { delay: 180, tolerance: 8 } as const;
