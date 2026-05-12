import type { BRollPoint, DownloadProgressEvent } from "../types";
import { formatEtaIt } from "../lib/utils";

interface Props {
  point: BRollPoint;
  download: DownloadProgressEvent | undefined;
}

export function PointStatusBar({ point, download }: Props) {
  if (point.status === "pending" || point.status === "searching" || point.status === "picking") {
    return null;
  }

  if (point.status === "downloading") {
    const percent = Math.round(download?.percent ?? 0);
    return (
      <div className="flex-shrink-0 mx-[22px] mt-3.5 mb-1 border-bee border-bee-ink bg-bee-yellow shadow-bee-3 px-4 py-3 flex items-center gap-3.5 flex-wrap animate-pulse">
        <div className="w-7 h-7 flex-shrink-0 bg-bee-ink text-bee-yellow flex items-center justify-center font-bold">
          ↓
        </div>
        <div className="text-[14px] font-bold tracking-[-0.2px]">
          Download {percent > 0 ? `${percent}%` : "in avvio"}
        </div>
        <div className="flex-1 truncate text-[13px] font-medium min-w-[140px]">
          {point.selected_video?.title ?? ""}
        </div>
        <div className="font-mono text-[11px] font-bold tracking-[0.4px] uppercase whitespace-nowrap">
          {percent > 0 && download?.eta_sec != null ? `ETA ${formatEtaIt(download.eta_sec)}` : ""}
        </div>
        <div className="flex-basis-full w-full mt-1 h-1.5 bg-white border border-bee-ink overflow-hidden">
          <div
            className="h-full bg-bee-ink transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }

  if (point.status === "processing") {
    return (
      <div className="flex-shrink-0 mx-[22px] mt-3.5 mb-1 border-bee border-bee-ink bg-bee-yellow shadow-bee-3 px-4 py-3 flex items-center gap-3.5 flex-wrap animate-pulse">
        <div className="w-7 h-7 flex-shrink-0 bg-bee-ink text-bee-yellow flex items-center justify-center font-bold">
          ⚙
        </div>
        <div className="text-[14px] font-bold tracking-[-0.2px]">
          Elaborazione video…
        </div>
        <div className="flex-1 truncate text-[13px] font-medium min-w-[140px]">
          {point.selected_video?.title ?? ""}
        </div>
        <div className="font-mono text-[11px] font-bold tracking-[0.4px] uppercase whitespace-nowrap">
          Overlay copyright
        </div>
        <div className="flex-basis-full w-full mt-1 h-1.5 bg-white border border-bee-ink overflow-hidden">
          <div className="h-full bg-bee-ink w-full animate-pulse" />
        </div>
      </div>
    );
  }

  if (point.status === "paused") {
    const percent = Math.round(download?.percent ?? 0);
    return (
      <div className="flex-shrink-0 mx-[22px] mt-3.5 mb-1 border-bee border-bee-ink bg-white shadow-bee-2 px-4 py-3 flex items-center gap-3.5 flex-wrap">
        <div className="w-7 h-7 flex-shrink-0 bg-bee-ink text-bee-yellow flex items-center justify-center font-bold">
          ⏸
        </div>
        <div className="text-[14px] font-bold tracking-[-0.2px]">In pausa</div>
        <div className="flex-1 truncate text-[13px] font-medium min-w-[140px]">
          {point.selected_video?.title ?? ""}
        </div>
        <div className="font-mono text-[11px] font-bold tracking-[0.4px] uppercase whitespace-nowrap">
          {percent > 0 ? `${percent}%` : ""}
        </div>
        <div className="flex-basis-full w-full font-mono text-[11px] font-bold tracking-[0.5px] uppercase mt-1">
          ↳ Clicca "Riprendi" per continuare o "Stop" per annullare.
        </div>
      </div>
    );
  }

  if (point.status === "done") {
    const filename = point.output_clip?.split("/").pop() ?? point.output_clip ?? "";
    return (
      <div className="flex-shrink-0 mx-[22px] mt-3.5 mb-1 border-bee border-bee-ink bg-bee-yellow shadow-bee-3 px-4 py-3 flex items-center gap-3.5 flex-wrap">
        <div className="w-7 h-7 flex-shrink-0 bg-bee-ink text-bee-yellow flex items-center justify-center">
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
        </div>
        <div className="text-[14px] font-bold tracking-[-0.2px]">
          Clip pronta per questo punto
        </div>
        <div className="text-[13px] font-medium truncate min-w-[140px]">
          · {point.selected_video?.title}
        </div>
        {filename && (
          <div className="font-mono text-[11px] font-bold bg-bee-ink text-bee-yellow px-2 py-1 tracking-[0.2px] truncate max-w-full">
            {filename}
          </div>
        )}
        <div className="basis-full font-mono text-[11px] font-bold tracking-[0.5px] uppercase mt-1">
          ↳ Clicca un altro video qui sotto per sostituire.
        </div>
      </div>
    );
  }

  if (point.status === "skipped") {
    return (
      <div className="flex-shrink-0 mx-[22px] mt-3.5 mb-1 border-bee border-bee-ink bg-bee-soft px-4 py-3 flex items-center gap-3.5 flex-wrap">
        <div className="w-7 h-7 flex-shrink-0 bg-bee-ink text-bee-yellow flex items-center justify-center font-bold">
          ✕
        </div>
        <div className="text-[14px] font-bold tracking-[-0.2px]">Saltato</div>
        <div className="text-[13px] font-medium">
          Scegli un video qui sotto per usare questo punto.
        </div>
      </div>
    );
  }

  if (point.status === "error") {
    return (
      <div
        className="flex-shrink-0 mx-[22px] mt-3.5 mb-1 border-bee bg-white shadow-bee-2 px-4 py-3 flex items-center gap-3.5 flex-wrap"
        style={{ borderColor: "#7f1d1d" }}
      >
        <div className="w-7 h-7 flex-shrink-0 bg-bee-ink text-bee-yellow flex items-center justify-center font-bold">
          !
        </div>
        <div className="text-[14px] font-bold tracking-[-0.2px]">
          Errore — download fallito
        </div>
        <div className="flex-1 text-[13px] font-medium">
          Prova a selezionare un altro video.
        </div>
      </div>
    );
  }

  return null;
}
