import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { usePlacementAdvice } from "../usePlacementAdvice";
import { GridRow } from "../../../data/enums";
import { Species } from "../../../data/ids";
import type { PlacementAdvice } from "../../../engine/placementAdvice";
import type { TeamConfiguration } from "../../../data/types";

/**
 * The worker path, which jsdom cannot reach on its own: with no `Worker` global the hook computes
 * inline, so every other test in the suite exercises the fallback and none of them touch the
 * request coalescing. That coalescing is the part worth testing — it is the reason a burst of
 * drags does not queue a burst of 90ms searches behind itself.
 */
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<PlacementAdvice>) => void) | null = null;
  readonly posted: TeamConfiguration[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(data: TeamConfiguration) {
    this.posted.push(data);
  }
  terminate() {
    this.terminated = true;
  }
  /** Answer the outstanding request, the way the real worker would. */
  reply(advice: Partial<PlacementAdvice> = {}) {
    act(() => {
      this.onmessage?.({ data: advice as PlacementAdvice } as MessageEvent<PlacementAdvice>);
    });
  }
}

function configWith(windowSeconds: number): TeamConfiguration {
  return {
    placements: [
      { slot: { row: GridRow.Top, col: 0 }, creatureId: Species.Venopuff, level: 1 },
      { slot: { row: GridRow.Top, col: 1 }, creatureId: Species.Pebbler, level: 1 },
    ],
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    // The field under test is identity, not content: each distinct value is simply a different
    // board object for the hook to react to.
    simulationWindowSeconds: windowSeconds,
    teamModifiers: [],
  };
}

function Harness({ config }: { config: TeamConfiguration }) {
  const { advice, isStale } = usePlacementAdvice(config);
  return (
    <output data-testid="state">
      {advice ? `advice:${advice.currentDps}` : "advice:none"} stale:{String(isStale)}
    </output>
  );
}
const state = () => screen.getByTestId("state").textContent;

afterEach(() => {
  FakeWorker.instances.length = 0;
  vi.unstubAllGlobals();
});

describe("usePlacementAdvice worker path", () => {
  it("coalesces a burst of board changes into one follow-up search", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { rerender } = render(<Harness config={configWith(1)} />);
    const worker = FakeWorker.instances[0]!;
    expect(worker.posted).toHaveLength(1);

    // Three more boards arrive while the first search is still outstanding. None of them may be
    // posted: the worker is busy and cannot be interrupted, so sending them would queue three
    // searches whose answers are obsolete before they are computed.
    rerender(<Harness config={configWith(2)} />);
    rerender(<Harness config={configWith(3)} />);
    const latest = configWith(4);
    rerender(<Harness config={latest} />);
    expect(worker.posted).toHaveLength(1);

    // On the reply, exactly ONE further request goes out, and it is the newest board -- boards
    // 2 and 3 are never searched, because nobody wants advice about a position already left.
    worker.reply({ currentDps: 10 });
    expect(worker.posted).toHaveLength(2);
    expect(worker.posted[1]).toBe(latest);
  });

  it("reports advice as stale until the reply for the current board arrives", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const first = configWith(1);
    const { rerender } = render(<Harness config={first} />);
    const worker = FakeWorker.instances[0]!;

    // Nothing has come back yet, so there is no advice to show at all.
    expect(state()).toBe("advice:none stale:true");

    worker.reply({ currentDps: 10 });
    expect(state()).toBe("advice:10 stale:false");

    // A new board immediately invalidates the figures on screen; they are kept (a number beats a
    // blank) but marked, which is what drives the advisor's "(recalculating…)" hint.
    rerender(<Harness config={configWith(2)} />);
    expect(state()).toBe("advice:10 stale:true");

    worker.reply({ currentDps: 20 });
    expect(state()).toBe("advice:20 stale:false");
  });

  it("does not spawn a worker for a board too small to rearrange", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const lonely: TeamConfiguration = {
      ...configWith(1),
      placements: [{ slot: { row: GridRow.Top, col: 0 }, creatureId: Species.Venopuff, level: 1 }],
    };
    render(<Harness config={lonely} />);
    // `suggestPlacement` has nothing to permute below two creatures and the advisor renders
    // nothing, so fetching the worker's bundle would be pure waste.
    expect(FakeWorker.instances).toHaveLength(0);
    expect(state()).toBe("advice:none stale:false");
  });

  it("terminates the worker on unmount", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { unmount } = render(<Harness config={configWith(1)} />);
    const worker = FakeWorker.instances[0]!;
    expect(worker.terminated).toBe(false);
    unmount();
    expect(worker.terminated).toBe(true);
  });

  it("computes inline when the platform has no Worker", () => {
    // No stub: jsdom has no `Worker`, which is the real fallback condition.
    render(<Harness config={configWith(1)} />);
    expect(FakeWorker.instances).toHaveLength(0);
    // A real figure, computed synchronously -- not the "none" the async path starts from.
    expect(state()).toMatch(/^advice:\d/);
    expect(state()).toContain("stale:false");
  });
});
