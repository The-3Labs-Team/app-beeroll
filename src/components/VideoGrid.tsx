import type { VideoCandidate, BRollStatus } from "../types";
import { useStore } from "../store";
import { formatDuration } from "../lib/utils";

interface Props {
  results: VideoCandidate[];
  selectedId: string | null;
  pickedVideoId?: string | null;
  pickedStatus?: BRollStatus | null;
  pickedPointId?: string | null;
  onSelect: (c: VideoCandidate) => void;
  disabled?: boolean;
}

export function VideoGrid({
  results,
  selectedId,
  pickedVideoId,
  pickedStatus,
  pickedPointId,
  onSelect,
  disabled,
}: Props) {
  const downloads = useStore((s) => s.downloads);
  const dl = pickedPointId ? downloads[pickedPointId] : undefined;
  const downloadPercent =
    pickedStatus === "downloading" ? Math.round(dl?.percent ?? 0) : null;

  if (results.length === 0) {
    return (
      <p className="font-mono text-[12px] font-bold uppercase tracking-[0.4px] text-bee-mute p-8">
        Nessun risultato. Cambia keyword.
      </p>
    );
  }

  return (
    <div
      className={`grid grid-cols-3 gap-3.5 mt-2 ${
        disabled ? "pointer-events-none opacity-60" : ""
      }`}
    >
      {results.map((r, i) => {
        const selected = selectedId === r.video_id;
        const picked = pickedVideoId === r.video_id;

        // Border / shadow logic — yellow shadow for selection / done; otherwise default
        let stateClass = "";
        if (selected) {
          stateClass = "shadow-bee-y-strong -translate-x-[2px] -translate-y-[2px]";
        } else if (picked) {
          if (pickedStatus === "downloading") {
            stateClass = "shadow-bee-y-strong -translate-x-[2px] -translate-y-[2px]";
          } else if (pickedStatus === "done") {
            stateClass = "shadow-bee-y-strong -translate-x-[2px] -translate-y-[2px]";
          } else if (pickedStatus === "error") {
            stateClass = "border-red-700";
          }
        }

        const thumbUrl = `https://i.ytimg.com/vi/${r.video_id}/mqdefault.jpg`;

        return (
          <button
            key={r.video_id}
            onClick={() => {
              if (!disabled) onSelect(r);
            }}
            disabled={disabled}
            className={`text-left border-bee border-bee-ink bg-white cursor-pointer flex flex-col transition-[transform,box-shadow] duration-75 hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-bee-2 ${stateClass}`}
          >
            <div
              className="aspect-video border-b-bee border-bee-ink relative overflow-hidden flex items-end p-2 text-white bg-bee-ink"
              style={{
                backgroundImage: `url(${thumbUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <span className="absolute top-1.5 left-1.5 w-[26px] h-[26px] bg-bee-ink text-bee-yellow font-mono text-[13px] font-bold flex items-center justify-center border-2 border-bee-yellow">
                {i + 1}
              </span>
              <span className="absolute bottom-1.5 right-1.5 bg-bee-ink text-white font-mono text-[11px] font-bold px-1.5 py-0.5 tracking-[0.3px]">
                {formatDuration(r.duration_sec)}
              </span>

              {/* Downloading overlay */}
              {picked && pickedStatus === "downloading" && (
                <div className="absolute inset-0 bg-bee-yellow/85 flex flex-col items-center justify-center gap-2 px-4 pointer-events-none">
                  <span className="font-mono text-[14px] font-bold text-bee-ink tracking-[0.4px]">
                    DOWNLOAD{" "}
                    {downloadPercent != null && downloadPercent > 0
                      ? `${downloadPercent}%`
                      : "…"}
                  </span>
                  <div className="w-3/4 h-1.5 bg-white border border-bee-ink overflow-hidden">
                    <div
                      className="h-full bg-bee-ink transition-[width] duration-300"
                      style={{ width: `${downloadPercent ?? 0}%` }}
                    />
                  </div>
                </div>
              )}
              {/* Done badge */}
              {picked && pickedStatus === "done" && (
                <span className="absolute top-1.5 right-1.5 bg-bee-ink text-bee-yellow font-mono text-[12px] font-bold px-2 py-0.5 border-2 border-bee-yellow">
                  ✓
                </span>
              )}
            </div>
            <div className="px-3 py-2.5 flex flex-col gap-1">
              <p className="text-[13px] font-semibold leading-[1.3] line-clamp-2 m-0">
                {r.title}
              </p>
              <p className="font-mono text-[10.5px] font-bold tracking-[0.4px] uppercase text-bee-mute m-0 truncate">
                {r.channel}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
