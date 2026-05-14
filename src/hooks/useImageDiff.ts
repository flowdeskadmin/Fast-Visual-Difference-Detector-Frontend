import { useCallback, useEffect, useRef, useState } from "react";

import { runClientDiff } from "../lib/diff/runClientDiff";
import { runServerDiff } from "../lib/diff/runServerDiff";
import type { DiffResult } from "../lib/diff/types";

export type Engine = "client" | "server";

export type DiffState = {
  result: DiffResult | null;
  loading: boolean;
  error: string | null;
};

/**
 * React hook that wraps the client/server runners with cancellation and
 * debouncing. The hook is intentionally agnostic to where the images come
 * from so the page can pass them in directly without lifting state into a
 * global store.
 */
export function useImageDiff(
  beforeFile: File | null,
  afterFile: File | null,
  sensitivity: number,
  engine: Engine,
  ignoreAntialiasing: boolean,
) {
  const [state, setState] = useState<DiffState>({
    result: null,
    loading: false,
    error: null,
  });

  // Monotonic token used to discard stale results when params change quickly
  // (typically the user dragging the sensitivity slider).
  const tokenRef = useRef(0);

  const run = useCallback(async () => {
    if (!beforeFile || !afterFile) {
      setState({ result: null, loading: false, error: null });
      return;
    }
    const token = ++tokenRef.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const runner = engine === "client" ? runClientDiff : runServerDiff;
      const result = await runner(beforeFile, afterFile, {
        sensitivity,
        ignoreAntialiasing,
      });
      if (token !== tokenRef.current) return; // newer run started, drop this.
      setState({ result, loading: false, error: null });
    } catch (err) {
      if (token !== tokenRef.current) return;
      setState({
        result: null,
        loading: false,
        error: err instanceof Error ? err.message : "Diff failed",
      });
    }
  }, [beforeFile, afterFile, sensitivity, engine, ignoreAntialiasing]);

  // Debounce slider changes by 120 ms; that's short enough to feel
  // interactive but long enough to skip a dozen intermediate values.
  useEffect(() => {
    const handle = window.setTimeout(run, 120);
    return () => window.clearTimeout(handle);
  }, [run]);

  return { ...state, rerun: run };
}
