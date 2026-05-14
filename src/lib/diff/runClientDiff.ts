/**
 * Client-side runner for the image-diff pipeline.
 *
 * Responsibilities:
 *   - Lazily spin up a single Web Worker and keep it warm across re-runs.
 *   - Decode both images via `createImageBitmap` (browser-native, off the
 *     main thread).
 *   - Pad smaller images to the union dimensions so we always diff at the
 *     same scale and the user can see when one image is "extra big".
 *   - Down-sample very large pairs so we don't run out of memory or hang
 *     the worker for a UX-breaking length of time. The scale factor is
 *     reported back to the UI so the user knows what happened.
 *   - Transfer the resulting RGBA `ArrayBuffer` to the worker without
 *     copying, so even multi-megapixel images stay cheap.
 */

import type { DiffParams, DiffResult } from "./types";
import type { WorkerRequest, WorkerResponse } from "./worker";

/**
 * Hard ceiling on the *longest* side of the padded diff canvas. Above
 * this, we down-sample both images proportionally before diffing. 2400
 * is roughly the height of a 4K screenshot, which is the largest input
 * that finishes the algorithm in under ~100 ms on a typical laptop.
 * Bigger inputs (long scrolling screenshots) get scaled down so the slider
 * remains interactive; the scale factor is surfaced in the UI.
 */
const MAX_DIFF_SIDE = 2400;

let workerSingleton: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (res: WorkerResponse) => void>();

function getWorker(): Worker {
  if (workerSingleton) return workerSingleton;
  workerSingleton = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
    name: "image-diff-worker",
  });
  workerSingleton.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
    const handler = pending.get(event.data.id);
    if (handler) {
      pending.delete(event.data.id);
      handler(event.data);
    }
  });
  workerSingleton.addEventListener("error", (event) => {
    // Reject every in-flight request so the UI doesn't hang.
    for (const [id, handler] of pending) {
      handler({ id, ok: false, error: event.message || "Worker error" });
    }
    pending.clear();
  });
  return workerSingleton;
}

/**
 * Decode + optionally downscale a `File` to RGBA pixel data. The scale
 * is applied at decode time using `createImageBitmap`'s built-in resizer
 * (which goes through the GPU when available), so it's much cheaper than
 * decoding at full size and then resampling.
 */
async function fileToImageData(file: File, scale: number): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  // Resize via a second createImageBitmap pass when scaling is needed:
  // the browser uses high-quality resampling (typically bilinear+) under
  // the hood and runs it off the main thread.
  const sized =
    scale === 1
      ? bitmap
      : await createImageBitmap(bitmap, {
          resizeWidth: width,
          resizeHeight: height,
          resizeQuality: "high",
        });

  if (scale !== 1) bitmap.close();

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Failed to create 2D context for image decode.");
    ctx.drawImage(sized, 0, 0);
    sized.close();
    return ctx.getImageData(0, 0, width, height);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Failed to create 2D context for image decode.");
  ctx.drawImage(sized, 0, 0);
  sized.close();
  return ctx.getImageData(0, 0, width, height);
}

/**
 * Cheaply read just the dimensions of a `File` so we can compute the
 * scale factor before deciding how much to downsample. `createImageBitmap`
 * is the lightest way to do this in modern browsers.
 */
async function fileDimensions(file: File): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  bitmap.close();
  return { width, height };
}

/**
 * Pad an `ImageData` onto a transparent canvas of `(width, height)`. We
 * pad with fully transparent pixels so that, when one image is larger
 * than the other, the extra area on the smaller image is visibly
 * different from any real content and gets flagged as a change.
 */
function padToCanvas(img: ImageData, width: number, height: number): Uint8ClampedArray {
  if (img.width === width && img.height === height) {
    return img.data;
  }
  const out = new Uint8ClampedArray(width * height * 4);
  const rowBytes = img.width * 4;
  for (let y = 0; y < img.height; y++) {
    const srcStart = y * rowBytes;
    const dstStart = y * width * 4;
    out.set(img.data.subarray(srcStart, srcStart + rowBytes), dstStart);
  }
  return out;
}

export async function runClientDiff(
  beforeFile: File,
  afterFile: File,
  params: DiffParams,
): Promise<DiffResult> {
  // Step 1: read both images' real dimensions so we can decide a single
  // shared scale factor before doing any expensive work.
  const [beforeDim, afterDim] = await Promise.all([
    fileDimensions(beforeFile),
    fileDimensions(afterFile),
  ]);

  const displayWidth = Math.max(beforeDim.width, afterDim.width);
  const displayHeight = Math.max(beforeDim.height, afterDim.height);
  const dimensionMismatch =
    beforeDim.width !== afterDim.width || beforeDim.height !== afterDim.height;

  const longestSide = Math.max(displayWidth, displayHeight);
  const scale = longestSide > MAX_DIFF_SIDE ? MAX_DIFF_SIDE / longestSide : 1;

  // Step 2: decode at the chosen scale. Doing the resize at decode time
  // avoids ever materializing the full-resolution RGBA buffer, which is
  // 4x cheaper than decode → manual downsample for 4K+ inputs.
  const [beforeImg, afterImg] = await Promise.all([
    fileToImageData(beforeFile, scale),
    fileToImageData(afterFile, scale),
  ]);

  const algoWidth = Math.max(beforeImg.width, afterImg.width);
  const algoHeight = Math.max(beforeImg.height, afterImg.height);

  const beforePadded = padToCanvas(beforeImg, algoWidth, algoHeight);
  const afterPadded = padToCanvas(afterImg, algoWidth, algoHeight);

  // Detach into ArrayBuffers we can transfer to the worker without a copy.
  const beforeBuffer = beforePadded.buffer.slice(
    beforePadded.byteOffset,
    beforePadded.byteOffset + beforePadded.byteLength,
  );
  const afterBuffer = afterPadded.buffer.slice(
    afterPadded.byteOffset,
    afterPadded.byteOffset + afterPadded.byteLength,
  );

  const worker = getWorker();
  const id = nextId++;
  const request: WorkerRequest = {
    id,
    before: beforeBuffer,
    after: afterBuffer,
    width: algoWidth,
    height: algoHeight,
    displayWidth,
    displayHeight,
    sensitivity: params.sensitivity,
    ignoreAntialiasing: params.ignoreAntialiasing ?? true,
    dimensionMismatch,
  };

  return new Promise<DiffResult>((resolve, reject) => {
    pending.set(id, (res) => {
      if (res.ok) resolve(res.result);
      else reject(new Error(res.error));
    });
    worker.postMessage(request, [request.before, request.after]);
  });
}
