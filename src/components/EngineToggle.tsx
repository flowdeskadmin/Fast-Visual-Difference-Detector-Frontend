import type { Engine } from "../hooks/useImageDiff";

type Props = {
  engine: Engine;
  onChange: (engine: Engine) => void;
};

/**
 * Pill toggle between the in-browser Web Worker and the NestJS backend.
 * Both paths use the same algorithm so swapping is a no-op for accuracy;
 * what changes is the time vs. memory tradeoff.
 */
export function EngineToggle({ engine, onChange }: Props) {
  return (
    <div className="inline-flex items-center rounded-lg border border-gray-200 bg-white p-1 text-sm dark:border-gray-800 dark:bg-gray-900">
      <Pill active={engine === "client"} onClick={() => onChange("client")}>
        Browser
      </Pill>
      <Pill active={engine === "server"} onClick={() => onChange("server")}>
        Server
      </Pill>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "bg-brand-500 text-white shadow"
          : "text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
