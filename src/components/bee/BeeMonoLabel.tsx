import { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  as?: "span" | "div" | "p" | "label";
  /** Visual emphasis: muted (default), strong (black), invert (yellow). */
  tone?: "muted" | "strong" | "invert";
}

/**
 * Uppercase mono label — used everywhere for dates/counters/status hints.
 * "Mute" tone matches the design system "lede" / "sub" copy.
 */
export function BeeMonoLabel({
  children,
  className = "",
  as = "span",
  tone = "muted",
}: Props) {
  const Tag = as as React.ElementType;
  const toneCls =
    tone === "strong"
      ? "text-bee-ink"
      : tone === "invert"
      ? "text-bee-yellow"
      : "text-bee-mute";
  return (
    <Tag
      className={`font-mono text-[11px] font-bold uppercase tracking-[0.4px] ${toneCls} ${className}`}
    >
      {children}
    </Tag>
  );
}
