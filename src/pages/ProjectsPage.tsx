import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { ipc } from "../ipc";
import { useStore } from "../store";
import { Button } from "@/components/ui/button";
import type { Project } from "../types";

interface ToolStatus { found: boolean; path: string | null; version: string | null; }
interface ToolchainStatus { ytdlp: ToolStatus; ffmpeg: ToolStatus; }

export function ProjectsPage() {
  const nav = useNavigate();
  const setProject = useStore((s) => s.setProject);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [tc, setTc] = useState<ToolchainStatus | null>(null);

  useEffect(() => {
    ipc.projectList().then((p) => { setProjects(p); setLoading(false); });
    invoke<ToolchainStatus>("toolchain_status").then(setTc);
  }, []);

  const open = async (slug: string) => {
    const p = await ipc.projectLoad(slug);
    setProject(p);
    nav("/picker");
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {tc && !tc.ytdlp.found && (
        <div className="bg-red-100 text-red-900 p-4 rounded mb-4">
          Missing tool: <code>yt-dlp</code>. Install with <code>brew install yt-dlp</code> on macOS.
        </div>
      )}
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">B-Roll Projects</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => nav("/settings")}>Settings</Button>
          <Button onClick={() => nav("/import")}>+ New project</Button>
        </div>
      </header>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <p className="text-lg mb-2">No projects yet</p>
          <p className="text-muted-foreground mb-6">Create your first project to start picking B-Roll.</p>
          <Button onClick={() => nav("/import")}>Create project</Button>
        </div>
      ) : (
        <ul className="grid gap-4">
          {projects.map((p) => (
            <li key={p.slug} className="border border-border rounded-lg p-4 cursor-pointer hover:bg-muted transition" onClick={() => open(p.slug)}>
              <h3 className="font-semibold">{p.name}</h3>
              <p className="text-sm text-muted-foreground">{new Date(p.created_at).toLocaleString()} • {p.broll_points.length} B-Roll points</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
