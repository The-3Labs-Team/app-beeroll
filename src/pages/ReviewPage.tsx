import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { events, ipc } from "../ipc";
import { useStore } from "../store";
import { Button } from "@/components/ui/button";

type Phase = "idle" | "transcribing" | "extracting" | "done" | "error";

export function ReviewPage() {
  const nav = useNavigate();
  const project = useStore((s) => s.project);
  const setProject = useStore((s) => s.setProject);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [err, setErr] = useState("");
  const startedRef = useRef(false);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void events
      .onTranscriptionProgress((e) => {
        if (e.step === "start") {
          setProgressMsg(e.message ?? "Transcribing audio…");
        } else if (e.step === "end") {
          setProgressMsg(
            `Transcribed ${e.segments ?? 0} segments (${(
              e.duration_sec ?? 0
            ).toFixed(1)}s).`,
          );
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    if (!project) return;
    if (startedRef.current) return;
    if (project.broll_points.length > 0) {
      setPhase("done");
      return;
    }
    startedRef.current = true;
    void run();
    // We deliberately depend on slug only so re-renders don't restart work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.slug]);

  const run = async () => {
    if (!project) return;
    setErr("");
    try {
      // Audio voiceovers without a transcript must be transcribed first;
      // otherwise extraction_run errors with "transcript missing".
      if (
        project.voiceover.kind === "audio" &&
        project.transcript.length === 0
      ) {
        setPhase("transcribing");
        setProgressMsg("Transcribing audio…");
        await ipc.transcriptionRun(project.voiceover.path);
        // Pull updated project so we know the transcript landed.
        const updated = await ipc.projectLoad(project.slug);
        setProject(updated);
      }
      setPhase("extracting");
      setProgressMsg("Calling AI to extract B-Roll points…");
      await ipc.extractionRun();
      const final = await ipc.projectLoad(project.slug);
      setProject(final);
      setPhase("done");
    } catch (e) {
      setErr(String(e));
      setPhase("error");
    }
  };

  useEffect(() => {
    if (!project) nav("/projects", { replace: true });
  }, [project, nav]);

  if (!project) return null;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <header className="mb-8">
        <Button variant="ghost" onClick={() => nav("/projects")}>← Projects</Button>
        <h1 className="text-3xl font-bold mt-4">{project.name}</h1>
      </header>

      {phase === "transcribing" && (
        <p className="text-muted-foreground">
          {progressMsg || "Transcribing audio…"}
        </p>
      )}
      {phase === "extracting" && (
        <p className="text-muted-foreground">
          {progressMsg || "Calling AI to extract B-Roll points…"}
        </p>
      )}
      {phase === "error" && err && <p className="text-red-600">{err}</p>}

      {phase === "done" && (
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
