/**
 * Synthetic image-pair generators used by the "Try a demo" buttons in the
 * UI. We generate via the browser's Canvas API rather than bundling PNG
 * fixtures so the bundle stays small and the test cases stay in one
 * readable file. Each pair is designed to exercise a different
 * failure mode the algorithm is supposed to handle well.
 */

export type SampleId =
  | "color-change"
  | "text-change"
  | "extra-element"
  | "missing-element"
  | "tiny-change";

export type SampleDef = {
  id: SampleId;
  label: string;
  description: string;
  draw: (g: CanvasRenderingContext2D, variant: "before" | "after") => void;
  width: number;
  height: number;
};

const samples: SampleDef[] = [
  {
    id: "color-change",
    label: "Color change",
    description: "A button is recoloured from blue to green.",
    width: 640,
    height: 360,
    draw(g, variant) {
      paintBackground(g);
      drawHeader(g, "Dashboard", "Welcome back");
      drawTile(g, 32, 110, "Revenue", "$12,480", "#0ea5e9");
      drawTile(g, 224, 110, "Signups", "1,204", "#a855f7");
      drawTile(g, 416, 110, "Churn", "1.2%", "#f59e0b");
      drawButton(g, 32, 268, "Refresh", variant === "before" ? "#2563eb" : "#16a34a");
    },
  },
  {
    id: "text-change",
    label: "Text change",
    description: "A value flips and a label changes by one character.",
    width: 640,
    height: 360,
    draw(g, variant) {
      paintBackground(g);
      drawHeader(
        g,
        variant === "before" ? "Analytics" : "Analytic",
        variant === "before" ? "Last 7 days" : "Last 30 days",
      );
      drawTile(g, 32, 110, "Revenue", variant === "before" ? "$12,480" : "$18,902", "#0ea5e9");
      drawTile(g, 224, 110, "Signups", "1,204", "#a855f7");
      drawTile(g, 416, 110, "Churn", "1.2%", "#f59e0b");
      drawButton(g, 32, 268, "Refresh", "#2563eb");
    },
  },
  {
    id: "extra-element",
    label: "Extra element",
    description: "A new badge appears in the after image.",
    width: 640,
    height: 360,
    draw(g, variant) {
      paintBackground(g);
      drawHeader(g, "Inbox", "3 conversations");
      drawTile(g, 32, 110, "Alice", "5 min ago", "#0ea5e9");
      drawTile(g, 224, 110, "Bob", "1 hour ago", "#a855f7");
      drawTile(g, 416, 110, "Carol", "yesterday", "#f59e0b");
      drawButton(g, 32, 268, "Compose", "#2563eb");
      if (variant === "after") {
        g.fillStyle = "#ef4444";
        g.beginPath();
        g.arc(196, 130, 12, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#ffffff";
        g.font = "600 12px Inter, system-ui";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("3", 196, 130);
      }
    },
  },
  {
    id: "missing-element",
    label: "Missing element",
    description: "The third tile is removed in the after image.",
    width: 640,
    height: 360,
    draw(g, variant) {
      paintBackground(g);
      drawHeader(g, "Reports", "Quarterly summary");
      drawTile(g, 32, 110, "Revenue", "$12,480", "#0ea5e9");
      drawTile(g, 224, 110, "Signups", "1,204", "#a855f7");
      if (variant === "before") {
        drawTile(g, 416, 110, "Churn", "1.2%", "#f59e0b");
      }
      drawButton(g, 32, 268, "Export PDF", "#2563eb");
    },
  },
  {
    id: "tiny-change",
    label: "Tiny 6×6 px change",
    description: "A single 6 px dot moves a few pixels - tests min-area filter.",
    width: 640,
    height: 360,
    draw(g, variant) {
      paintBackground(g);
      drawHeader(g, "Pixel test", "Spot the 6 px change");
      drawTile(g, 32, 110, "Revenue", "$12,480", "#0ea5e9");
      drawTile(g, 224, 110, "Signups", "1,204", "#a855f7");
      drawTile(g, 416, 110, "Churn", "1.2%", "#f59e0b");
      drawButton(g, 32, 268, "Continue", "#2563eb");
      // The tiny test artifact - 6 px dot near the bottom-right corner.
      g.fillStyle = "#dc2626";
      const dotX = variant === "before" ? 560 : 568;
      g.fillRect(dotX, 320, 6, 6);
    },
  },
];

function paintBackground(g: CanvasRenderingContext2D) {
  g.fillStyle = "#f9fafb";
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
}

function drawHeader(g: CanvasRenderingContext2D, title: string, subtitle: string) {
  g.fillStyle = "#111827";
  g.font = "700 26px Inter, system-ui";
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillText(title, 32, 52);
  g.fillStyle = "#6b7280";
  g.font = "500 14px Inter, system-ui";
  g.fillText(subtitle, 32, 78);
}

function drawTile(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  value: string,
  accent: string,
) {
  g.fillStyle = "#ffffff";
  roundedRect(g, x, y, 192, 130, 12);
  g.fill();

  g.fillStyle = accent;
  g.fillRect(x, y, 4, 130);

  g.fillStyle = "#6b7280";
  g.font = "500 13px Inter, system-ui";
  g.textAlign = "left";
  g.fillText(label, x + 18, y + 30);

  g.fillStyle = "#111827";
  g.font = "700 24px Inter, system-ui";
  g.fillText(value, x + 18, y + 70);

  g.strokeStyle = "#e5e7eb";
  g.lineWidth = 1;
  roundedRect(g, x + 0.5, y + 0.5, 191, 129, 12);
  g.stroke();
}

function drawButton(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string,
) {
  g.fillStyle = color;
  roundedRect(g, x, y, 140, 44, 10);
  g.fill();
  g.fillStyle = "#ffffff";
  g.font = "600 14px Inter, system-ui";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, x + 70, y + 22);
}

function roundedRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * Render one of the named samples to a `File` so the UI can drop it
 * straight into the existing dropzone state and the same diff path runs
 * whether the user uploaded the file or clicked the demo.
 */
export async function generateSample(
  id: SampleId,
  variant: "before" | "after",
): Promise<File> {
  const def = samples.find((s) => s.id === id);
  if (!def) throw new Error(`Unknown sample id: ${id}`);

  const canvas = document.createElement("canvas");
  canvas.width = def.width;
  canvas.height = def.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not acquire 2D context.");
  def.draw(ctx, variant);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
  return new File([blob], `${id}-${variant}.png`, { type: "image/png" });
}

export function listSamples(): SampleDef[] {
  return samples;
}
