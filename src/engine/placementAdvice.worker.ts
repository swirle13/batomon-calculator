import { corpus } from "../data/corpus";
import { computePlacementAdvice, type PlacementAdvice } from "./placementAdvice";
import type { TeamConfiguration } from "../data/types";

/**
 * The placement search, on its own thread (2026-10-08).
 *
 * ## Why a worker rather than scheduling
 *
 * The search is ~60-95ms of straight-line CPU and there is no pause point inside it, so no amount
 * of main-thread scheduling can stop it blocking once it starts. `useDeferredValue` was tried
 * first and got it off the input-handling task — interaction latency measured 24ms — but the work
 * still landed as one uninterruptible ~92ms task about 30ms after a drop, which reads as the card
 * sticking to the cursor. Measured by A/B: disabling the advisor entirely took the same drop from
 * one 92ms long task and 85ms of busy main-thread time to NO long task and 21ms busy. The search
 * was the whole of the remaining cost; everything else — three Recharts trees, both summary
 * tables, dnd-kit, React — is that 21ms.
 *
 * ## The cost of this choice
 *
 * A worker gets its own module graph, so `data/corpus` is compiled into this bundle as well as
 * the app's: about 57kB gzipped against the app's 270kB. It is a separate file, requested only
 * once a second creature is placed (see `usePlacementAdvice`), so it never delays first paint.
 *
 * ## The protocol
 *
 * One `TeamConfiguration` in, one `PlacementAdvice` out, nothing retained between messages. The
 * caller guarantees at most one request is outstanding at a time and coalesces the rest, so there
 * is no request id here and no queue to drain — see `usePlacementAdvice` for why that matters.
 */
const ctx = self as unknown as Worker;

ctx.onmessage = (event: MessageEvent<TeamConfiguration>) => {
  const advice: PlacementAdvice = computePlacementAdvice(event.data, corpus);
  ctx.postMessage(advice);
};
