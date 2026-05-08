import type { BRollPoint } from "../types";
import { useStore } from "../store";

interface Props {
  points: BRollPoint[];
  currentIndex: number;
  onJump: (i: number) => void;
}

const STATUS_LABEL: Record<BRollPoint["status"], string> = {
  pending: "in attesa",
  searching: "ricerca",
  picking: "selezione",
  downloading: "download",
  paused: "in pausa",
  done: "pronto",
  skipped: "saltato",
  error: "errore",
};

function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

const padded = (n: number) => String(n).padStart(2, "0");

/**
 * Circular progress indicator. Renders a spinning indeterminate arc when
 * `percent` is null (yt-dlp hasn't reported the first `[download]` line yet),
 * and a determinate ring that fills up from 0 → 100% otherwise.
 */
function ProgressRing({ percent }: { percent: number | null }) {
  if (percent == null) {
    return (
      <svg
        className="h-[18px] w-[18px] animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path
          d="M12 2 a 10 10 0 0 1 10 10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  const r = 10;
  const circ = 2 * Math.PI * r;
  const dash = (percent / 100) * circ;
  return (
    <svg
      className="h-[18px] w-[18px] -rotate-90"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
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
    <div className="flex-shrink-0 border-t-bee border-bee-ink py-2.5 px-[22px] flex items-center gap-1.5 bg-white overflow-x-auto bee-scroll">
      {points.map((p, i) => {
        const isCurrent = i === currentIndex;
        const dl = downloads[p.id];
        const rawPercent = dl?.percent ?? 0;
        const percent =
          p.status === "downloading"
            ? rawPercent > 0
              ? Math.round(rawPercent)
              : null
            : null;

        const tooltipLines = [
          `#${i + 1}: "${p.phrase}"`,
          `stato: ${STATUS_LABEL[p.status]}`,
        ];
        if (p.status === "downloading" && dl) {
          tooltipLines.push(
            `${Math.round(dl.percent)}%${
              dl.eta_sec != null ? ` · ETA ${formatEta(dl.eta_sec)}` : ""
            }`,
          );
        }
        if (p.selected_video) tooltipLines.push(`→ ${p.selected_video.title}`);

        let content: React.ReactNode = i + 1;
        if (p.status === "downloading") content = <ProgressRing percent={percent} />;
        else if (p.status === "paused") content = "⏸";
        else if (p.status === "done") {
          content = (
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 7.5l3 3 5-6" />
            </svg>
          );
        } else if (p.status === "skipped") content = "✕";
        else if (p.status === "error") content = "!";

        let stateClass =
          "border-2 border-bee-ink bg-white text-bee-ink hover:bg-bee-yellow";
        if (p.status === "done")
          stateClass = "border-2 border-bee-ink bg-bee-yellow text-bee-ink";
        else if (p.status === "downloading")
          stateClass = "border-2 border-bee-ink bg-bee-yellow text-bee-ink";

        const currentClass = isCurrent
          ? "shadow-bee-1 -translate-x-[1px] -translate-y-[1px] bg-bee-yellow"
          : "";

        return (
          <button
            key={p.id}
            onClick={() => onJump(i)}
            title={tooltipLines.join("\n")}
            className={`relative w-[34px] h-[34px] font-mono text-[12px] font-bold flex-shrink-0 inline-flex items-center justify-center transition-[background,transform,box-shadow] duration-75 cursor-pointer ${stateClass} ${currentClass}`}
          >
            {content}
          </button>
        );
      })}
      <span className="ml-auto font-mono text-[11px] font-bold tracking-[0.5px] uppercase text-bee-mute whitespace-nowrap flex-shrink-0">
        {padded(currentIndex + 1)}/{padded(points.length)}
      </span>
    </div>
  );
}
