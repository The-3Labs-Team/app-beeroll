import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { ipc } from "../ipc";
import { useStore } from "../store";
import { Button } from "@/components/ui/button";
import { ActiveDownloadsBanner } from "../components/ActiveDownloadsBanner";

export function SummaryPage() {
  const nav = useNavigate();
  const project = useStore((s) => s.project);
  // Single busy flag for both export buttons; we never want them clickable
  // concurrently because both use the OS save dialog and the active project
  // state on the backend.
  const [exporting, setExporting] = useState<null | "edl" | "fcpxml">(null);

  if (!project) return <div className="p-8">No project loaded.</div>;

  const done = project.broll_points.filter((p) => p.status === "done");
  const skipped = project.broll_points.filter((p) => p.status === "skipped");

  const runExport = async (kind: "edl" | "fcpxml") => {
    if (exporting) return;
    const ext = kind === "edl" ? "edl" : "fcpxml";
    const label = kind === "edl" ? "EDL" : "FCPXML";
    try {
      const path = await save({
        defaultPath: `${project.name}.${ext}`,
        filters: [{ name: label, extensions: [ext] }],
      });
      // User cancelled the dialog; nothing to do, no toast.
      if (!path) return;
      setExporting(kind);
      if (kind === "edl") {
        await ipc.exportEdl(path);
      } else {
        await ipc.exportFcpxml(path);
      }
      toast.success(`${label} exported`, { description: path });
    } catch (e) {
      toast.error(`${label} export failed`, { description: String(e) });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <ActiveDownloadsBanner points={project.broll_points} />
      <h1 className="text-3xl font-bold mb-2">{project.name}</h1>
      <p className="text-muted-foreground mb-8">
        {done.length} clip generated · {skipped.length} skipped · {project.broll_points.length} total points
      </p>

      <div className="flex flex-wrap gap-3 mb-8">
        <Button onClick={() => ipc.openProjectFolder()}>Open folder</Button>
        <Button
          variant="outline"
          onClick={() => runExport("edl")}
          disabled={exporting !== null || done.length === 0}
        >
          {exporting === "edl" ? "Exporting EDL…" : "Export EDL"}
        </Button>
        <Button
          variant="outline"
          onClick={() => runExport("fcpxml")}
          disabled={exporting !== null || done.length === 0}
        >
          {exporting === "fcpxml" ? "Exporting FCPXML…" : "Export FCPXML"}
        </Button>
        <Button variant="outline" onClick={() => nav("/projects")}>Back to projects</Button>
      </div>

      <h2 className="text-xl font-semibold mb-4">Generated clips</h2>
      <ul className="space-y-2">
        {done.map((p, i) => (
          <li key={p.id} className="flex items-center justify-between border border-border rounded-lg p-3">
            <div>
              <p className="text-sm font-medium">{i + 1}. {p.phrase}</p>
              <p className="text-xs text-muted-foreground">{p.output_clip} · © {p.selected_video?.channel}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
