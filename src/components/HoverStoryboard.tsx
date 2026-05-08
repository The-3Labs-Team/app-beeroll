import { useEffect, useState } from "react";

interface Props {
  videoId: string;
  durationSec?: number;
}

const FRAMES = ["mqdefault", "mq1", "mq2", "mq3"];

export function HoverStoryboard({ videoId }: Props) {
  const [hovered, setHovered] = useState(false);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!hovered) {
      setFrame(0);
      return;
    }
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 700);
    return () => clearInterval(id);
  }, [hovered]);

  const idleUrl = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
  const url = hovered ? `https://i.ytimg.com/vi/${videoId}/${FRAMES[frame]}.jpg` : idleUrl;

  return (
    <div
      className="relative aspect-video bg-muted rounded-md overflow-hidden cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        backgroundImage: `url(${url})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        transition: "background-image 0.1s linear",
      }}
    />
  );
}
