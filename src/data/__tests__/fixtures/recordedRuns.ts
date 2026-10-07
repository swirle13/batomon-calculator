/**
 * Teams from recorded play, kept as build codes so they can be pasted straight back into the app.
 *
 * ## Why build codes rather than inline `TeamConfiguration` objects
 *
 * A code round-trips through the same import path a user does, so these fixtures also exercise
 * sharing. More usefully: when a recording is re-examined, the code can be pasted into the running
 * app to see the exact board being discussed, which an inline object cannot do.
 *
 * ## What these are for
 *
 * Regression anchors. Each is a real board from a real run with a video reference, so a future
 * engine change that silently alters their numbers is visible. They are **not** assertions about
 * correct output on their own — a team code records the input, not the expected result. Where
 * observed output exists (see `statusStacks.test.ts`'s 28-row battle), that is the stronger fixture
 * and is asserted separately.
 */

export interface RecordedRun {
  /** Short stable key, used in test names. */
  id: string;
  /** Which round and day of the run this board was used for. */
  label: string;
  /** Portable build code — paste into the app's "Load a build" field to reproduce the board. */
  code: string;
  /** Source recording. */
  video: string;
  /** Where in the recording this board appears. */
  timestamp: string;
  /** Anything about the board worth knowing when reading a diff in its numbers. */
  note?: string;
}

const VIDEO_NL_RUN_1 = "https://www.youtube.com/watch?v=vZZFI445_-8";

export const RECORDED_RUNS: readonly RecordedRun[] = [
  {
    id: "r1d1",
    label: "Round 1, day 1",
    code:
      "bat1:eyJ2IjoxLCJyZWdpb24iOiJwYW50cmEiLCJ0cmFpbmVyIjoicGFpbnRlciIsIndpbmRvdyI6MjQsInBsYWNlbWVudHMiOlt7InJvdyI6ImZyb250IiwiY29sIjowLCJjcmVhdHVyZUlkIjoidmVub3B1ZmYiLCJsZXZlbCI6MSwic2hpbnkiOmZhbHNlLCJtb2RpZmllcnMiOltdfSx7InJvdyI6ImZyb250IiwiY29sIjoxLCJjcmVhdHVyZUlkIjoibWFnbWl0ZSIsImxldmVsIjoxLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiZnJvbnQiLCJjb2wiOjIsImNyZWF0dXJlSWQiOiJkcmliYmxldCIsImxldmVsIjoxLCJzaGlueSI6dHJ1ZSwibW9kaWZpZXJzIjpbXX1dLCJ0cmlua2V0cyI6W10sIml0ZW1zIjpbXSwicGFpbnRlZCI6WyJtYWdtaXRlIl0sInNtdWdnbGVkIjpbXSwidGVhbU1vZGlmaWVycyI6W119",
    video: VIDEO_NL_RUN_1,
    timestamp: "0:00",
    note:
      "The board behind the 28-row frame-by-frame battle in statusStacks.test.ts: Venopuff + " +
      "Magmite + shiny Dribblet against a 300 HP day-1 enemy, dead at t=23 with 8 overkill.",
  },
  {
    id: "r2d1",
    label: "Round 2, day 1",
    code:
      "bat1:eyJ2IjoxLCJyZWdpb24iOiJwYW50cmEiLCJ0cmFpbmVyIjoidHdpbnMiLCJ3aW5kb3ciOjMwLCJwbGFjZW1lbnRzIjpbeyJyb3ciOiJmcm9udCIsImNvbCI6MSwiY3JlYXR1cmVJZCI6InZlbm9wdWZmIiwibGV2ZWwiOjEsInNoaW55IjpmYWxzZSwibW9kaWZpZXJzIjpbXX0seyJyb3ciOiJmcm9udCIsImNvbCI6MiwiY3JlYXR1cmVJZCI6ImJyYXdsbWFudGlzIiwibGV2ZWwiOjEsInNoaW55IjpmYWxzZSwibW9kaWZpZXJzIjpbXX1dLCJ0cmlua2V0cyI6W10sIml0ZW1zIjpbXSwicGFpbnRlZCI6WyJtYWdtaXRlIl0sInNtdWdnbGVkIjpbXSwidGVhbU1vZGlmaWVycyI6W119",
    video: VIDEO_NL_RUN_1,
    timestamp: "23:45",
  },
  {
    id: "r2d2",
    label: "Round 2, day 2",
    code:
      "bat1:eyJ2IjoxLCJyZWdpb24iOiJwYW50cmEiLCJ0cmFpbmVyIjoidHdpbnMiLCJ3aW5kb3ciOjMwLCJwbGFjZW1lbnRzIjpbeyJyb3ciOiJiYWNrIiwiY29sIjoyLCJjcmVhdHVyZUlkIjoicGViYmxlciIsImxldmVsIjoxLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiZnJvbnQiLCJjb2wiOjAsImNyZWF0dXJlSWQiOiJicmF3bG1hbnRpcyIsImxldmVsIjoxLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiZnJvbnQiLCJjb2wiOjEsImNyZWF0dXJlSWQiOiJ2ZW5vcHVmZiIsImxldmVsIjoxLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiZnJvbnQiLCJjb2wiOjIsImNyZWF0dXJlSWQiOiJjcmFnaG9ybiIsImxldmVsIjoxLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W3sic3RhdCI6ImRhbWFnZUZsYXRBZGQiLCJhbW91bnQiOjIwfSx7InN0YXQiOiJzaGllbGRBbW91bnRBZGQiLCJhbW91bnQiOjIwfV19XSwidHJpbmtldHMiOltdLCJpdGVtcyI6W10sInBhaW50ZWQiOlsibWFnbWl0ZSJdLCJzbXVnZ2xlZCI6W10sInRlYW1Nb2RpZmllcnMiOltdfQ",
    video: VIDEO_NL_RUN_1,
    timestamp: "25:11",
    note:
      "Carries manual modifiers (Craghorn +20 Damage, +20 Shield) standing in for its " +
      "'when you use an item' ability, which the engine has no trigger for. The only fixture here " +
      "exercising that path.",
  },
  {
    id: "r2d3",
    label: "Round 2, day 3",
    code:
      "bat1:eyJ2IjoxLCJyZWdpb24iOm51bGwsInRyYWluZXIiOiJ0d2lucyIsIndpbmRvdyI6MzAsInBsYWNlbWVudHMiOlt7InJvdyI6ImJhY2siLCJjb2wiOjAsImNyZWF0dXJlSWQiOiJzaGlraXRzdW5lIiwibGV2ZWwiOjEsInNoaW55IjpmYWxzZSwibW9kaWZpZXJzIjpbXX0seyJyb3ciOiJiYWNrIiwiY29sIjoyLCJjcmVhdHVyZUlkIjoicGViYmxlciIsImxldmVsIjoyLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiZnJvbnQiLCJjb2wiOjAsImNyZWF0dXJlSWQiOiJicmF3bG1hbnRpcyIsImxldmVsIjoxLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiZnJvbnQiLCJjb2wiOjEsImNyZWF0dXJlSWQiOiJ2ZW5vcHVmZiIsImxldmVsIjoxLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiZnJvbnQiLCJjb2wiOjIsImNyZWF0dXJlSWQiOiJjcmFnaG9ybiIsImxldmVsIjoxLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W3sic3RhdCI6ImRhbWFnZUZsYXRBZGQiLCJhbW91bnQiOjQwfSx7InN0YXQiOiJzaGllbGRBbW91bnRBZGQiLCJhbW91bnQiOjQwfV19XSwidHJpbmtldHMiOlsidHJlYXN1cmVfbWFwIl0sIml0ZW1zIjpbXSwicGFpbnRlZCI6WyJtYWdtaXRlIl0sInNtdWdnbGVkIjpbXSwidGVhbU1vZGlmaWVycyI6W119",
    video: VIDEO_NL_RUN_1,
    timestamp: "26:11",
    note:
      "Widest coverage of the four: the only fixture carrying a TRINKET (Treasure Map), the only " +
      "one with a creature above level 1 (Pebbler L2), and the only one with no region set. " +
      "Craghorn's banked item bonus has grown to +40/+40, one more press than r2d2.",
  },
];
