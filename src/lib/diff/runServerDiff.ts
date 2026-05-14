/**
 * Server-side runner. Sends the two raw image files to the NestJS backend
 * which runs the exact same algorithm via `sharp` + `pixelmatch`.
 *
 * The wall-clock duration we report is the server-measured compute time
 * (from the JSON response) - not the total roundtrip - so the "client vs
 * server" comparison in the UI is apples-to-apples.
 */

import type { DiffParams, DiffResult } from "./types";

type ServerResponse = {
  width: number;
  height: number;
  boxes: { x: number; y: number; width: number; height: number; pixels: number }[];
  changedPixels: number;
  durationMs: number;
  dimensionMismatch: boolean;
};

/**
 * Vercel's edge layer rejects request bodies larger than 4.5 MB before
 * they reach the function. When that happens the response (a) doesn't
 * carry CORS headers, so the browser surfaces it as a generic
 * `TypeError: Failed to fetch` rather than a 413; and (b) prevents us
 * from showing the user a useful error.
 *
 * We pre-flight the total payload size against this cap and short-
 * circuit with a clear message. The cap is intentionally per-pair (sum
 * of both files) because the multipart envelope wraps both at once.
 */
const VERCEL_EDGE_BODY_CAP_BYTES = 4 * 1024 * 1024; // 4 MB - leave headroom for multipart framing.

export async function runServerDiff(
  beforeFile: File,
  afterFile: File,
  params: DiffParams,
): Promise<DiffResult> {
  const total = beforeFile.size + afterFile.size;
  if (total > VERCEL_EDGE_BODY_CAP_BYTES) {
    throw new Error(
      `Image pair is too large for the deployed Server engine ` +
        `(${formatBytes(total)} > ${formatBytes(VERCEL_EDGE_BODY_CAP_BYTES)} ` +
        `request-body cap on Vercel). Switch to the Browser engine for this pair, ` +
        `or self-host the backend on a platform with a larger body limit.`,
    );
  }

  const formData = new FormData();
  formData.append("before", beforeFile);
  formData.append("after", afterFile);
  formData.append("sensitivity", String(params.sensitivity));
  formData.append(
    "ignoreAntialiasing",
    params.ignoreAntialiasing === false ? "false" : "true",
  );

  // In dev, `/api/*` is proxied to localhost:8000 by `vite.config.ts`.
  // In prod we need an absolute URL because the SPA and the API live on
  // different origins (e.g. Vercel + Railway). Set `VITE_API_BASE_URL`
  // in the deployment env to point at the API host, e.g.
  // "https://image-diff-backend-production.up.railway.app". When unset
  // we fall back to same-origin which keeps local dev working without
  // any env file.
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

  let res: Response;
  try {
    res = await fetch(`${apiBase}/api/diff`, {
      method: "POST",
      body: formData,
    });
  } catch (err) {
    // `fetch` throws a `TypeError` for network-level failures including
    // CORS-blocked responses. When the edge rejects with 4xx but doesn't
    // include CORS headers we land here with a useless "Failed to fetch"
    // message. Hint at the most likely real cause.
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Could not reach the Server engine (${detail}). ` +
        `Common causes: backend is offline, CORS rules don't allow this origin, ` +
        `or the request body exceeded the platform's edge limit. ` +
        `The Browser engine works without the backend if you just want to keep going.`,
    );
  }

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    if (res.status === 413) {
      throw new Error(
        `Server engine rejected the upload: 413 Content Too Large. ` +
          `The deployed backend (Vercel) caps request bodies at 4.5 MB. ` +
          `Switch to the Browser engine for this pair.`,
      );
    }
    if (res.status === 502 || res.status === 504) {
      throw new Error(
        `Server engine timed out (${res.status}). The deployed backend ` +
          `couldn't finish in time — usually means the image pair is huge. ` +
          `Try the Browser engine.`,
      );
    }
    throw new Error(
      `Server diff failed (${res.status} ${res.statusText})` +
        (message ? `: ${truncate(message, 200)}` : ""),
    );
  }

  const json = (await res.json()) as ServerResponse;
  return {
    boxes: json.boxes,
    width: json.width,
    height: json.height,
    changedPixels: json.changedPixels,
    durationMs: json.durationMs,
    dimensionMismatch: json.dimensionMismatch,
    ranOnClient: false,
    // Server always diffs at native resolution today; downsampling on
    // the server doesn't pay off because libvips streams big images.
    scale: 1,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
