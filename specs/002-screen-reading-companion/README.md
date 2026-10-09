# 002 — Batomon Showdown Screen-Reading Companion

**Research and specification only. Nothing is built.**

A possible Android companion app for Batomon Showdown: a floating overlay that reads the game's
screen and surfaces this calculator's DPS figures and placement advice without the player typing
anything.

The implementation is intended for a **separate private repository**. These documents live here so
they sit beside the codebase they analyse, and so the port inventory's file and line references
stay checkable against the real source.

## Read in this order

| Document | What it answers |
|---|---|
| [`spec.md`](./spec.md) | What the thing is: user stories, functional requirements, success criteria, phasing, open decisions |
| [`research.md`](./research.md) | What's actually possible: Android/iOS platform limits, Play policy, the game's engine, perception options, framework choice, precedent |
| [`port-inventory.md`](./port-inventory.md) | What transfers from this repo, what gets rewritten, what has to be built, and what's still missing |
| [`uncertainty-register.md`](./uncertainty-register.md) | Known knowns, known unknowns with the spike that resolves each, and where unknown unknowns live |
| [`project-setup.md`](./project-setup.md) | Monorepo topology, extraction sequence, engineering practice to carry over and to add |

## The one-hour test that gates everything

Before anything else: install Batomon Showdown, start any screen recorder, and check whether the
game's content appears or comes out black. Then install any floating-bubble app and check whether
the bubble renders over the game.

If either fails, the game sets `FLAG_SECURE` or `HIDE_OVERLAY_WINDOWS` — there is no workaround for
either, and the whole approach is dead. See `uncertainty-register.md` KU-1.

## Relationship to 001

This is a spin-off, not a successor. Feature 001 (the web calculator) continues independently, and
`.specify/feature.json` still points at it — these documents are not wired into the spec-kit
workflow and running `/speckit-plan` or `/speckit-tasks` will still operate on 001.

Two findings here matter to 001 regardless of whether the mobile app is ever built:

- **The engine's purity is an asset with a measurable payout.** Constitution Principle I means
  ~3,960 lines of engine and a 948 KB corpus transfer to React Native unmodified, along with all
  207 engine test cases. See `port-inventory.md` §1–2.
- **One layering violation exists and should be fixed here, not there.** `engine/effects.ts` imports
  `TYPE_COLORS` from `data/typeColors.ts` purely for the list of type names — a presentation module
  imported by the resolver. See `port-inventory.md` §3.
