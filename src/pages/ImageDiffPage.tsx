import { useCallback, useState } from "react";

import PageMeta from "../components/common/PageMeta";
import { DiffViewer } from "../components/DiffViewer";
import { EngineToggle } from "../components/EngineToggle";
import { ImageDropzone } from "../components/ImageDropzone";
import { SampleGallery } from "../components/SampleGallery";
import { SensitivityControl } from "../components/SensitivityControl";
import { StatsBar } from "../components/StatsBar";
import { ThemeToggle } from "../components/ThemeToggle";
import type { Engine } from "../hooks/useImageDiff";
import { useImageDiff } from "../hooks/useImageDiff";

export function ImageDiffPage() {
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [sensitivity, setSensitivity] = useState(60);
  const [engine, setEngine] = useState<Engine>("client");
  const [ignoreAntialiasing, setIgnoreAntialiasing] = useState(true);

  const { result, loading, error } = useImageDiff(
    beforeFile,
    afterFile,
    sensitivity,
    engine,
    ignoreAntialiasing,
  );

  const handleSwap = useCallback(() => {
    setBeforeFile(afterFile);
    setAfterFile(beforeFile);
  }, [beforeFile, afterFile]);

  const handleClear = useCallback(() => {
    setBeforeFile(null);
    setAfterFile(null);
  }, []);

  const handleLoadSample = useCallback((before: File, after: File) => {
    setBeforeFile(before);
    setAfterFile(after);
  }, []);

  const canActOnPair = Boolean(beforeFile && afterFile);

  return (
    <div className="min-h-full">
      <PageMeta
        title="Image Diff Inspector"
        description="Compare two images and highlight visual differences automatically."
      />

      <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-white">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Image Diff Inspector
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Spot visual changes between two images, fast.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <EngineToggle engine={engine} onChange={setEngine} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <SampleGallery onLoad={handleLoadSample} />

        <section className="grid gap-4 md:grid-cols-2">
          <ImageDropzone
            label="Before"
            accentClass="bg-sky-500"
            file={beforeFile}
            onChange={setBeforeFile}
          />
          <ImageDropzone
            label="After"
            accentClass="bg-emerald-500"
            file={afterFile}
            onChange={setAfterFile}
          />
        </section>

        <section className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSwap}
            disabled={!canActOnPair}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-brand-700 dark:hover:bg-brand-900/30 dark:hover:text-brand-200"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m7 16 10-10" />
              <path d="M7 6h10v10" />
              <path d="m17 8-10 10" />
              <path d="M17 18H7V8" />
            </svg>
            Swap before ↔ after
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={!beforeFile && !afterFile}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-rose-700 dark:hover:bg-rose-900/30 dark:hover:text-rose-200"
          >
            Clear both
          </button>
          <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={ignoreAntialiasing}
              onChange={(e) => setIgnoreAntialiasing(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
            />
            <span>Ignore anti-aliasing</span>
          </label>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          <SensitivityControl value={sensitivity} onChange={setSensitivity} />
          <StatsBar result={result} loading={loading} error={error} />
        </section>

        <section>
          <DiffViewer
            beforeFile={beforeFile}
            afterFile={afterFile}
            result={result}
            loading={loading}
          />
        </section>
      </main>
    </div>
  );
}
