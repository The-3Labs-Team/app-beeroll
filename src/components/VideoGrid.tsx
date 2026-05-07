import type { VideoCandidate } from "../types";
import { HoverStoryboard } from "./HoverStoryboard";

interface Props {
  results: VideoCandidate[];
  selectedId: string | null;
  onSelect: (c: VideoCandidate) => void;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoGrid({ results, selectedId, onSelect }: Props) {
  if (results.length === 0) {
    return <p className="text-muted-foreground p-8">No results. Try a different keyword.</p>;
  }
  return (
    <div className="grid grid-cols-3 gap-3 p-4 overflow-y-auto">
      {results.map((r, i) => {
        const selected = selectedId === r.video_id;
        return (
          <button
            key={r.video_id}
            onClick={() => onSelect(r)}
            className={`text-left rounded-lg border-2 transition ${selected ? "border-primary" : "border-transparent hover:border-border"}`}
          >
            <div className="relative">
              <HoverStoryboard videoId={r.video_id} durationSec={r.duration_sec} />
              <span className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                {formatDuration(r.duration_sec)}
              </span>
              <span className="absolute top-1 left-1 bg-black/80 text-white text-xs w-6 h-6 rounded flex items-center justify-center">
                {i + 1}
              </span>
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
