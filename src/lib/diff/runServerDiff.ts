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

export async function runServerDiff(
  beforeFile: File,
  afterFile: File,
  params: DiffParams,
): Promise<DiffResult> {
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
  const res = await fetch(`${apiBase}/api/diff`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(`Server diff failed (${res.status}): ${message || res.statusText}`);
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
