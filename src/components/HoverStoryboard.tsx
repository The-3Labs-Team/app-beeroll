import { useEffect, useRef, useState } from "react";

interface Props {
  videoId: string;
  durationSec: number;
}

export function HoverStoryboard({ videoId, durationSec }: Props) {
  const [hovered, setHovered] = useState(false);
  const [frame, setFrame] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hovered) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % 100), 80);
    return () => clearInterval(id);
  }, [hovered]);

  const url = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const sbUrl = durationSec > 30
    ? `https://i.ytimg.com/sb/${videoId}/storyboard3_L1/M0.jpg`
    : url;

  const col = frame % 10;
  const row = Math.floor(frame / 10);

  return (
    <div
      ref={ref}
      className="relative aspect-video bg-muted rounded-md overflow-hidden cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setFrame(0); }}
      style={
        hovered
          ? {
              backgroundImage: `url(${sbUrl})`,
              backgroundSize: "1000% 1000%",
              backgroundPosition: `${col * 11.11}% ${row * 11.11}%`,
            }
          : { backgroundImage: `url(${url})`, backgroundSize: "cover", backgroundPosition: "center" }
      }
    />
  );
}
