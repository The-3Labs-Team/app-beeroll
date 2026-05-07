import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { events } from "./ipc";
import { useStore } from "./store";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ImportPage } from "./pages/ImportPage";
import { ReviewPage } from "./pages/ReviewPage";
import { PickerPage } from "./pages/PickerPage";
import { SummaryPage } from "./pages/SummaryPage";

export default function App() {
  const setProject = useStore((s) => s.setProject);
  const setDownloadProgress = useStore((s) => s.setDownloadProgress);

  useEffect(() => {
    let off1: (() => void) | undefined;
    let off2: (() => void) | undefined;
    events.onProjectUpdated(setProject).then((u) => { off1 = u; });
    events.onDownloadProgress(setDownloadProgress).then((u) => { off2 = u; });
    return () => { off1?.(); off2?.(); };
  }, [setProject, setDownloadProgress]);

  return (
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
    </BrowserRouter>
  );
}
