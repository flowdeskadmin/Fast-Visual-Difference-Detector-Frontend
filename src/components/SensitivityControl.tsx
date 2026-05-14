import type { CSSProperties } from "react";

type Props = {
  value: number;
  onChange: (value: number) => void;
};

/**
 * 0..100 slider with anchor labels so the user understands what the
 * extremes do. The CSS variable `--slider-progress` paints the filled
 * portion of the track in the browser's native slider so the gradient
 * tracks the value smoothly.
 */
export function SensitivityControl({ value, onChange }: Props) {
  const style = { "--slider-progress": `${value}%` } as CSSProperties;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between">
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          Sensitivity
        </label>
        <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider-track"
        style={style}
      />
      <div className="mt-2 flex justify-between text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
        <span>Only obvious changes</span>
        <span>Catch tiny changes</span>
      </div>
    </div>
  );
}
