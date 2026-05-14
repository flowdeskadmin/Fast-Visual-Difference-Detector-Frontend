/// <reference lib="WebWorker" />

/**
 * Web Worker that runs the image-diff algorithm off the main thread so the
 * UI stays responsive even on large screenshots. The worker owns no DOM and
 * receives pre-decoded RGBA buffers as transferable `ArrayBuffer` objects,
 * which keeps the message-passing zero-copy.
 */

import { computeDiff } from "./algorithm";
import type { DiffResult } from "./types";

export type WorkerRequest = {
  id: number;
  before: ArrayBuffer;
  after: ArrayBuffer;
  /** Width *at the resolution the algorithm runs at*. */
  width: number;
  /** Height *at the resolution the algorithm runs at*. */
  height: number;
  /**
   * Display-space canvas width (before any internal downscaling).
   * Boxes are returned in this coordinate system.
   */
  displayWidth: number;
  /** Display-space canvas height. */
  displayHeight: number;
  sensitivity: number;
  ignoreAntialiasing: boolean;
  dimensionMismatch: boolean;
};

export type WorkerSuccess = {
  id: number;
  ok: true;
  result: DiffResult;
};

export type WorkerFailure = {
  id: number;
  ok: false;
  error: string;
};

export type WorkerResponse = WorkerSuccess | WorkerFailure;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    const start = performance.now();
    const { boxes, changedPixels } = computeDiff({
      before: new Uint8Array(req.before),
      after: new Uint8Array(req.after),
      width: req.width,
      height: req.height,
      sensitivity: req.sensitivity,
      ignoreAntialiasing: req.ignoreAntialiasing,
    });
    const durationMs = performance.now() - start;

    // If we ran at a reduced scale, project the boxes back into the
    // display coordinate system. This is a single multiplication per box
    // so we leave it out of the timed region above.
    const scaleX = req.displayWidth / req.width;
    const scaleY = req.displayHeight / req.height;
    const scaledBoxes =
      scaleX === 1 && scaleY === 1
        ? boxes
        : boxes.map((b) => ({
            x: Math.floor(b.x * scaleX),
            y: Math.floor(b.y * scaleY),
            width: Math.ceil(b.width * scaleX),
            height: Math.ceil(b.height * scaleY),
            pixels: b.pixels,
          }));

    const response: WorkerSuccess = {
      id: req.id,
      ok: true,
      result: {
        boxes: scaledBoxes,
        width: req.displayWidth,
        height: req.displayHeight,
        changedPixels,
        durationMs,
        dimensionMismatch: req.dimensionMismatch,
        ranOnClient: true,
        scale: scaleX,
      },
    };
    ctx.postMessage(response);
  } catch (err) {
    const response: WorkerFailure = {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(response);
  }
});
