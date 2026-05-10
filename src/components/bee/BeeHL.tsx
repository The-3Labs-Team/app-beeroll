import { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  /** Smaller variant for sub-headings (Picker title). */
  size?: "lg" | "sm";
}

/**
 * Yellow highlight wrapper for headings — used inside h1/h2 to emphasise
 * a single word with a flat yellow chunk.
 */
export function BeeHL({ children, className = "", size = "lg" }: Props) {
  const cls = size === "lg" ? "bee-hl" : "bee-hl-sm";
  return <span className={`${cls} ${className}`}>{children}</span>;
}
