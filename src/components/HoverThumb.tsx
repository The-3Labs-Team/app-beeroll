import { useEffect, useRef, useState } from "react";

interface Props {
  /** Thumbnail shown when not hovering. */
  staticUrl: string;
  /** YouTube video id — required to derive the scrub frames. Pass null/empty
   * for non-YouTube sources to disable scrubbing entirely. */
  videoId?: string | null;
  /** Whether scrubbing is enabled at all. Pass `false` for stock providers. */
  enabled?: boolean;
  /** Delay between frame swaps. */
  intervalMs?: number;
  /** Children render inside the thumb container (badges, overlays). */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Cycles the YouTube preview frames (`mq1.jpg`, `mq2.jpg`, `mq3.jpg`) on
 * hover so the user can sense what the video actually contains without
 * having to play it. On mouse leave it snaps back to the static thumbnail.
 *
 * The mqN frames are 320×180 — slightly lower res than the standard
 * `hqdefault.jpg` we render at rest. We accept the small quality drop
 * during the scrub because it's transient and the alternative (loading
 * `maxresdefault` for every frame) would blow our network budget.
 */
export function HoverThumb({
  staticUrl,
  videoId,
  enabled = true,
  intervalMs = 700,
  children,
  className = "",
}: Props) {
  const [hovering, setHovering] = useState(false);
  const [frame, setFrame] = useState(0);
  const tickRef = useRef<number | null>(null);

  const canScrub = enabled && !!videoId;

  // Preload the scrub frames once we know the video id, so the cycle is
  // smooth instead of flashing white while each new frame downloads.
  useEffect(() => {
    if (!canScrub) return;
    const urls = [1, 2, 3].map(
      (i) => `https://i.ytimg.com/vi/${videoId}/mq${i}.jpg`,
    );
    urls.forEach((u) => {
      const img = new Image();
      img.src = u;
    });
  }, [canScrub, videoId]);

  useEffect(() => {
    if (!canScrub || !hovering) {
      if (tickRef.current != null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      setFrame(0);
      return;
    }
    tickRef.current = window.setInterval(() => {
      // Cycle 1→2→3→1 (skip 0 since it's the static one we show at rest).
      setFrame((f) => (f >= 3 ? 1 : f + 1));
    }, intervalMs);
    setFrame(1); // jump to first scrub frame immediately for instant feedback
    return () => {
      if (tickRef.current != null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [canScrub, hovering, intervalMs]);

  const currentUrl =
    canScrub && hovering && frame > 0
      ? `https://i.ytimg.com/vi/${videoId}/mq${frame}.jpg`
      : staticUrl;

  return (
    <div
      className={className}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        backgroundImage: `url(${currentUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {children}
    </div>
  );
}
