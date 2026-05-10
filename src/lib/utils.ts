import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Italian relative-time formatter for project rows.
 * Matches the design copy: "Ora", "5 min fa", "2 ore fa", "Ieri", "3 giorni fa", "11/14".
 */
export function relativeTimeIt(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "—";
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "Ora";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min fa`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} ${diffH === 1 ? "ora" : "ore"} fa`;
  // Same calendar day check (since diffH may be < 24 but cross midnight)
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return "Oggi";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) return "Ieri";
  const diffDays = Math.floor(diffH / 24);
  if (diffDays < 7) return `${diffDays} giorni fa`;
  // Fallback: DD/MM
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

/**
 * Format duration in seconds as M:SS or H:MM:SS.
 */
export function formatDuration(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Italian ETA formatter.
 */
export function formatEtaIt(sec: number | null | undefined): string {
  if (sec == null) return "";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/**
 * Format a byte count using binary multiples (KiB → MiB → GiB) but display
 * with the friendlier KB/MB/GB labels — matches what Finder/Explorer show on
 * project folders. Returns "—" for negative values.
 */
export function formatBytes(bytes: number): string {
  if (!isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const decimals = unit <= 1 ? 0 : value < 10 ? 1 : 0;
  return `${value.toFixed(decimals)} ${units[unit]}`;
}
