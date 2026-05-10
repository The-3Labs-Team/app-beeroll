import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
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
import { Toaster } from "./components/ui/sonner";

export default function App() {
  const setProject = useStore((s) => s.setProject);
  const setDownloadProgress = useStore((s) => s.setDownloadProgress);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean>(false);
  const [logsOpen, setLogsOpen] = useState(false);

  useEffect(() => {
    let off1: (() => void) | undefined;
    let off2: (() => void) | undefined;
    events.onProjectUpdated((p) => {
      console.log("[ipc] project.updated", {
        slug: p.slug,
        points: p.broll_points.map((b) => ({ id: b.id, status: b.status })),
      });
      setProject(p);
    }).then((u) => { off1 = u; });
    events.onDownloadProgress((e) => {
      console.log("[ipc] download.progress", e);
      setDownloadProgress(e);
    }).then((u) => { off2 = u; });
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
