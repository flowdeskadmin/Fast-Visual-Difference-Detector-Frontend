import { useState } from "react";

import { generateSample, listSamples, type SampleId } from "../lib/samples";

type Props = {
  onLoad: (before: File, after: File) => void;
};

/**
 * Compact row of "try a demo" pills that synthesize a before/after pair
 * inline (no network round-trip, no bundled assets) and hand them off to
 * the page state. Useful for reviewers who want to evaluate the diff
 * without having to find their own test screenshots.
 */
export function SampleGallery({ onLoad }: Props) {
  const [loadingId, setLoadingId] = useState<SampleId | null>(null);
  const samples = listSamples();

  const handle = async (id: SampleId) => {
    try {
      setLoadingId(id);
      const [before, after] = await Promise.all([
        generateSample(id, "before"),
        generateSample(id, "after"),
      ]);
      onLoad(before, after);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Try a demo pair
        </span>
        <span className="text-[11px] text-gray-400">generated in your browser</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {samples.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => handle(s.id)}
            disabled={loadingId === s.id}
            title={s.description}
            className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-brand-700 dark:hover:bg-brand-900/30 dark:hover:text-brand-200"
          >
            {loadingId === s.id ? "Generating…" : s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
