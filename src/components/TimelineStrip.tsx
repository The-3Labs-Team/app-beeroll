import type { BRollPoint } from "../types";

interface Props {
  points: BRollPoint[];
  currentIndex: number;
  onJump: (i: number) => void;
}

const STATUS_CLASS: Record<BRollPoint["status"], string> = {
  pending: "bg-muted",
  searching: "bg-muted",
  picking: "bg-muted",
  downloading: "bg-yellow-500 animate-pulse",
  done: "bg-green-500",
  skipped: "bg-gray-400",
  error: "bg-red-500",
};

export function TimelineStrip({ points, currentIndex, onJump }: Props) {
  return (
    <div className="flex items-center gap-1 px-6 py-3 border-t border-border overflow-x-auto">
      {points.map((p, i) => {
        const isCurrent = i === currentIndex;
        return (
          <button
            key={p.id}
            onClick={() => onJump(i)}
            title={`#${i + 1}: ${p.phrase}`}
            className={`h-6 w-6 rounded-sm transition ${STATUS_CLASS[p.status]} ${isCurrent ? "ring-2 ring-primary ring-offset-2" : ""}`}
          />
        );
      })}
      <span className="ml-3 text-xs text-muted-foreground whitespace-nowrap">
        {currentIndex + 1}/{points.length} points
      </span>
    </div>
  );
}
