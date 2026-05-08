import { useStore } from "../store";
import type { BRollPoint } from "../types";
import { formatEtaIt } from "../lib/utils";

interface Props {
  points: BRollPoint[];
}

export function ActiveDownloadsBanner({ points }: Props) {
  const downloads = useStore((s) => s.downloads);
  const active = points
    .map((p, i) => ({ point: p, idx: i }))
    .filter(({ point }) => point.status === "downloading");

  if (active.length === 0) return null;

  return (
    <div className="border-bee border-bee-ink bg-bee-yellow shadow-bee-2 px-4 py-2.5 mb-4">
      <div className="flex flex-col gap-1.5">
        {active.map(({ point, idx }) => {
          const dl = downloads[point.id];
          const percent = Math.round(dl?.percent ?? 0);
          return (
            <div key={point.id} className="flex items-center gap-3 text-[12px]">
              <span className="font-mono font-bold tracking-[0.4px] uppercase whitespace-nowrap text-bee-ink">
                #{idx + 1} download
              </span>
              <span className="flex-1 truncate font-medium text-bee-ink">
                {point.selected_video?.title ?? point.phrase}
              </span>
              <span className="font-mono font-bold tabular-nums whitespace-nowrap text-bee-ink">
                {percent > 0 ? `${percent}%` : "avvio…"}
                {dl?.eta_sec != null && percent > 0
                  ? ` · ETA ${formatEtaIt(dl.eta_sec)}`
                  : ""}
              </span>
              <div className="w-24 h-1.5 bg-white border border-bee-ink overflow-hidden">
                <div
                  className="h-full bg-bee-ink transition-[width] duration-300"
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
