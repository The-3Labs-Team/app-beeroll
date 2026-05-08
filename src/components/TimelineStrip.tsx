import type { BRollPoint } from "../types";
import { useStore } from "../store";

interface Props {
  points: BRollPoint[];
  currentIndex: number;
  onJump: (i: number) => void;
}

const STATUS_LABEL: Record<BRollPoint["status"], string> = {
  pending: "pending",
  searching: "searching",
  picking: "picking",
  downloading: "downloading",
  done: "done",
  skipped: "skipped",
  error: "error",
};

const STATUS_BG: Record<BRollPoint["status"], string> = {
  pending: "bg-muted text-muted-foreground",
  searching: "bg-muted text-muted-foreground",
  picking: "bg-muted text-muted-foreground",
  downloading: "bg-amber-500 text-white",
  done: "bg-emerald-600 text-white",
  skipped: "bg-zinc-400 text-white",
  error: "bg-red-600 text-white",
};

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

export function TimelineStrip({ points, currentIndex, onJump }: Props) {
  const downloads = useStore((s) => s.downloads);

  return (
    <div className="flex items-center gap-1.5 px-6 py-3 border-t border-border bg-background overflow-x-auto">
      {points.map((p, i) => {
        const isCurrent = i === currentIndex;
        const dl = downloads[p.id];
        const percent = p.status === "downloading" ? Math.round(dl?.percent ?? 0) : null;

        const tooltipLines = [
          `#${i + 1}: "${p.phrase}"`,
          `status: ${STATUS_LABEL[p.status]}`,
        ];
        if (p.status === "downloading" && dl) {
          tooltipLines.push(
            `${Math.round(dl.percent)}%${dl.eta_sec != null ? ` · ETA ${formatEta(dl.eta_sec)}` : ""}`
          );
        }
        if (p.selected_video) tooltipLines.push(`→ ${p.selected_video.title}`);

        let content: React.ReactNode = i + 1;
        if (p.status === "downloading") content = percent != null ? `${percent}%` : "…";
        else if (p.status === "done") content = "✓";
        else if (p.status === "skipped") content = "×";
        else if (p.status === "error") content = "!";

        return (
          <button
            key={p.id}
            onClick={() => onJump(i)}
            title={tooltipLines.join("\n")}
            className={`relative h-9 min-w-9 px-1.5 rounded text-[11px] font-semibold tabular-nums transition ${STATUS_BG[p.status]} ${isCurrent ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "hover:opacity-90"} ${p.status === "downloading" ? "animate-pulse" : ""}`}
          >
            {content}
            {p.status === "downloading" && percent != null && (
              <span
                className="absolute left-0 bottom-0 h-0.5 bg-white/90 rounded-bl"
                style={{ width: `${percent}%` }}
              />
            )}
          </button>
        );
      })}
      <span className="ml-3 text-xs text-muted-foreground whitespace-nowrap">
        {currentIndex + 1}/{points.length}
      </span>
    </div>
  );
}
