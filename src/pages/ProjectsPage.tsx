import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { ipc } from "../ipc";
import { useStore } from "../store";
import { Button } from "@/components/ui/button";
import type { Project } from "../types";

export function ProjectsPage() {
  const nav = useNavigate();
  const setProject = useStore((s) => s.setProject);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [ytdlpReady, setYtdlpReady] = useState(false);
  const [ytdlpError, setYtdlpError] = useState<string | null>(null);

  useEffect(() => {
    ipc.projectList().then((p) => {
      setProjects(p);
      setLoading(false);
    });

    // The Rust setup hook ensures yt-dlp in the background. It may finish
    // before this component mounts, so probe state first; otherwise listen
    // for the event.
    ipc.toolchainBootstrap().then((ready) => {
      if (ready) setYtdlpReady(true);
    });

    const offReady = listen("toolchain.ytdlp.ready", () => {
      setYtdlpReady(true);
      setYtdlpError(null);
    });
    const offError = listen<string>("toolchain.ytdlp.error", (e) => {
      setYtdlpError(typeof e.payload === "string" ? e.payload : String(e.payload));
    });

    return () => {
      offReady.then((f) => f());
      offError.then((f) => f());
    };
  }, []);

  const open = async (slug: string) => {
    const p = await ipc.projectLoad(slug);
    setProject(p);
    nav("/picker");
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {!ytdlpReady && !ytdlpError && (
        <div className="bg-blue-50 text-blue-900 p-3 rounded mb-4 text-sm">
          Setting up video downloader (yt-dlp)…
        </div>
      )}
      {ytdlpError && (
        <div className="bg-red-100 text-red-900 p-4 rounded mb-4">
          <p className="font-semibold mb-1">yt-dlp install failed</p>
          <p className="text-sm">{ytdlpError}</p>
          <p className="text-sm mt-2">
            You can install it manually with{" "}
            <code>brew install yt-dlp</code> on macOS, or restart the app to retry.
          </p>
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
