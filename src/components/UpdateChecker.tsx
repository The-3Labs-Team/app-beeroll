import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * Silent update check on startup. When a newer release is published on GitHub
 * the user is asked to confirm; on accept the update is downloaded, verified
 * (minisign signature), installed, and the app relaunches.
 *
 * Every failure path is non-fatal: offline, no published release yet, or simply
 * not running under the Tauri runtime (e.g. the browser dev server / tests) all
 * just leave the app running normally with no prompt.
 */
export function UpdateChecker() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    console.info("[updater] checking for updates…");
    check()
      .then((u) => {
        if (cancelled) return;
        if (u) {
          console.info(`[updater] update available: ${u.version} (current ${u.currentVersion})`);
          setUpdate(u);
          setOpen(true);
        } else {
          console.info("[updater] up to date (no newer release)");
        }
      })
      .catch((e) => {
        console.error("[updater] check failed:", e);
        toast.error(`Controllo aggiornamenti fallito: ${String(e)}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onConfirm = async () => {
    if (!update || busy) return;
    setBusy(true);
    try {
      toast.info("Download dell'aggiornamento in corso…");
      await update.downloadAndInstall();
      toast.success("Aggiornamento installato. Riavvio…");
      await relaunch();
    } catch (e) {
      setBusy(false);
      toast.error(`Aggiornamento fallito: ${String(e)}`);
    }
  };

  if (!update) return null;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        // Block dismissal mid-install so the relaunch isn't orphaned.
        if (!busy) setOpen(o);
      }}
      title={`Aggiornamento disponibile (v${update.version})`}
      description={
        <>
          È disponibile la versione <strong>{update.version}</strong> (hai la{" "}
          {update.currentVersion}). Vuoi scaricarla e installarla ora? L'app si
          riavvierà al termine.
          {update.body ? (
            <span className="mt-3 block whitespace-pre-line text-[12px] text-bee-ink/70">
              {update.body}
            </span>
          ) : null}
        </>
      }
      confirmLabel="Aggiorna ora"
      cancelLabel="Più tardi"
      busy={busy}
      onConfirm={onConfirm}
    />
  );
}
