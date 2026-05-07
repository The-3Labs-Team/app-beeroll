import { useNavigate } from "react-router-dom";
import { ipc } from "../ipc";
import { useStore } from "../store";
import { Button } from "@/components/ui/button";

export function SummaryPage() {
  const nav = useNavigate();
  const project = useStore((s) => s.project);
  if (!project) return <div className="p-8">No project loaded.</div>;

  const done = project.broll_points.filter((p) => p.status === "done");
  const skipped = project.broll_points.filter((p) => p.status === "skipped");

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">{project.name}</h1>
      <p className="text-muted-foreground mb-8">
        {done.length} clip generated · {skipped.length} skipped · {project.broll_points.length} total points
      </p>

      <div className="flex gap-3 mb-8">
        <Button onClick={() => ipc.openProjectFolder()}>Open folder</Button>
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
