import type { DiffResult } from "../lib/diff/types";

type Props = {
  result: DiffResult | null;
  loading: boolean;
};

/**
 * Read-out for the algorithm's performance. The duration is the headline
 * because the assignment specifically asks for processing time in
 * milliseconds.
 *
 * Errors are rendered separately by `ErrorBanner` so they're impossible
 * to miss; this component only shows informational banners (dimension
 * mismatch, internal downsampling).
 */
export function StatsBar({ result, loading }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat
        label="Processing time"
        value={
          loading
            ? "…"
            : result
              ? `${result.durationMs.toFixed(1)} ms`
              : "—"
        }
        highlight
      />
      <Stat
        label="Regions"
        value={loading ? "…" : result ? String(result.boxes.length) : "—"}
      />
      <Stat
        label="Changed pixels"
        value={
          loading
            ? "…"
            : result
              ? result.changedPixels.toLocaleString()
              : "—"
        }
      />
      <Stat
        label="Engine"
        value={
          result
            ? result.ranOnClient
              ? "Browser (worker)"
              : "Server (NestJS)"
            : "—"
        }
      />
      {result?.dimensionMismatch && (
        <div className="col-span-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 sm:col-span-4">
          Heads up: the two images have different dimensions. The smaller one was
          padded with transparency, so the extra area on the larger image will be
          flagged as a difference.
        </div>
      )}
      {result && result.scale < 1 && (
        <div className="col-span-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-900/30 dark:text-sky-200 sm:col-span-4">
          Image was very large, so the browser engine ran the diff at{" "}
          <span className="font-semibold">{(result.scale * 100).toFixed(0)}%</span>{" "}
          scale for speed. Boxes are projected back to the original coordinate
          system. Switch to the <span className="font-semibold">Server</span>{" "}
          engine for full-resolution analysis.
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        highlight
          ? "border-brand-200 bg-brand-50 dark:border-brand-700/60 dark:bg-brand-900/30"
          : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
      }`}
    >
      <div className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div
        className={`mt-1 text-lg font-semibold ${
          highlight
            ? "text-brand-700 dark:text-brand-200"
            : "text-gray-900 dark:text-gray-100"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
