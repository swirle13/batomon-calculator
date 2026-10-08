import { useEffect, useMemo, useRef, useState } from "react";
import { corpus } from "../../data/corpus";
import { computePlacementAdvice, type PlacementAdvice } from "../../engine/placementAdvice";
import type { TeamConfiguration } from "../../data/types";

/**
 * Below this there is nothing to permute, so `suggestPlacement` has no answer to give and there is
 * no reason to spin up a thread or ship its bundle. Keeping the two in step is what makes the
 * worker genuinely lazy: a visitor who never places a second creature never fetches it. (The
 * advisor may still render on a one-creature board — see `renderNotCounted` — but nothing it shows
 * there comes from a search.)
 */
const MIN_PLACEMENTS = 2;

/**
 * Checked per call rather than captured once at module load, so a test can install a fake
 * `Worker` and exercise the asynchronous path. Real environments never change their answer.
 */
function hasWorker(): boolean {
  return typeof Worker !== "undefined";
}

export interface PlacementAdviceState {
  /** `null` before the first result arrives, or while fewer than two creatures are placed. */
  advice: PlacementAdvice | null;
  /** True when `advice` describes a board the user has already changed. */
  isStale: boolean;
}

/**
 * Runs the placement search off the main thread, returning the most recent completed result.
 *
 * ## Requests are coalesced, not queued
 *
 * A worker processes messages serially and a search cannot be aborted part-way. Posting on every
 * config change would therefore build a backlog: drag five times quickly and the fifth answer
 * arrives five searches later, every one of the first four already worthless. So at most one
 * request is ever outstanding; while it runs, further changes overwrite a single `queued` slot,
 * and only that latest board is sent when the reply comes back. Intermediate boards are never
 * searched, which is correct — nobody wants advice about a position they have already left.
 *
 * ## The synchronous fallback
 *
 * Where `Worker` does not exist the search runs inline, exactly as it did before. That path is
 * what the component tests exercise (jsdom provides no `Worker`), so they stay synchronous and
 * assert on a fully-rendered advisor rather than waiting on a thread that is not there.
 */
export function usePlacementAdvice(config: TeamConfiguration): PlacementAdviceState {
  const workerSupported = hasWorker();
  const enabled = config.placements.length >= MIN_PLACEMENTS;

  // Hooks cannot be called conditionally, so both paths are always set up and one is chosen at
  // the end. The synchronous one is inert — and free — whenever a worker is available.
  const synchronous = useMemo(
    () => (workerSupported || !enabled ? null : computePlacementAdvice(config, corpus)),
    [config, enabled],
  );

  const workerRef = useRef<Worker | null>(null);
  /** The board the outstanding request is about; `null` when the worker is free. */
  const inFlightFor = useRef<TeamConfiguration | null>(null);
  /** The latest board that still needs searching once the worker frees up. */
  const queued = useRef<TeamConfiguration | null>(null);
  const [result, setResult] = useState<{ advice: PlacementAdvice; config: TeamConfiguration } | null>(null);

  // Created once and kept, rather than per search: spawning a thread costs more than the message
  // it would carry. Declared before the posting effect below so the worker exists by the time
  // that one runs on mount.
  useEffect(() => {
    if (!workerSupported || !enabled) return;
    const worker = new Worker(new URL("../../engine/placementAdvice.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<PlacementAdvice>) => {
      const searched = inFlightFor.current;
      inFlightFor.current = null;
      if (searched) setResult({ advice: event.data, config: searched });
      const next = queued.current;
      if (next) {
        queued.current = null;
        inFlightFor.current = next;
        worker.postMessage(next);
      }
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
      inFlightFor.current = null;
      queued.current = null;
    };
    // Deliberately NOT keyed on `config` — the worker outlives individual board changes, which is
    // the point of it. Respawning per search would cost more than the message it carries.
  }, [enabled, workerSupported]);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker || !enabled) return;
    if (inFlightFor.current) {
      queued.current = config;
      return;
    }
    inFlightFor.current = config;
    worker.postMessage(config);
  }, [config, enabled]);

  if (!enabled) return { advice: null, isStale: false };
  if (!workerSupported) return { advice: synchronous, isStale: false };
  return { advice: result?.advice ?? null, isStale: result?.config !== config };
}
