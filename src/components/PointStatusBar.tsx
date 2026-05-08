import type { BRollPoint, DownloadProgressEvent } from "../types";

interface Props {
  point: BRollPoint;
  download: DownloadProgressEvent | undefined;
}

function formatEta(sec: number | null | undefined): string {
  if (sec == null) return "";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function PointStatusBar({ point, download }: Props) {
  if (point.status === "pending" || point.status === "searching" || point.status === "picking") {
    return null;
  }

  if (point.status === "downloading") {
    const percent = Math.round(download?.percent ?? 0);
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-3 w-3 rounded-full bg-amber-500 animate-pulse" />
          <span className="font-semibold text-amber-900">Downloading this point…</span>
          <span className="flex-1 truncate text-sm text-amber-800">
            {point.selected_video?.title ?? ""}
          </span>
          <span className="font-mono tabular-nums text-sm text-amber-900 whitespace-nowrap">
            {percent > 0 ? `${percent}%` : "starting…"}
            {download?.eta_sec != null && percent > 0 ? ` · ETA ${formatEta(download.eta_sec)}` : ""}
          </span>
        </div>
        <div className="mt-2 h-1.5 bg-amber-200 rounded overflow-hidden">
          <div
            className="h-full bg-amber-500 transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }

  if (point.status === "done") {
    return (
      <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">✓</span>
          <span className="font-semibold text-emerald-900">Clip ready for this point</span>
          <span className="flex-1 truncate text-sm text-emerald-800">
            {point.selected_video?.title} · © {point.selected_video?.channel}
          </span>
          {point.output_clip && (
            <code className="text-xs text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
              {point.output_clip}
            </code>
          )}
        </div>
        <p className="mt-1 text-xs text-emerald-700">Click another video below to replace.</p>
      </div>
    );
  }

  if (point.status === "skipped") {
    return (
      <div className="bg-zinc-100 border-b border-zinc-200 px-6 py-3 flex items-center gap-3">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-500 text-white text-xs font-bold">×</span>
        <span className="font-semibold text-zinc-700">Skipped</span>
        <span className="text-sm text-zinc-600">Pick a video below to use this point.</span>
      </div>
    );
  }

  if (point.status === "error") {
    return (
      <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-center gap-3">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white text-xs font-bold">!</span>
        <span className="font-semibold text-red-900">Download failed</span>
        <span className="flex-1 text-sm text-red-800">Try selecting another video.</span>
      </div>
    );
  }

  return null;
}
