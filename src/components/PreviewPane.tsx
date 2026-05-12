import { useEffect, useRef, useState } from "react";
import type { BRollStatus, VideoCandidate } from "../types";
import { BeeButton } from "./bee/BeeButton";

interface Props {
  candidate: VideoCandidate | null;
  onCommit: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onResume?: () => void;
  pickedPointStatus?: BRollStatus | null;
}

export function PreviewPane({
  candidate,
  onCommit,
  onPause,
  onStop,
  onResume,
  pickedPointStatus,
}: Props) {
  const [muted, setMuted] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setMuted(true);
  }, [candidate?.video_id]);

  if (!candidate) {
    return (
      <div className="flex flex-col h-full p-[18px] gap-3.5 bg-bee-soft">
        <div
          className="aspect-[16/10] bg-bee-ink border-bee border-bee-ink shadow-bee-y-strong text-white p-[18px] flex flex-col"
          style={{ minHeight: "200px" }}
        >
          <span className="self-start bg-bee-yellow text-bee-ink font-mono text-[10px] font-bold tracking-[0.6px] px-1.5 py-0.5 uppercase">
            Anteprima
          </span>
          <div className="m-auto text-center">
            <p className="font-bold text-[15px] mb-1.5 leading-tight">
              Seleziona un video
            </p>
            <p className="font-mono text-[11px] uppercase tracking-[0.4px] opacity-70">
              Clicca una thumbnail · 1–9
            </p>
          </div>
        </div>
      </div>
    );
  }

  const ytSrc = `https://www.youtube-nocookie.com/embed/${candidate.video_id}?autoplay=1&mute=${
    muted ? 1 : 0
  }&modestbranding=1&rel=0`;
  const isDownloading = pickedPointStatus === "downloading";
  const isPaused = pickedPointStatus === "paused";
  const isProcessing = pickedPointStatus === "processing";
  const sourceLabel =
    candidate.source === "youtube"
      ? "YT"
      : candidate.source === "pixabay"
      ? "PX"
      : candidate.source === "pexels"
      ? "PE"
      : "?";

  return (
    <div className="flex flex-col h-full p-[18px] gap-3.5 bg-bee-soft overflow-y-auto bee-scroll">
      <div className="aspect-[16/10] bg-bee-ink border-bee border-bee-ink shadow-bee-y-strong overflow-hidden relative">
        {candidate.source === "youtube" ? (
          <iframe
            ref={iframeRef}
            key={candidate.video_id + (muted ? "-m" : "-u")}
            src={ytSrc}
            title={candidate.title}
            allow="autoplay; encrypted-media"
            // Tauri's bundled macOS build serves the webview from
            // `tauri://localhost`; YouTube's embed checker rejects that
            // custom scheme with "Errore 153 — configurazione del video
            // player". Suppressing the referrer makes YouTube fall back
            // to the no-referrer path which always accepts the embed.
            referrerPolicy="no-referrer"
            className="w-full h-full block"
          />
        ) : candidate.stream_url ? (
          <video
            key={candidate.video_id + (muted ? "-m" : "-u")}
            src={candidate.stream_url}
            controls
            autoPlay
            muted={muted}
            className="w-full h-full object-contain bg-black"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-white p-6 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.4px] text-bee-yellow mb-2">
              Anteprima non disponibile
            </p>
            <a
              href={candidate.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-bee-yellow underline font-bold text-sm"
            >
              ↗ Apri sulla sorgente
            </a>
          </div>
        )}
        <span className="absolute top-3.5 right-3.5 bg-white text-bee-ink font-mono font-bold text-[10px] tracking-[0.4px] px-1.5 py-0.5 border-2 border-bee-ink z-10 pointer-events-none">
          ▶ {sourceLabel}
        </span>
      </div>
      <div>
        <h3 className="text-[17px] font-bold tracking-[-0.3px] leading-[1.25] m-0">
          {candidate.title}
        </h3>
        <div className="font-mono text-[11px] font-bold tracking-[0.4px] uppercase text-bee-ink flex items-center gap-1.5 mt-1.5">
          <span className="w-[18px] h-[18px] rounded-full border-2 border-bee-ink bg-bee-yellow flex-shrink-0" />
          by · {candidate.channel}
        </div>
      </div>
      <div className="flex gap-2 mt-auto items-stretch">
        {isDownloading ? (
          <>
            <BeeButton variant="default" onClick={onPause} className="flex-1 justify-center">
              ⏸ Pausa
            </BeeButton>
            <BeeButton variant="dark" onClick={onStop} className="flex-1 justify-center">
              ✕ Stop
            </BeeButton>
          </>
        ) : isProcessing ? (
          <div className="flex-1 border-bee border-bee-ink bg-bee-yellow text-bee-ink font-bold text-[13px] flex items-center justify-center py-2 animate-pulse">
            ⚙ Elaborazione overlay…
          </div>
        ) : isPaused ? (
          <>
            <BeeButton variant="dark" onClick={onResume} className="flex-1 justify-center">
              ▶ Riprendi
            </BeeButton>
            <BeeButton variant="default" onClick={onStop} className="flex-1 justify-center">
              ✕ Stop
            </BeeButton>
          </>
        ) : (
          <>
            <BeeButton variant="dark" onClick={onCommit} className="flex-1 justify-center">
              Scarica e usa
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 2v8M5 7l3 3 3-3M3 13h10" />
              </svg>
            </BeeButton>
            <button
              type="button"
              onClick={() => setMuted(!muted)}
              title="Audio (m)"
              className="w-[50px] h-[50px] flex-shrink-0 border-bee border-bee-ink bg-white inline-flex items-center justify-center cursor-pointer transition-[background,transform] duration-75 hover:bg-bee-yellow hover:-translate-x-[1px] hover:-translate-y-[1px]"
            >
              <span className="text-[16px] leading-none">{muted ? "🔇" : "🔊"}</span>
            </button>
            <button
              type="button"
              onClick={() => window.open(candidate.url, "_blank")}
              title="Apri sulla sorgente"
              className="w-[50px] h-[50px] flex-shrink-0 border-bee border-bee-ink bg-white inline-flex items-center justify-center cursor-pointer transition-[background,transform] duration-75 hover:bg-bee-yellow hover:-translate-x-[1px] hover:-translate-y-[1px]"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 4h6v6M12 4L4 12" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
