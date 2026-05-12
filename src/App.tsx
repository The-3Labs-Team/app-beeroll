import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { events, ipc } from "./ipc";
import { useStore } from "./store";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ImportPage } from "./pages/ImportPage";
import { ReviewPage } from "./pages/ReviewPage";
import { PickerPage } from "./pages/PickerPage";
import { SummaryPage } from "./pages/SummaryPage";
import { OnboardingModal } from "./components/OnboardingModal";
import { LogsDialog } from "./components/LogsDialog";
import { BeeWindow } from "./components/BeeWindow";
import { BeeMonoLabel } from "./components/bee/BeeMonoLabel";
import { WaitScreen } from "./components/WaitScreen";
import { Toaster } from "./components/ui/sonner";

export default function App() {
  const setProject = useStore((s) => s.setProject);
  const setDownloadProgress = useStore((s) => s.setDownloadProgress);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean>(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [ytdlpReady, setYtdlpReady] = useState(false);
  const [ytdlpError, setYtdlpError] = useState<string | null>(null);

  // Gate the whole app behind yt-dlp readiness — many commands fail until the
  // binary is bootstrapped (download, search, processing). We poll the
  // dedicated wait command (resolves within ~10s once `bin_paths.ytdlp` is
  // populated) and also listen to the ready/error events as a safety net.
  useEffect(() => {
    let cancelled = false;
    ipc
      .toolchainWaitReady()
      .then((ready) => {
        if (!cancelled && ready) setYtdlpReady(true);
      })
      .catch(() => {
        /* listener below will catch the error event */
      });
    const offReady = listen("toolchain:ytdlp:ready", () => {
      setYtdlpReady(true);
      setYtdlpError(null);
    });
    const offError = listen<string>("toolchain:ytdlp:error", (e) => {
      setYtdlpError(
        typeof e.payload === "string" ? e.payload : String(e.payload),
      );
    });
    return () => {
      cancelled = true;
      offReady.then((f) => f());
      offError.then((f) => f());
    };
  }, []);

  useEffect(() => {
    let off1: (() => void) | undefined;
    let off2: (() => void) | undefined;
    events.onProjectUpdated((p) => setProject(p)).then((u) => { off1 = u; });
    events.onDownloadProgress((e) => setDownloadProgress(e)).then((u) => { off2 = u; });
    return () => { off1?.(); off2?.(); };
  }, [setProject, setDownloadProgress]);

  useEffect(() => {
    ipc
      .firstRunStatus()
      .then((s) => setNeedsOnboarding(s.is_first_run))
      .catch(() => setNeedsOnboarding(false));
  }, []);

  // Global hotkey: Cmd+L (Mac) / Ctrl+L (other) toggles the logs modal. The
  // shortcut is harmless inside the Tauri webview (no browser address bar to
  // intercept) so we don't need a more exotic combo.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setLogsOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!ytdlpReady) {
    return (
      <>
        <BeeWindow title="BeeRoll" className="w-[880px] max-w-full min-h-[660px] h-auto">
          {ytdlpError ? (
            <div className="flex flex-col items-center text-center px-6 py-10 max-w-[480px] mx-auto">
              <div className="w-[88px] h-[88px] border-bee border-bee-ink bg-white shadow-bee-3 flex items-center justify-center mb-6 font-bold text-[40px] text-bee-ink">
                !
              </div>
              <h2 className="text-[26px] font-bold tracking-[-0.6px] leading-tight m-0 mb-2 break-words">
                Installazione yt-dlp fallita
              </h2>
              <p className="text-[13px] mt-2 break-words font-medium">
                {ytdlpError}
              </p>
              <BeeMonoLabel
                as="p"
                tone="strong"
                className="mt-4 normal-case tracking-normal text-[11.5px] font-medium leading-[1.6]"
              >
                Installa manualmente con{" "}
                <code className="bg-bee-ink text-bee-yellow px-1.5 py-0.5">
                  brew install yt-dlp
                </code>{" "}
                e riavvia l'app.
              </BeeMonoLabel>
            </div>
          ) : (
            <WaitScreen
              title="Preparazione downloader video"
              subtitle="Scarichiamo yt-dlp al primo avvio (~12 MB). Pochi secondi."
            />
          )}
        </BeeWindow>
        <Toaster />
      </>
    );
  }

  return (
    <>
      {needsOnboarding && (
        <OnboardingModal onClose={() => setNeedsOnboarding(false)} />
      )}
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/projects" />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/picker" element={<PickerPage />} />
          <Route path="/summary" element={<SummaryPage />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
      <LogsDialog open={logsOpen} onOpenChange={setLogsOpen} />
    </>
  );
}
