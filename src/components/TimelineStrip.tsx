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
  paused: "paused",
  done: "done",
  skipped: "skipped",
  error: "error",
};

const STATUS_BG: Record<BRollPoint["status"], string> = {
  pending: "bg-muted text-muted-foreground",
  searching: "bg-muted text-muted-foreground",
  picking: "bg-muted text-muted-foreground",
  downloading: "bg-amber-500 text-white",
  paused: "bg-sky-500 text-white",
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

/**
 * Circular progress indicator. Renders a spinning indeterminate arc when
 * `percent` is null (yt-dlp hasn't reported the first `[download]` line yet),
 * and a determinate ring that fills up from 0 → 100% otherwise.
 */
function ProgressRing({ percent }: { percent: number | null }) {
  if (percent == null) {
    return (
      <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M12 2 a 10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  const r = 10;
  const circ = 2 * Math.PI * r;
  const dash = (percent / 100) * circ;
  return (
    <svg className="h-5 w-5 -rotate-90" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r={r} stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <circle
        cx="12"
        cy="12"
        r={r}
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        style={{ transition: "stroke-dasharray 200ms linear" }}
      />
    </svg>
  );
}

export function TimelineStrip({ points, currentIndex, onJump }: Props) {
  const downloads = useStore((s) => s.downloads);

  return (
    <div className="flex items-center gap-1.5 px-6 py-3 border-t border-border bg-background overflow-x-auto">
      {points.map((p, i) => {
        const isCurrent = i === currentIndex;
        const dl = downloads[p.id];
        const rawPercent = dl?.percent ?? 0;
        // Only show a determinate ring once yt-dlp has reported a non-zero
        // percent; otherwise spin indeterminately so the user sees that
        // *something* is happening (DNS resolution, format negotiation, etc).
        const percent = p.status === "downloading"
          ? (rawPercent > 0 ? Math.round(rawPercent) : null)
          : null;

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
        if (p.status === "downloading") content = <ProgressRing percent={percent} />;
        else if (p.status === "paused") content = "⏸";
        else if (p.status === "done") content = "✓";
        else if (p.status === "skipped") content = "×";
        else if (p.status === "error") content = "!";

        return (
          <button
            key={p.id}
            onClick={() => onJump(i)}
            title={tooltipLines.join("\n")}
            className={`relative h-9 min-w-9 px-1 rounded text-[11px] font-semibold tabular-nums transition flex items-center justify-center ${STATUS_BG[p.status]} ${isCurrent ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "hover:opacity-90"}`}
          >
            {content}
          </button>
        );
      })}
      <span className="ml-3 text-xs text-muted-foreground whitespace-nowrap">
        {currentIndex + 1}/{points.length}
      </span>
    </div>
  );
}
