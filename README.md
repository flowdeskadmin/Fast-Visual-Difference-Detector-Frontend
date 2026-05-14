# Image Diff Inspector — Frontend

A focused single-page GUI for comparing two images and automatically
highlighting the visual differences between them.

- **Stack:** Vite + React 19 + TypeScript + Tailwind v4.
- **Diff engine:** runs **in the browser** by default inside a Web
  Worker, so the main thread stays responsive. The same algorithm has a
  drop-in server-side counterpart in the companion **backend** repo
  (NestJS + sharp + pixelmatch) — flip the "Browser ↔ Server" pill in
  the header to switch. If you only run the frontend, the Browser
  engine is fully functional standalone.

---

## 1. How to run the application

Requirements: **Node ≥ 20**.

```bash
npm install
npm run dev          # → http://localhost:5173
```

That's it — the Browser engine works without the backend.

### Optional: run the server engine

Clone the companion `image-diff-backend` repo, copy its `.env.example`
to `.env`, run `npm install && npm run dev` on port `8000`. Vite's dev
proxy in `vite.config.ts` forwards `/api/*` to it, so no CORS work is
needed.

### Production build

```bash
npm run build        # tsc -b && vite build → dist/
npm run preview      # serves the built bundle
```

### Deploying to Vercel

This is a stock Vite SPA, so Vercel deploys it with zero application
code changes — the only file related to the platform is a tiny
`vercel.json` for SPA fallback routing.

Steps:

1. Push this repo to GitHub.
2. On <https://vercel.com>, **Add New → Project → Import** your
   frontend repo. Vercel auto-detects Vite:
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
3. Under **Environment Variables**, add:
   - `VITE_API_BASE_URL` → the deployed backend's URL,
     e.g. `https://image-diff-backend-production.up.railway.app`.
     Vite inlines this at build time. **Don't include a trailing
     slash** — the runner appends `/api/diff`.
4. Click **Deploy**.
5. Once it's live, open the deployed URL, click **Server** in the
   engine toggle, and run a demo pair. The frontend will call the
   Railway backend, which already allows any `*.vercel.app` origin via
   CORS so it just works for preview deploys too.

If you ever move the frontend off Vercel, the only thing to delete is
`vercel.json`. Nothing else is platform-specific.

### How to use the UI

1. Click any pill in the **Try a demo pair** strip at the top to
   generate a synthetic before/after pair on the fly (color change,
   text change, extra element, missing element, or a tiny 6 px change).
   The pair flows through the same code path as a real upload — this
   is the fastest way to verify the app works.
2. Or drop two of your own images into the **Before** and **After**
   tiles (PNG, JPG, WEBP, BMP, GIF).
3. The diff runs automatically and shows:
   - Bounding boxes drawn over the changed regions on both panels with
     a semi-transparent rose fill so they're visible against any
     background. Hover a box for its pixel count and dimensions.
   - Processing time (ms), region count, and changed-pixel count.
4. Drag the **Sensitivity** slider to tune. The diff re-runs (debounced
   120 ms) so you get near-instant feedback.
5. Toggle **Ignore anti-aliasing** off to see the raw output.
6. Use **Swap before ↔ after** to quickly invert the pair, or
   **Clear both** to reset.

---

## 2. Visual diff algorithm

The full pipeline lives in `src/lib/diff/algorithm.ts` and runs inside
the Web Worker (`src/lib/diff/worker.ts`). The browser-only steps
(decode, downsample, pad, transfer) live in `src/lib/diff/runClientDiff.ts`.

**Step by step:**

1. **Decode** both images to raw RGBA via `createImageBitmap` →
   `OffscreenCanvas.getImageData`. If the padded canvas's longest side
   exceeds **2400 px**, both images are down-sampled by the same
   factor at decode time using `createImageBitmap`'s
   `resizeWidth`/`resizeHeight` (browser-native, GPU-accelerated when
   available). Boxes are projected back to the *original* coordinate
   system after the algorithm finishes, and the UI surfaces the scale
   factor so the user knows the diff isn't pixel-perfect at that
   scale.
2. **Pad** the smaller image to the union of both dimensions with a
   transparent background. The "extra" area on the larger image is
   intentionally flagged as a difference — the UI surfaces a banner
   explaining what happened so the user isn't surprised.
3. **pixelmatch** the two buffers with a YIQ-based perceptual color
   metric and anti-aliasing detection. Threshold comes from the
   sensitivity slider (see §3).
4. **Compress** the styled diff output into a 1-byte-per-pixel binary
   mask by checking for pixelmatch's red marker color. This makes the
   next stages cache-friendly.
5. **Dilate** the mask with a two-pass 1-D sliding-window box filter.
   Radius scales with image size (`max(1, minDim / 300)`). This is
   what stitches the dots of an "i" or the pixels of a thin font
   stroke into a single region instead of dozens of micro-boxes.
6. **Connected-component labeling** with 8-connectivity, two-pass
   union-find with path compression (`Uint32Array` labels +
   `Int32Array` parent table for cache locality). Bounding box and
   pixel count per component are accumulated inline so we don't need a
   second sweep.
7. **Min-area filter** drops noise components below
   `max(4, 80 · (1 − s))` pixels.
8. **Greedy bounding-box merge** with an overlap-with-gap test. The
   gap scales with image size like the dilation radius. This cleans
   up close-but-not-quite-touching boxes — common when a UI element
   moves slightly and both the "missing from A" and "added to B"
   regions survive as separate components.

The result is a list of `{ x, y, width, height, pixels }` boxes in the
coordinate space of the *padded canvas* (union dimensions). The UI
renders them as percentage-positioned overlays so the same numbers
work for both panels regardless of how each image is scaled in the
viewport.

### Why this design

- **Native decode + typed arrays everywhere.** `Uint8Array`,
  `Uint32Array`, `Int32Array` — no boxing, no JSON overhead in hot
  paths. Dilation is two 1-D passes with a running-count window
  (`O(W·H·r)` with great cache behaviour).
- **Web Worker.** The diff never blocks the main thread, so the slider
  stays buttery even on multi-megapixel screenshots. Buffers are
  `Transferable`, so the `postMessage` hop is zero-copy.
- **Single Worker, kept warm.** Re-runs (e.g. dragging the slider)
  reuse the same Worker instance.
- **Same algorithm in the companion backend.** If you flip the engine
  toggle, the boxes don't shift — they're produced by the same
  TypeScript pipeline running under Node + sharp.

---

## 3. Sensitivity control

The slider is a single `0..100` value that maps to **three** internal
algorithm knobs at once, so users only have to think about a single
"sensitivity" concept. All three are computed in `resolveTuning()` in
`src/lib/diff/types.ts`.

Let `s = sensitivity / 100`.

| Knob                  | Formula                                  | What it does                                                              |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| pixelmatch threshold  | `0.5 · exp(-3 · s) + 0.005`              | Lower threshold → flag smaller per-pixel color differences.               |
| Min component area    | `max(4, round(80 · (1 − s)))` pixels     | Higher sensitivity allows tinier components through the filter.           |
| Dilation / merge gap  | scales with `min(W, H)` only             | Stays constant across the slider; tied to image size, not sensitivity.    |

Sample values for the slider extremes:

| Slider | pixelmatch threshold | Min component area |
| ------ | -------------------: | -----------------: |
|  0     | 0.505                | 80 px              |
|  60    | 0.088                | 32 px              |
| 100    | 0.030                | 4 px               |

The exponential decay on the pixelmatch threshold gives fine-grained
control at the high-sensitivity end, which is where it actually
matters (the difference between `0.5` and `0.4` is huge; the
difference between `0.03` and `0.02` is where you catch subtle text
recoloring).

A separate **Ignore anti-aliasing** checkbox toggles pixelmatch's
`includeAA` option. It defaults to `true` because AA detection
dramatically reduces false positives in font rendering and vector
graphics, but turning it off is useful for debugging.

---

## 4. How processing time is measured

The number shown in the **Processing time** stat is **algorithm-only**
wall-clock time, deliberately excluding I/O.

- Measured inside the Web Worker using `performance.now()` around the
  `computeDiff(...)` call. See `src/lib/diff/worker.ts`.
- **Excluded** from the number: file → `ImageBitmap` decode + optional
  downscale, `getImageData()`, padding, `postMessage` transfer, and
  the box-coordinate up-scaling after the algorithm finishes. Those
  run on the main thread (or before/after the timed region) so the
  reported number is the *pure algorithm time* on the actual pixel
  data the algorithm sees.
- For very large inputs we down-sample before running the algorithm
  (see §2). The reported ms is for the diff *at that reduced
  resolution*. The UI surfaces the scale factor (e.g. "ran at 50%
  scale") so the number is self-explanatory.
- Rounded to one decimal for display via `durationMs.toFixed(1)`.
- This is intentional — what the user actually waits on is the
  algorithm, not the JPEG decoder, and decoding is largely
  incompressible work delegated to the browser.

If you need to time the **roundtrip** of the Server engine (including
network), open DevTools' Network tab — the algorithm itself will
almost always be a small fraction of the wire time.

---

## 5. Known limitations

- **No global alignment.** The algorithm assumes both images describe
  the same scene at the same position. A 1–2 pixel layout shift will
  light up most of the screen as a difference. A future iteration
  could add a coarse alignment step (phase-correlation or feature
  matching) to detect a global shift and re-baseline before pixel
  comparison.
- **Anti-aliasing detection isn't perfect.** Fonts that render with
  slightly different sub-pixel positioning between OS versions or
  browsers can still produce thin halos around text. Toggle "Ignore
  anti-aliasing" off in the UI to see what the raw output looks like.
- **Different file formats can disagree.** Comparing a PNG against a
  JPEG of the same source will surface JPEG compression artifacts as
  differences. The algorithm has no way to know they came from the
  same master.
- **Dimension mismatch is treated as a change.** The smaller image is
  padded with transparency, and the extra strip on the larger image
  becomes a big bounding box. The UI shows a banner explaining this,
  but it's a design choice rather than something we silently work
  around. Cropping to the overlap region would hide real changes near
  the edges of the larger image, which seemed worse.
- **Browser engine down-samples above 2400 px on the longest side.**
  This keeps the slider interactive on 5K+ screenshots, but it means
  a 7-pixel change in the original might land as a 3-pixel change at
  the down-sampled scale and slip past the min-area filter. Switch
  to the **Server** engine for full-resolution analysis, or raise
  `MAX_DIFF_SIDE` in `src/lib/diff/runClientDiff.ts`.
- **Memory bounded by JS heap.** No hard upload cap, but
  `createImageBitmap` + `Uint8ClampedArray` for RGBA is roughly 8
  bytes per source pixel. For genuinely huge inputs (>50 MP), the
  Server engine is the better path.
- **No persistence.** Images live in memory only — no upload history,
  no diff replay, no JSON export. Explicitly out of scope for the
  assignment.
- **No semantic understanding.** A spinner that rotated frames between
  the two captures will diff as a chaotic blob. Same for animations,
  cursors, video frames, etc.
- **AA detection is per-channel.** Very saturated edge cases (pure red
  vs. pure green at a 1-px edge) occasionally slip past the AA
  detector and survive as tiny boxes. Bumping sensitivity down to
  ~30 typically suppresses them.

---

## 6. AI tools used during development

This project was built collaboratively with **Claude Opus 4.7** through
the **Cursor IDE agent**. The model was used for:

- Architectural decisions (client-only vs. server-only vs. dual-engine,
  picking `pixelmatch` over `resemble.js` / custom SSIM, choosing
  union-find CCL over recursive flood-fill, downsample at decode time
  vs. after).
- Trimming the React admin template down to the essentials (keeping
  Tailwind v4, the theme context, and the dropzone library; dropping
  ~40 unused admin pages, components, and dependencies).
- Drafting every TypeScript file under `src/lib/diff/`,
  `src/lib/samples.ts`, `src/components/`, `src/pages/`, and this
  README.
- Resolving build issues (the `lightningcss` native-binary mismatch
  under `npm install`).
- Implementing the two-pass dilation, the union-find connected-
  component labelling, and the bounding-box merge from scratch in
  TypeScript.

Verification was done by running both the production build
(`npm run build`) and a manual pass through every "Try a demo pair"
sample, plus the smoke test in the companion backend repo. No model
output was committed without being run.

**No AI services or model APIs are called at runtime** — the diff
itself is pure pixel arithmetic in `pixelmatch` plus the classical
computer-vision steps described in §2.

---

## Project layout

```text
src/
├── App.tsx                     # Single-page entry
├── main.tsx                    # ReactDOM root + providers
├── index.css                   # Tailwind + custom slider styling
├── pages/
│   └── ImageDiffPage.tsx       # Top-level layout
├── components/
│   ├── ImageDropzone.tsx       # Before/after drop tile (react-dropzone)
│   ├── DiffViewer.tsx          # Side-by-side panels + box overlay
│   ├── SensitivityControl.tsx  # 0–100 slider with anchor labels
│   ├── EngineToggle.tsx        # Browser ↔ Server pill
│   ├── StatsBar.tsx            # Processing time, region count, banners
│   ├── SampleGallery.tsx       # "Try a demo pair" pills
│   ├── ThemeToggle.tsx         # Dark/light mode
│   └── common/PageMeta.tsx     # <Helmet> wrapper
├── hooks/
│   └── useImageDiff.ts         # Debounced, cancellation-aware hook
├── context/
│   └── ThemeContext.tsx        # Light/dark with localStorage
└── lib/
    ├── samples.ts              # On-the-fly demo image generator
    └── diff/
        ├── algorithm.ts        # Pure diff pipeline (pixelmatch → CCL → merge)
        ├── worker.ts           # Web Worker entry point
        ├── runClientDiff.ts    # Decode + downsample + dispatch
        ├── runServerDiff.ts    # POST /api/diff wrapper
        └── types.ts            # Shared shape + sensitivity → knobs mapping
```

## Scripts

| Script           | What it does                                         |
| ---------------- | ---------------------------------------------------- |
| `npm run dev`    | Vite dev server on `http://localhost:5173`           |
| `npm run build`  | Type-check (`tsc -b`) + Vite production build        |
| `npm run preview`| Serves the built bundle                              |
| `npm run lint`   | ESLint                                               |
