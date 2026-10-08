/**
 * The drag-activation threshold, in its own module so `GridPicker.tsx` exports only its component.
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
 * The export exists only so a test can assert it, which makes a separate module the obvious home:
 * it costs one file and buys back a working dev server.
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
