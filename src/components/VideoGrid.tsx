import type { VideoCandidate, BRollStatus } from "../types";
import { HoverStoryboard } from "./HoverStoryboard";
import { useStore } from "../store";

interface Props {
  results: VideoCandidate[];
  selectedId: string | null;
  pickedVideoId?: string | null;
  pickedStatus?: BRollStatus | null;
  pickedPointId?: string | null;
  onSelect: (c: VideoCandidate) => void;
  disabled?: boolean;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoGrid({ results, selectedId, pickedVideoId, pickedStatus, pickedPointId, onSelect, disabled }: Props) {
  const downloads = useStore((s) => s.downloads);
  const dl = pickedPointId ? downloads[pickedPointId] : undefined;
  const downloadPercent = pickedStatus === "downloading" ? Math.round(dl?.percent ?? 0) : null;

  if (results.length === 0) {
    return <p className="text-muted-foreground p-8">No results. Try a different keyword.</p>;
  }
  return (
    <div className={`grid grid-cols-3 gap-3 p-4 overflow-y-auto ${disabled ? "pointer-events-none opacity-50" : ""}`}>
      {results.map((r, i) => {
        const selected = selectedId === r.video_id;
        const picked = pickedVideoId === r.video_id;
        let borderClass = selected ? "border-primary" : "border-transparent hover:border-border";
        if (picked) {
          if (pickedStatus === "downloading") borderClass = "border-amber-500";
          else if (pickedStatus === "done") borderClass = "border-emerald-600";
          else if (pickedStatus === "error") borderClass = "border-red-600";
          else if (pickedStatus === "skipped") borderClass = "border-zinc-400";
        }

        return (
          <button
            key={r.video_id}
            onClick={() => { if (!disabled) onSelect(r); }}
            disabled={disabled}
            className={`text-left rounded-lg border-2 transition relative ${borderClass}`}
          >
            <div className="relative">
              <HoverStoryboard videoId={r.video_id} durationSec={r.duration_sec} />
              <span className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                {formatDuration(r.duration_sec)}
              </span>
              <span className="absolute top-1 left-1 bg-black/80 text-white text-xs w-6 h-6 rounded flex items-center justify-center">
                {i + 1}
              </span>
              {picked && pickedStatus === "downloading" && (
                <div className="absolute inset-0 bg-amber-500/30 flex items-center justify-center">
                  <span className="bg-amber-500 text-white text-sm font-bold px-3 py-1.5 rounded">
                    DOWNLOADING {downloadPercent != null && downloadPercent > 0 ? `${downloadPercent}%` : "…"}
                  </span>
                </div>
              )}
              {picked && pickedStatus === "done" && (
                <div className="absolute top-1 right-1 bg-emerald-600 text-white text-xs font-bold px-2 py-1 rounded">
                  ✓ DONE
                </div>
              )}
            </div>
            <div className="p-2">
              <p className="text-sm font-medium line-clamp-2">{r.title}</p>
              <p className="text-xs text-muted-foreground truncate">{r.channel}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
