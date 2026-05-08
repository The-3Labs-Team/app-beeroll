import { ReactNode } from "react";

interface Props {
  /** Text shown in the macOS-style titlebar (centred). */
  title?: string;
  /** Tailwind utility classes overriding the inner window dimensions. */
  className?: string;
  children: ReactNode;
}

/**
 * BeeRoll macOS-style window frame: 2.5px black border, hard 10px shadow,
 * traffic-light dots in the titlebar, square interior. Used as the root for
 * every page so the chrome stays consistent.
 */
export function BeeWindow({ title = "BeeRoll", className = "", children }: Props) {
  return (
    <div className="min-h-screen bg-bee-cream flex items-start justify-center py-8 px-4 sm:py-10">
      <div
        className={`bg-white border-bee border-bee-ink shadow-bee-win rounded-md flex flex-col overflow-hidden ${className}`}
      >
        <div className="h-9 flex-shrink-0 border-b-bee border-bee-ink flex items-center px-3.5 gap-2 bg-white">
          <span
            className="w-[13px] h-[13px] rounded-full border-[1.5px] border-bee-ink"
            style={{ background: "#ff5f56" }}
          />
          <span className="w-[13px] h-[13px] rounded-full border-[1.5px] border-bee-ink bg-bee-yellow" />
          <span
            className="w-[13px] h-[13px] rounded-full border-[1.5px] border-bee-ink"
            style={{ background: "#27c93f" }}
          />
          <span className="flex-1 text-center text-[12px] font-semibold tracking-[0.4px] mr-[60px] truncate px-2">
            {title}
          </span>
        </div>
        <div className="flex-1 flex flex-col min-h-0">{children}</div>
      </div>
    </div>
  );
}
