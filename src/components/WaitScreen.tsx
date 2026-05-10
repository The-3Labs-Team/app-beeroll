import { ReactNode } from "react";
import { BeeMonoLabel } from "./bee/BeeMonoLabel";

interface Step {
  id: string;
  label: string;
  /** "active" = currently running; "done" = completed; "pending" = not yet. */
  state: "pending" | "active" | "done";
}

interface Props {
  title: string;
  /** Short reassuring sub-label, e.g. "Può richiedere 1-2 minuti…" */
  subtitle?: ReactNode;
  /** Optional ordered checklist shown under the spinner. */
  steps?: Step[];
  /** When true the screen is wrapped as a fixed overlay with backdrop. */
  overlay?: boolean;
}

/**
 * Full-bleed loading screen in the brutalist BeeRoll style. Used for the long
 * AI/Whisper operations where the UI must be unambiguously "still working" so
 * the user doesn't think the app froze.
 */
export function WaitScreen({ title, subtitle, steps, overlay = false }: Props) {
  const body = (
    <div className="flex flex-col items-center text-center px-6 py-10 max-w-[480px] mx-auto">
      <div className="w-[88px] h-[88px] border-bee border-bee-ink bg-bee-yellow shadow-bee-3 flex items-center justify-center mb-6">
        <svg
          className="bee-spin"
          width="42"
          height="42"
          viewBox="0 0 42 42"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        >
          <path d="M21 4 V12" />
          <path d="M21 30 V38" opacity="0.3" />
          <path d="M4 21 H12" opacity="0.5" />
          <path d="M30 21 H38" opacity="0.7" />
          <path d="M9 9 l5 5" opacity="0.4" />
          <path d="M28 28 l5 5" opacity="0.6" />
          <path d="M9 33 l5 -5" opacity="0.45" />
          <path d="M28 14 l5 -5" opacity="0.55" />
        </svg>
      </div>

      <h2 className="text-[26px] font-bold tracking-[-0.6px] leading-tight m-0 mb-2 break-words">
        {title}
        <span className="bee-pulse-dot ml-1">.</span>
        <span className="bee-pulse-dot delay-1">.</span>
        <span className="bee-pulse-dot delay-2">.</span>
      </h2>

      {subtitle ? (
        <BeeMonoLabel
          as="div"
          className="mt-1 normal-case tracking-normal text-[12.5px] leading-[1.5] text-bee-ink/70 max-w-[380px]"
        >
          {subtitle}
        </BeeMonoLabel>
      ) : null}

      {steps && steps.length > 0 && (
        <ol className="m-0 p-0 mt-6 list-none w-full max-w-[340px] flex flex-col gap-2">
          {steps.map((s, i) => {
            const idx = String(i + 1).padStart(2, "0");
            const isActive = s.state === "active";
            const isDone = s.state === "done";
            return (
              <li
                key={s.id}
                className={`flex items-center gap-3 border-bee border-bee-ink px-3 py-2.5 text-[13px] font-semibold tracking-[-0.2px] ${
                  isActive
                    ? "bg-bee-yellow shadow-bee-1"
                    : isDone
                      ? "bg-white text-bee-ink/60"
                      : "bg-white text-bee-ink/40 border-dashed"
                }`}
              >
                <span
                  className={`font-mono text-[11px] font-bold tracking-[0.4px] px-1.5 py-0.5 leading-none ${
                    isActive
                      ? "bg-bee-ink text-bee-yellow"
                      : isDone
                        ? "bg-bee-ink text-bee-yellow"
                        : "bg-transparent text-bee-ink/40 border border-bee-ink/40"
                  }`}
                >
                  {idx}
                </span>
                <span className="flex-1 text-left">{s.label}</span>
                <span className="font-mono text-[10px] font-bold tracking-[0.6px] uppercase">
                  {isActive ? "in corso" : isDone ? "fatto" : "—"}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );

  if (!overlay) {
    return (
      <div className="w-full flex items-center justify-center py-8">
        {body}
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      className="fixed inset-0 z-50 bg-bee-ink/70 flex items-center justify-center backdrop-blur-[1px]"
    >
      <div className="bg-white border-bee border-bee-ink shadow-bee-win w-[min(560px,92vw)]">
        {body}
      </div>
    </div>
  );
}
