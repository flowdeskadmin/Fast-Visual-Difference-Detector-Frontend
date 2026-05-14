/**
 * Shared types for the image-diff pipeline.
 *
 * These are used by both the in-browser Web Worker implementation and the
 * NestJS backend implementation so the UI can treat both transports
 * interchangeably.
 */

export type DiffBox = {
  /** Top-left x in pixel coordinates of the (padded) diff canvas. */
  x: number;
  /** Top-left y in pixel coordinates of the (padded) diff canvas. */
  y: number;
  /** Width of the box in pixels. */
  width: number;
  /** Height of the box in pixels. */
  height: number;
  /** Number of changed pixels inside the box (component area). */
  pixels: number;
};

export type DiffResult = {
  /**
   * Bounding boxes for the detected change regions, expressed in the
   * coordinate space of the **original** images (i.e. already unscaled
   * if we down-sampled internally). The UI can position them directly
   * against the displayed image without further math.
   */
  boxes: DiffBox[];
  /**
   * Canvas width used for the *displayed* coordinate system (max of the
   * two original image widths). Boxes are in this coordinate system.
   */
  width: number;
  /**
   * Canvas height used for the *displayed* coordinate system (max of the
   * two original image heights). Boxes are in this coordinate system.
   */
  height: number;
  /** Total number of changed pixels at the scale the algorithm ran at. */
  changedPixels: number;
  /** Wall-clock time in milliseconds for the diff computation. */
  durationMs: number;
  /** True if the two source images had different dimensions. */
  dimensionMismatch: boolean;
  /** True when the engine ran in a Web Worker, false when on the server. */
  ranOnClient: boolean;
  /**
   * Internal scale at which the algorithm ran. 1 means full resolution;
   * 0.5 means we down-sampled by 2x for speed. The UI surfaces this so
   * the user knows the diff isn't pixel-perfect at the original scale.
   */
  scale: number;
};

export type DiffParams = {
  /**
   * UI-friendly sensitivity in [0, 100] where 100 means "catch every change"
   * and 0 means "only catch obvious changes". The pipeline translates this
   * into a pixelmatch threshold, a min-area filter, and a merge radius.
   */
  sensitivity: number;
  /**
   * When true, antialiased pixels are treated as unchanged. We keep this on
   * by default because anti-aliasing produces a lot of false positives in
   * font rendering and vector graphics.
   */
  ignoreAntialiasing?: boolean;
};

/**
 * Translate the user-facing 0..100 sensitivity slider into the internal
 * algorithm knobs. Keeping this in one place makes the client and server
 * implementations produce identical results for the same slider value.
 */
export function resolveTuning(sensitivity: number, width: number, height: number) {
  const s = Math.max(0, Math.min(100, sensitivity)) / 100;

  // pixelmatch threshold: lower = more sensitive. Exponential decay so that
  // the high-sensitivity end of the slider has fine-grained control where
  // it actually matters for catching tiny color shifts.
  const pixelThreshold = 0.5 * Math.exp(-3 * s) + 0.005;

  // Dilation radius scales with image size so that "nearby" changes get
  // merged into the same box on both 480p and 4K screenshots.
  const minDim = Math.min(width, height);
  const dilation = Math.max(1, Math.round(minDim / 300));

  // Minimum component area in pixels, before dilation has been applied.
  // At max sensitivity we go down to ~4 px to catch tiny 5-10px diffs.
  const minArea = Math.max(4, Math.round(80 * (1 - s)));

  // Box-merge gap: boxes whose padded rectangles overlap get merged into
  // one. This is layered on top of dilation to clean up text-heavy diffs.
  const mergeGap = Math.max(4, Math.round(minDim / 200));

  return { pixelThreshold, dilation, minArea, mergeGap };
}
