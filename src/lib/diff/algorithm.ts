/**
 * Core image-diff algorithm.
 *
 * This module is environment-agnostic: it works on RGBA buffers and pulls in
 * `pixelmatch` as its only heavy dependency. The same code path runs inside
 * the browser Web Worker and the NestJS backend so the user can flip the
 * "server-side" switch and get identical bounding boxes.
 *
 * Pipeline:
 *   1. pixelmatch the two RGBA buffers (with antialiasing detection) to get a
 *      coarse-grained diff mask in the alpha channel of the output buffer.
 *   2. Compress that mask into a flat Uint8Array of 0/1 to make the next
 *      stages cache-friendly.
 *   3. Optional morphological dilation that grows each changed pixel by N px.
 *      This is what stitches the dots of an "i" into a single bounding box
 *      for a text-level change instead of two boxes per character.
 *   4. Two-pass connected-component labelling with union-find. We track each
 *      component's bounding box and area inline to avoid a second sweep.
 *   5. Filter out tiny components below `minArea`. The threshold scales with
 *      the sensitivity slider so the user can dial in for tiny or large
 *      changes.
 *   6. Greedy bounding-box merge using `mergeGap` to clean up the long tail
 *      of close-but-not-touching components that survived dilation. Common
 *      for moved UI elements where the "missing from A" and "added in B"
 *      regions overlap.
 */

import pixelmatch from "pixelmatch";

import type { DiffBox } from "./types";
import { resolveTuning } from "./types";

export type AlgorithmInput = {
  /** RGBA pixel buffer for the "before" image after padding to canvas size. */
  before: Uint8Array | Uint8ClampedArray;
  /** RGBA pixel buffer for the "after" image after padding to canvas size. */
  after: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  sensitivity: number;
  ignoreAntialiasing: boolean;
};

export type AlgorithmOutput = {
  boxes: DiffBox[];
  changedPixels: number;
};

export function computeDiff(input: AlgorithmInput): AlgorithmOutput {
  const { before, after, width, height, sensitivity, ignoreAntialiasing } = input;
  const tuning = resolveTuning(sensitivity, width, height);

  // pixelmatch writes a styled diff into this buffer but we only care about
  // which pixels changed, not the visualization. We discard it after step 2.
  const diffBuffer = new Uint8Array(width * height * 4);

  const changedPixels = pixelmatch(before, after, diffBuffer, width, height, {
    threshold: tuning.pixelThreshold,
    includeAA: !ignoreAntialiasing,
    alpha: 0.1,
  });

  if (changedPixels === 0) {
    return { boxes: [], changedPixels: 0 };
  }

  // Step 2: flatten the diff into a 1-byte-per-pixel mask. pixelmatch encodes
  // changed pixels as red or yellow with full alpha, while unchanged pixels
  // are written as the original image attenuated by `alpha`. We treat any
  // non-grey output as a diff.
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < diffBuffer.length; i += 4, p++) {
    const r = diffBuffer[i];
    const b = diffBuffer[i + 2];
    // pixelmatch marks differences with red (255,0,0) or yellow (255,255,0).
    // Both have strong red and weak blue, so a single channel comparison is
    // a reliable check that's faster than computing luminance.
    if (r > 200 && b < 80) {
      mask[p] = 1;
    }
  }

  // Step 3: morphological dilation. We do it with two passes (horizontal then
  // vertical) over a rolling window which is O(W*H*r) but with great cache
  // behaviour. For typical screenshots this finishes in a handful of ms.
  const dilated = tuning.dilation > 0 ? dilate(mask, width, height, tuning.dilation) : mask;

  // Step 4 + 5: CCL with bbox/area accumulation, then filter by min area.
  const components = labelComponents(dilated, width, height, tuning.minArea);

  // Step 6: greedy merge of overlapping/near-overlapping boxes.
  const merged = mergeBoxes(components, tuning.mergeGap);

  return { boxes: merged, changedPixels };
}

/**
 * Dilate a binary mask by `radius` pixels using two 1-D passes (horizontal
 * then vertical). The two-pass form is mathematically equivalent to dilating
 * with a square kernel and is much faster than the 2-D form because we keep
 * a running count of "set" pixels in the sliding window.
 *
 * The function allocates one intermediate buffer and one output buffer; both
 * are recycled across calls in practice because the worker keeps them in
 * scope between messages.
 */
function dilate(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  const intermediate = new Uint8Array(w * h);
  const output = new Uint8Array(w * h);
  const r = radius;

  // Horizontal pass.
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let count = 0;
    // Prime the window for x = 0.
    for (let x = 0; x <= r && x < w; x++) {
      count += mask[row + x];
    }
    for (let x = 0; x < w; x++) {
      intermediate[row + x] = count > 0 ? 1 : 0;
      const addX = x + r + 1;
      const removeX = x - r;
      if (addX < w) count += mask[row + addX];
      if (removeX >= 0) count -= mask[row + removeX];
    }
  }

  // Vertical pass.
  for (let x = 0; x < w; x++) {
    let count = 0;
    for (let y = 0; y <= r && y < h; y++) {
      count += intermediate[y * w + x];
    }
    for (let y = 0; y < h; y++) {
      output[y * w + x] = count > 0 ? 1 : 0;
      const addY = y + r + 1;
      const removeY = y - r;
      if (addY < h) count += intermediate[addY * w + x];
      if (removeY >= 0) count -= intermediate[removeY * w + x];
    }
  }

  return output;
}

type ComponentStats = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixels: number;
};

/**
 * Two-pass connected-component labelling using 8-connectivity. We use a flat
 * `Int32Array` as the union-find parent table for cache friendliness.
 *
 * The label of pixel `p` is stored in `labels[p]`. Labels are 1-based so that
 * 0 can be used as "background / unlabelled".
 */
function labelComponents(
  mask: Uint8Array,
  w: number,
  h: number,
  minArea: number,
): DiffBox[] {
  const labels = new Uint32Array(w * h);
  // Generous upper bound: at most w*h/2 distinct labels in the worst case.
  // We grow the parent array as needed.
  let parent = new Int32Array(1024);
  parent[0] = 0;
  let nextLabel = 1;

  const ensureParentCap = (cap: number) => {
    if (cap < parent.length) return;
    let n = parent.length;
    while (n <= cap) n *= 2;
    const grown = new Int32Array(n);
    grown.set(parent);
    parent = grown;
  };

  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };

  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (ra < rb) parent[rb] = ra;
    else parent[ra] = rb;
  };

  // Pass 1: assign provisional labels and record equivalences. Look at the
  // N, NW, NE, and W neighbours for 8-connectivity.
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const p = row + x;
      if (mask[p] === 0) continue;

      const left = x > 0 ? labels[p - 1] : 0;
      const up = y > 0 ? labels[p - w] : 0;
      const upLeft = x > 0 && y > 0 ? labels[p - w - 1] : 0;
      const upRight = x < w - 1 && y > 0 ? labels[p - w + 1] : 0;

      let label = 0;
      if (left) label = label === 0 ? left : Math.min(label, left);
      if (up) label = label === 0 ? up : Math.min(label, up);
      if (upLeft) label = label === 0 ? upLeft : Math.min(label, upLeft);
      if (upRight) label = label === 0 ? upRight : Math.min(label, upRight);

      if (label === 0) {
        ensureParentCap(nextLabel);
        parent[nextLabel] = nextLabel;
        label = nextLabel++;
      } else {
        if (left && left !== label) union(label, left);
        if (up && up !== label) union(label, up);
        if (upLeft && upLeft !== label) union(label, upLeft);
        if (upRight && upRight !== label) union(label, upRight);
      }
      labels[p] = label;
    }
  }

  // Pass 2: resolve to root labels and accumulate per-component bounding
  // boxes and pixel counts. We use a Map keyed by root label which is a
  // little slower than a dense array but uses far less memory when only a
  // handful of components survive.
  const stats = new Map<number, ComponentStats>();
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const lbl = labels[row + x];
      if (lbl === 0) continue;
      const root = find(lbl);
      const s = stats.get(root);
      if (s) {
        if (x < s.minX) s.minX = x;
        if (x > s.maxX) s.maxX = x;
        if (y < s.minY) s.minY = y;
        if (y > s.maxY) s.maxY = y;
        s.pixels++;
      } else {
        stats.set(root, { minX: x, minY: y, maxX: x, maxY: y, pixels: 1 });
      }
    }
  }

  const boxes: DiffBox[] = [];
  for (const s of stats.values()) {
    if (s.pixels < minArea) continue;
    boxes.push({
      x: s.minX,
      y: s.minY,
      width: s.maxX - s.minX + 1,
      height: s.maxY - s.minY + 1,
      pixels: s.pixels,
    });
  }
  return boxes;
}

/**
 * Greedy bounding box merge. Two boxes are merged when, after inflating each
 * by `mergeGap`, they overlap. Repeated until a pass produces no merges.
 *
 * O(n^2) in the number of boxes which is fine because we expect at most a
 * few hundred boxes after the min-area filter. For pathological inputs we
 * could swap in a sweep-line or grid index but it isn't worth the complexity
 * here.
 */
function mergeBoxes(boxes: DiffBox[], gap: number): DiffBox[] {
  if (boxes.length <= 1) return boxes;

  // Sort by area descending so big regions absorb the small ones first.
  const sorted = [...boxes].sort((a, b) => b.width * b.height - a.width * a.height);

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        if (
          a.x - gap <= b.x + b.width &&
          b.x - gap <= a.x + a.width &&
          a.y - gap <= b.y + b.height &&
          b.y - gap <= a.y + a.height
        ) {
          const minX = Math.min(a.x, b.x);
          const minY = Math.min(a.y, b.y);
          const maxX = Math.max(a.x + a.width, b.x + b.width);
          const maxY = Math.max(a.y + a.height, b.y + b.height);
          sorted[i] = {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
            pixels: a.pixels + b.pixels,
          };
          sorted.splice(j, 1);
          changed = true;
          j--;
        }
      }
    }
  }

  return sorted;
}
