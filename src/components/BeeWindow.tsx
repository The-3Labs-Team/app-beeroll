import { ReactNode } from "react";

interface Props {
  /** Ignored — kept for backwards compatibility with existing call sites. */
  title?: string;
  /** Ignored — pages now fill the OS window. Kept for backwards compatibility. */
  className?: string;
  children: ReactNode;
}

/**
 * Page container. Previously wrapped pages in a fake macOS window (titlebar +
 * traffic lights + outer shadow), but inside a real Tauri window that creates
 * a window-in-window. Now just a transparent fullscreen flex container so the
 * page itself becomes the chrome — the OS provides the real titlebar.
 */
export function BeeWindow({ children }: Props) {
  return (
    <div className="h-screen w-screen flex flex-col bg-white text-bee-ink overflow-hidden">
      {children}
    </div>
  );
}
