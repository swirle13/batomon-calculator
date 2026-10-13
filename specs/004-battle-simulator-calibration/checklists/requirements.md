# Specification Quality Checklist: The Battle Simulator and a Calibrated Objective

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-13
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [ ] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

One `[NEEDS CLARIFICATION]` marker remains, on an `[OPP]` requirement belonging to User Story 3.
**It does not block planning or implementation of User Stories 1 and 2**, which are the P1 slice and
are fully specified.

- **FR-014** (open) — enemy ability fidelity in the first opponent-model slice: damage and HP only,
  or healing/shielding/cleansing too. A scope decision with materially different implications and no
  defensible default. Resolve before `/speckit-plan` is run for Story 3.
- **FR-017** (**resolved 2026-10-13**) — what an uncaptured day offers. Answered by
  [benchmark-opponents.md](../benchmark-opponents.md): the observed ranked meta publishes
  phase-indexed representative boards, so the answer is neither "nothing" nor a synthesised team.
  The dataset also added FR-021 through FR-023, which are conventions the data's gaps force rather
  than open questions.

### Deliberate deviations from the template

- A `## 0. The decision this specification turns on` section precedes User Scenarios, following the
  house pattern established by `003-run-shop-and-board-layout`. The feature has a genuine fork
  (measured horizon vs simulated opponent) that changes every requirement below it, so it is
  settled before anything depends on it.
- Requirements are grouped by the slice they belong to and `[OPP]`-tagged, because the spec covers
  two independently shippable halves and an untagged flat list would read as one undeliverable
  lump.

### Why Content Quality passes despite naming source files

The spec names existing modules (`ENEMY_HP_BY_DAY`, `timeToKillSeconds`, `survivability.ts`,
`TIME_WEIGHT_HALF_LIFE_SECONDS`) in its problem statement and assumptions. These are cited as
**existing observations and constraints the feature must respect**, not as implementation
directions — the spec states no new module, type, function or framework. Naming the three constants
that currently decide every suggestion is the whole evidence base for the feature existing, and
omitting them would make the problem statement unverifiable.
