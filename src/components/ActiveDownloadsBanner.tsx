import { useStore } from "../store";
import type { BRollPoint } from "../types";

interface Props {
  points: BRollPoint[];
}

function formatEta(sec: number | null | undefined): string {
  if (sec == null) return "";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function ActiveDownloadsBanner({ points }: Props) {
  const downloads = useStore((s) => s.downloads);
  const active = points
    .map((p, i) => ({ point: p, idx: i }))
    .filter(({ point }) => point.status === "downloading");

  if (active.length === 0) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 sticky top-0 z-10">
      <div className="flex flex-col gap-1">
        {active.map(({ point, idx }) => {
          const dl = downloads[point.id];
          const percent = Math.round(dl?.percent ?? 0);
          return (
            <div key={point.id} className="flex items-center gap-3 text-xs">
              <span className="font-semibold text-amber-900 whitespace-nowrap">
                #{idx + 1} downloading
              </span>
              <span className="flex-1 truncate text-amber-800">
                {point.selected_video?.title ?? point.phrase}
              </span>
              <span className="font-mono tabular-nums text-amber-900 whitespace-nowrap">
                {percent > 0 ? `${percent}%` : "starting…"}
                {dl?.eta_sec != null && percent > 0 ? ` · ETA ${formatEta(dl.eta_sec)}` : ""}
              </span>
              <div className="w-24 h-1.5 bg-amber-200 rounded overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-[width] duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
