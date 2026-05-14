import { useEffect, useMemo, useState } from "react";

import type { DiffBox, DiffResult } from "../lib/diff/types";

type Props = {
  beforeFile: File | null;
  afterFile: File | null;
  result: DiffResult | null;
  loading: boolean;
};

/**
 * Side-by-side image viewer with overlaid bounding boxes. The boxes are
 * positioned in percentage units against the diff canvas (the union of the
 * two image dimensions) so the same coordinates work for both panels even
 * when the images have different sizes - the smaller image just renders in
 * its proportional top-left corner of the canvas.
 */
export function DiffViewer({ beforeFile, afterFile, result, loading }: Props) {
  const beforeUrl = useObjectUrl(beforeFile);
  const afterUrl = useObjectUrl(afterFile);

  if (!beforeFile || !afterFile) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white p-10 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
        Upload both a “before” and an “after” image to see the diff.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel
        label="Before"
        accent="bg-sky-500"
        imageUrl={beforeUrl}
        boxes={result?.boxes ?? []}
        canvasWidth={result?.width}
        canvasHeight={result?.height}
        loading={loading}
      />
      <Panel
        label="After"
        accent="bg-emerald-500"
        imageUrl={afterUrl}
        boxes={result?.boxes ?? []}
        canvasWidth={result?.width}
        canvasHeight={result?.height}
        loading={loading}
      />
    </div>
  );
}

function Panel({
  label,
  accent,
  imageUrl,
  boxes,
  canvasWidth,
  canvasHeight,
  loading,
}: {
  label: string;
  accent: string;
  imageUrl: string | null;
  boxes: DiffBox[];
  canvasWidth: number | undefined;
  canvasHeight: number | undefined;
  loading: boolean;
}) {
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

  // Reset whenever the image source changes so we don't briefly show stale
  // dimensions while the new image is decoding.
  useEffect(() => {
    setNaturalSize(null);
  }, [imageUrl]);

  // If the diff hasn't run yet we just want the image to fit naturally.
  // Once we have a canvas size, we size the image proportionally inside
  // a wrapper that matches the *canvas* aspect ratio so the bounding box
  // overlay is always in lock-step with the diff coordinate system.
  const haveCanvas = canvasWidth != null && canvasHeight != null;

  const imageStyle: React.CSSProperties = useMemo(() => {
    if (!haveCanvas || !naturalSize) {
      return {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "contain",
      };
    }
    return {
      position: "absolute",
      left: 0,
      top: 0,
      width: `${(naturalSize.w / canvasWidth!) * 100}%`,
      height: `${(naturalSize.h / canvasHeight!) * 100}%`,
    };
  }, [haveCanvas, naturalSize, canvasWidth, canvasHeight]);

  return (
    <div className="flex flex-col">
      <div className="mb-2 flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${accent}`} />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {label}
        </span>
        {naturalSize && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {naturalSize.w} × {naturalSize.h}
          </span>
        )}
        {loading && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-500" />
            Computing diff…
          </span>
        )}
      </div>
      <div
        className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-950"
        style={{
          aspectRatio: haveCanvas
            ? `${canvasWidth} / ${canvasHeight}`
            : naturalSize
              ? `${naturalSize.w} / ${naturalSize.h}`
              : "16 / 10",
        }}
      >
        {imageUrl && (
          <img
            src={imageUrl}
            alt={label}
            style={imageStyle}
            onLoad={(e) => {
              const img = e.currentTarget;
              setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
            }}
          />
        )}
        {haveCanvas && (
          <div
            className="pointer-events-none absolute left-0 top-0 h-full w-full"
            aria-hidden="true"
          >
            {boxes.map((box, i) => (
              <BoxOverlay
                key={i}
                box={box}
                index={i}
                canvasWidth={canvasWidth!}
                canvasHeight={canvasHeight!}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BoxOverlay({
  box,
  index,
  canvasWidth,
  canvasHeight,
}: {
  box: DiffBox;
  index: number;
  canvasWidth: number;
  canvasHeight: number;
}) {
  const style = useMemo(
    () => ({
      left: `${(box.x / canvasWidth) * 100}%`,
      top: `${(box.y / canvasHeight) * 100}%`,
      width: `${(box.width / canvasWidth) * 100}%`,
      height: `${(box.height / canvasHeight) * 100}%`,
    }),
    [box, canvasWidth, canvasHeight],
  );

  // The label sits *outside* the box for tiny boxes (so it doesn't cover
  // the diff) and *inside* for big boxes (so it lands on the actual
  // changed region). 8% of the canvas height is roughly "two label
  // heights" - large enough that an internal badge isn't visually noisy.
  const labelInside = box.height > canvasHeight * 0.08 && box.width > canvasWidth * 0.04;

  return (
    <div
      // pointer-events-auto on the box itself so the title tooltip works,
      // even though the overlay layer above is pointer-events-none.
      className="pointer-events-auto absolute rounded-sm border-2 border-rose-500 bg-rose-500/10 ring-1 ring-white/70 transition-colors hover:bg-rose-500/25 dark:ring-black/40"
      style={style}
      title={`Region #${index + 1} — ${box.pixels.toLocaleString()} px (${box.width}×${box.height})`}
    >
      <span
        className={`absolute rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow ${
          labelInside ? "left-1 top-1" : "-left-px -top-5"
        }`}
      >
        #{index + 1}
      </span>
    </div>
  );
}

function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}
