import { useCallback, useEffect, useMemo } from "react";
import { useDropzone } from "react-dropzone";

type Props = {
  label: string;
  accentClass: string;
  file: File | null;
  onChange: (file: File | null) => void;
};

/**
 * A single dropzone tile that owns the URL lifecycle for its image. The
 * preview is rendered with `object-contain` so the user can see the full
 * image even if its aspect ratio is wildly different from the tile.
 */
export function ImageDropzone({ label, accentClass, file, onChange }: Props) {
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) onChange(accepted[0]);
    },
    [onChange],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"],
    },
    maxFiles: 1,
    multiple: false,
  });

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${accentClass}`} />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {label}
          </span>
        </div>
        {file && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Clear
          </button>
        )}
      </div>
      <div
        {...getRootProps({
          className: `relative flex flex-1 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed transition ${
            isDragActive
              ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20"
              : "border-gray-300 bg-white hover:border-brand-400 dark:border-gray-700 dark:bg-gray-900"
          }`,
        })}
      >
        <input {...getInputProps()} />
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={`${label} preview`}
            className="max-h-72 w-full rounded-lg object-contain p-2"
          />
        ) : (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Drop an image here
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              or click to choose a file
            </p>
            <p className="mt-3 text-[11px] uppercase tracking-wider text-gray-400">
              PNG · JPG · WEBP · BMP · GIF
            </p>
          </div>
        )}
      </div>
      {file && (
        <p className="mt-2 truncate text-xs text-gray-500 dark:text-gray-400">
          {file.name} · {(file.size / 1024).toFixed(0)} KB
        </p>
      )}
    </div>
  );
}
