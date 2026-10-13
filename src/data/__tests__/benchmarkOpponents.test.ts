import { describe, expect, it } from "vitest";
import { buildId, canonicalize, exportBuild, importBuild } from "../share";
import { corpus, findCreature } from "../corpus";
import { suggestPlacement } from "../../engine/optimize";
import { STABLE_SLOT_ORDER, slotKey } from "../../engine/grid";
import { Species } from "../ids";
import type { CreatureLevel, TeamConfiguration, TeamPlacement } from "../types";

/**
 * The benchmark opponent boards, as fixtures tied to the document that publishes their codes
 * (2026-10-13, user-supplied meta data).
 *
 * `specs/004-battle-simulator-calibration/benchmark-opponents.md` lists a `buildId` and a loadable
 * `bat1:` code for each of these eight boards, so a user can paste one into "Load team" and get the
 * observed meta board. That document is prose; this is what keeps it true.
 *
 * ## What this guards
 *
 * A `buildId` is a fingerprint of the CANONICAL build (`share.ts`), so it moves if slot ordering,
 * level handling or the canonical form changes — and the codes in the document would then load
 * something other than what it claims, or stop loading at all. Pinning the ids here turns that
 * from a silent documentation rot into a failing test naming the board that moved.
 *
 * It also pins the two conventions the published data forced, because both are judgement calls
 * that a later reader would otherwise have to rediscover:
 *
 * - **Positions**: the source publishes none ("These grids do not show exact or recommended
 *   positions"), so the board is arranged by this app's own placement search. See the document's
 *   section B2 for why that rather than reading order.
 * - **Levels**: published levels are means across many boards and come out fractional, so they are
 *   floored. See B3 — rounding up invents a board stronger than the modal one, and this engine's
 *   level scaling is steep enough for that to matter.
 */

/** A unit as published: species, and the level the source gives (possibly fractional). */
type Unit = [Species, number];

interface PhaseFixture {
  phase: string;
  /** The run day this phase is pinned to — the first round of its range. */
  runDay: number;
  /** The `buildId` published in benchmark-opponents.md. */
  expectedId: string;
  units: Unit[];
}

const COMPS: { comp: string; phases: PhaseFixture[] }[] = [
  {
    comp: "Formiqueen + Velocect",
    phases: [
      {
        phase: "Early R1-4",
        runDay: 1,
        expectedId: "c9a66948",
        units: [
          [Species.Velocect, 2],
          [Species.Bumblebolt, 1],
          [Species.Brawlmantis, 1],
          [Species.Electranade, 1],
          [Species.Dragonegg, 1],
          [Species.Gildshell, 1],
        ],
      },
      {
        phase: "Mid R5-8",
        runDay: 5,
        expectedId: "8874a735",
        units: [
          [Species.Velocect, 3],
          [Species.Formiqueen, 2],
          [Species.Bumblebolt, 2.5],
          [Species.Electranade, 1.5],
          [Species.Cherubble, 1],
          [Species.Pylong, 1],
        ],
      },
      {
        phase: "Late R9-12",
        runDay: 9,
        expectedId: "d31b1da8",
        units: [
          [Species.Formiqueen, 2],
          [Species.Velocect, 3],
          [Species.Onsetra, 1],
          [Species.Stellagon, 1],
          [Species.Pylong, 2],
          [Species.Bumblebolt, 3],
        ],
      },
      {
        phase: "Final R13+",
        runDay: 13,
        expectedId: "16359e2d",
        units: [
          [Species.Onsetra, 2],
          [Species.Velocect, 3],
          [Species.Formiqueen, 3],
          [Species.Stellagon, 2],
          [Species.Bumblebolt, 3],
          [Species.Pylong, 2],
        ],
      },
    ],
  },
  {
    comp: "Bonshell + Opalion",
    phases: [
      {
        phase: "Early R1-4",
        runDay: 1,
        expectedId: "bd5c8282",
        units: [
          [Species.Bonshell, 1],
          [Species.Scorubble, 1],
          [Species.Sukoi, 1],
          [Species.Swoonet, 2],
          [Species.Shellter, 1.5],
          [Species.Gildshell, 1],
        ],
      },
      {
        phase: "Mid R5-8",
        runDay: 5,
        expectedId: "bd65db08",
        units: [
          [Species.Bonshell, 3],
          [Species.Opalion, 1],
          [Species.Dracana, 1],
          [Species.Boomagon, 1.5],
          [Species.Sukoi, 1],
          [Species.Rhizuka, 1.5],
        ],
      },
      {
        phase: "Late R9-12",
        runDay: 9,
        expectedId: "386f3f41",
        units: [
          [Species.Dracana, 2],
          [Species.Opalion, 2],
          [Species.Bonshell, 3],
          [Species.Saberhorn, 1],
          [Species.Celestia, 1],
          [Species.Cairnage, 1],
        ],
      },
      {
        phase: "Final R13+",
        runDay: 13,
        expectedId: "000bf6a5",
        units: [
          [Species.Opalion, 2],
          [Species.Dracana, 2],
          [Species.Bonshell, 3],
          [Species.Cairnage, 2],
          [Species.Saberhorn, 2],
          [Species.Celestia, 1],
        ],
      },
    ],
  },
];

/** The published units in reading order, before the placement search rearranges them. */
function listedBoard(units: Unit[], runDay: number): TeamConfiguration {
  const placements: TeamPlacement[] = units.map(([creatureId, sourceLevel], i) => ({
    slot: STABLE_SLOT_ORDER[i]!,
    // B3: floored, never rounded.
    creatureId,
    level: Math.floor(sourceLevel) as CreatureLevel,
  }));
  return {
    placements,
    bench: [],
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    // The app's own default. `TeamConfigContext` keeps its constant module-private, so this is a
    // literal on purpose rather than an import that cannot be made.
    simulationWindowSeconds: 30,
    runDay,
    teamModifiers: [],
  };
}

/** B2: the opponent plays its board as well as this app would advise anyone to play it. */
function arranged(units: Unit[], runDay: number): TeamConfiguration {
  const listed = listedBoard(units, runDay);
  const suggestion = suggestPlacement(listed, corpus);
  return suggestion.placements ? { ...listed, placements: suggestion.placements } : listed;
}

const ALL = COMPS.flatMap(({ comp, phases }) => phases.map((p) => ({ comp, ...p })));

describe("benchmark opponent fixtures", () => {
  it.each(ALL)("$comp $phase is representable in the corpus", ({ units }) => {
    // A board naming a species or level the corpus cannot produce is not a fixture, it is a typo.
    for (const [id, sourceLevel] of units) {
      const level = Math.floor(sourceLevel);
      expect(findCreature(corpus, id, level), `${id} Lv.${level}`).not.toBeNull();
    }
  });

  it.each(ALL)(
    "$comp $phase keeps the buildId its code is published under",
    { timeout: 30_000 },
    ({ units, runDay, expectedId }) => {
      expect(buildId(arranged(units, runDay))).toBe(expectedId);
    },
  );

  it.each(ALL)(
    "$comp $phase survives the export/import round trip the Load box performs",
    { timeout: 30_000 },
    ({ units, runDay, expectedId }) => {
      const board = arranged(units, runDay);
      const reloaded = importBuild(exportBuild(board));

      // Canonical form, not deep equality: `importBuild` regenerates modifier ids by design, so
      // the objects differ in exactly the field the canonical form exists to drop.
      expect(JSON.stringify(canonicalize(reloaded))).toBe(JSON.stringify(canonicalize(board)));
      expect(buildId(reloaded)).toBe(expectedId);
      // The day travels in the code but not in the fingerprint (`share.ts`), so it needs its own
      // assertion — a lost day would silently re-aim the board at a different fight.
      expect(reloaded.runDay).toBe(runDay);
    },
  );

  it("gives all eight boards distinct fingerprints", { timeout: 60_000 }, () => {
    // Two phases that collided would publish the same code under two headings, and the document
    // would be quietly describing one board twice.
    const ids = ALL.map(({ units, runDay }) => buildId(arranged(units, runDay)));
    expect(new Set(ids).size).toBe(ALL.length);
  });

  it("fills all six slots on every board", () => {
    // The published compositions are always six units. A five-unit board would mean a unit was
    // dropped in transcription, which no other assertion here would notice.
    for (const { units, runDay } of ALL) {
      const board = arranged(units, runDay);
      expect(board.placements).toHaveLength(6);
      expect(new Set(board.placements.map((p) => slotKey(p.slot))).size).toBe(6);
    }
  });
});
