import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ipc } from "../ipc";
import { useStore } from "../store";
import { Button } from "@/components/ui/button";

export function ReviewPage() {
  const nav = useNavigate();
  const project = useStore((s) => s.project);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (project && project.broll_points.length === 0) {
      run();
    } else if (project && project.broll_points.length > 0) {
      setDone(true);
    }
  }, [project?.slug]);

  const run = async () => {
    setBusy(true); setErr("");
    try {
      await ipc.extractionRun();
      setDone(true);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!project) return <div className="p-8">No project loaded.</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <header className="mb-8">
        <Button variant="ghost" onClick={() => nav("/projects")}>← Projects</Button>
        <h1 className="text-3xl font-bold mt-4">{project.name}</h1>
      </header>

      {busy && <p className="text-muted-foreground">Calling AI to extract B-Roll points…</p>}
      {err && <p className="text-red-600">{err}</p>}

      {done && (
        <>
          <h2 className="text-xl font-semibold mb-4">{project.broll_points.length} B-Roll points found</h2>
          <ul className="space-y-3 mb-8">
            {project.broll_points.map((p, i) => (
              <li key={p.id} className="border border-border rounded-lg p-4">
                <div className="flex justify-between mb-2">
                  <span className="text-xs text-muted-foreground">#{i + 1}</span>
                  <span className="text-xs text-muted-foreground capitalize">{p.status}</span>
                </div>
                <p className="font-medium mb-2">"{p.phrase}"</p>
                <div className="flex gap-2 flex-wrap">
                  {p.keywords.map((kw) => (
                    <span key={kw} className={`text-xs px-2 py-1 rounded ${kw === p.active_keyword ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{kw}</span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <Button size="lg" onClick={() => nav("/picker")}>Start picking videos →</Button>
        </>
      )}
    </div>
  );
}
