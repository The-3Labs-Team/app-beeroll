import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "./ui/dialog";
import { BeeButton } from "./bee/BeeButton";
import { BeeMonoLabel } from "./bee/BeeMonoLabel";
import { ipc } from "../ipc";
import type { LogEntry } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function levelBadge(level: string): { bg: string; label: string } {
  const u = level.toUpperCase();
  if (u === "ERROR")
    return { bg: "bg-red-600 text-white", label: "ERR" };
  if (u === "WARN")
    return { bg: "bg-bee-yellow text-bee-ink border-2 border-bee-ink", label: "WARN" };
  if (u === "INFO")
    return { bg: "bg-bee-yellow/30 text-bee-yellow border-2 border-bee-yellow/60", label: "INFO" };
  return { bg: "bg-bee-ink text-bee-yellow", label: u.slice(0, 4) };
}

/**
 * Dump of the in-memory log ring (WARN/ERROR only). Polls every 2s while
 * open so the user can watch errors land live during a repro. Cmd+L (or
 * Ctrl+L on non-Mac) toggles it from anywhere.
 */
export function LogsDialog({ open, onOpenChange }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const r = await ipc.logsGet();
      setLogs(r);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  };

  useEffect(() => {
    if (!open) return;
    void refresh();
    const interval = window.setInterval(refresh, 2000);
    return () => window.clearInterval(interval);
  }, [open]);

  const onClear = async () => {
    setBusy(true);
    try {
      await ipc.logsClear();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[820px] w-[92vw] border-bee border-bee-ink shadow-bee-2 bg-white p-0 rounded-md overflow-hidden">
        <div className="px-5 py-3 border-b-bee border-bee-ink flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold tracking-[-0.4px] leading-none m-0">
              Log
            </h2>
            <BeeMonoLabel
              as="div"
              className="normal-case tracking-normal text-[10.5px] mt-1 text-bee-ink/70"
            >
              {logs.length} eventi · INFO/WARN/ERROR · refresh ogni 2s
            </BeeMonoLabel>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold tracking-[0.5px] uppercase border-2 border-bee-ink px-1.5 py-0.5">
              ⌘L
            </span>
            <BeeButton
              variant="default"
              onClick={onClear}
              disabled={busy || logs.length === 0}
            >
              {busy ? "…" : "Pulisci"}
            </BeeButton>
          </div>
        </div>

        <div className="bg-bee-ink/95 text-bee-yellow font-mono text-[11.5px] leading-[1.55] max-h-[60vh] overflow-y-auto bee-scroll p-3">
          {err && (
            <p className="text-red-300 mb-2">! Impossibile leggere i log: {err}</p>
          )}
          {logs.length === 0 && !err && (
            <p className="text-bee-yellow/60 italic">
              Nessun errore registrato. Riproduci il problema e i log
              appariranno qui in automatico.
            </p>
          )}
          {logs.map((l, i) => {
            const badge = levelBadge(l.level);
            return (
              <div key={i} className="flex gap-2 py-0.5">
                <span className="text-bee-yellow/60 flex-shrink-0">
                  {formatTime(l.time)}
                </span>
                <span
                  className={`px-1.5 ${badge.bg} font-bold tracking-[0.3px] text-[10px] flex-shrink-0 leading-[1.45]`}
                >
                  {badge.label}
                </span>
                <span className="text-bee-yellow/55 flex-shrink-0 truncate max-w-[200px]">
                  {l.target}
                </span>
                <span className="text-bee-yellow break-words flex-1 min-w-0">
                  {l.message}
                </span>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-2.5 border-t-bee border-bee-ink flex items-center justify-between gap-3 bg-white">
          <BeeMonoLabel
            as="p"
            className="normal-case tracking-normal text-[10.5px] text-bee-ink/65 leading-[1.5]"
          >
            Buffer in memoria, max 500 entry. Niente di tutto questo viene
            spedito da nessuna parte — copia manualmente se vuoi condividere.
          </BeeMonoLabel>
          <BeeButton variant="primary" onClick={() => onOpenChange(false)}>
            Chiudi
          </BeeButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
