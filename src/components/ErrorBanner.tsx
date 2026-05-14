import type { Engine } from "../hooks/useImageDiff";

type Props = {
  error: string;
  engine: Engine;
  onSwitchToBrowser: () => void;
};

/**
 * Top-of-page banner for diff failures. We bubble this out of the stats
 * grid because errors tend to drown in there - especially the 4.5 MB
 * Vercel-edge rejection that hits the Server engine on big uploads.
 *
 * When the failing engine is the server, we offer a one-click switch to
 * the Browser engine since it's not affected by any of the typical
 * server-side failure modes (body limits, CORS, function timeouts).
 */
export function ErrorBanner({ error, engine, onSwitchToBrowser }: Props) {
  const isServerError = engine === "server";

  return (
    <div
      role="alert"
      className="rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-sm dark:border-rose-800/60 dark:bg-rose-900/30"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-rose-900 dark:text-rose-100">
            Diff failed
          </div>
          <p className="mt-1 break-words text-sm text-rose-800 dark:text-rose-200">
            {error}
          </p>
          {isServerError && (
            <button
              type="button"
              onClick={onSwitchToBrowser}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12a9 9 0 1 0 9-9" />
                <path d="M3 4v5h5" />
              </svg>
              Switch to Browser engine
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
