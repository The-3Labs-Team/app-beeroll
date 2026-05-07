import { useEffect, useRef, useState } from "react";
import type { VideoCandidate } from "../types";
import { Button } from "@/components/ui/button";

interface Props {
  candidate: VideoCandidate | null;
  onCommit: () => void;
  busy: boolean;
}

export function PreviewPane({ candidate, onCommit, busy }: Props) {
  const [muted, setMuted] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setMuted(true);
  }, [candidate?.video_id]);

  if (!candidate) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center">
        <p className="text-lg mb-2">Select a video to preview</p>
        <p className="text-sm">Click any thumbnail or press 1–9</p>
      </div>
    );
  }

  const src = `https://www.youtube-nocookie.com/embed/${candidate.video_id}?autoplay=1&mute=${muted ? 1 : 0}&modestbranding=1&rel=0`;

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      <div className="aspect-video bg-black rounded-lg overflow-hidden">
        <iframe
          ref={iframeRef}
          key={candidate.video_id + (muted ? "-m" : "-u")}
          src={src}
          title={candidate.title}
          allow="autoplay; encrypted-media"
          className="w-full h-full"
        />
      </div>
      <div>
        <h3 className="font-semibold leading-tight">{candidate.title}</h3>
        <p className="text-sm text-muted-foreground">by © {candidate.channel}</p>
      </div>
      <div className="flex gap-2 mt-auto">
        <Button onClick={onCommit} disabled={busy} className="flex-1">
          {busy ? "Downloading…" : "Download & use ✓"}
        </Button>
        <Button variant="outline" onClick={() => setMuted(!muted)} title="Toggle audio (m)">
          {muted ? "🔇" : "🔊"}
        </Button>
        <Button variant="outline" onClick={() => window.open(candidate.url, "_blank")} title="Open on YouTube">↗</Button>
      </div>
    </div>
  );
}
