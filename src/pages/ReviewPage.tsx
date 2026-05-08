import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { events, ipc } from "../ipc";
import { useStore } from "../store";
import { BeeWindow } from "../components/BeeWindow";
import { BeeButton } from "../components/bee/BeeButton";
import { BeeHL } from "../components/bee/BeeHL";
import { BeeMonoLabel } from "../components/bee/BeeMonoLabel";

type Phase = "idle" | "transcribing" | "extracting" | "done" | "error";

const padded = (n: number) => String(n).padStart(2, "0");

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
          setProgressMsg(e.message ?? "Trascrizione audio…");
        } else if (e.step === "end") {
          setProgressMsg(
            `Trascritti ${e.segments ?? 0} segmenti (${(e.duration_sec ?? 0).toFixed(1)}s).`,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.slug]);

  const run = async () => {
    if (!project) return;
    setErr("");
    try {
      if (project.voiceover.kind === "audio" && project.transcript.length === 0) {
        setPhase("transcribing");
        setProgressMsg("Trascrizione audio…");
        await ipc.transcriptionRun(project.voiceover.path);
        const updated = await ipc.projectLoad(project.slug);
        setProject(updated);
      }
      setPhase("extracting");
      setProgressMsg("Estrazione punti B-Roll…");
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
    <BeeWindow
      title={`BeeRoll · ${project.name}`}
      className="w-[880px] max-w-full min-h-[660px] h-auto"
    >
      <div className="flex-1 overflow-y-auto bee-scroll px-9 pt-6 pb-9">
        <BeeButton variant="back" onClick={() => nav("/projects")}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <path d="M7 2L3 6l4 4M3 6h7" />
          </svg>
          Indietro
        </BeeButton>

        <h1 className="text-[28px] font-bold tracking-[-0.8px] leading-none mt-[18px] mb-1 break-words">
          <BeeHL>{project.name}</BeeHL>
        </h1>

        {phase === "transcribing" && (
          <BeeMonoLabel as="div" className="mt-4">
            ↻ {progressMsg || "Trascrizione audio…"}
          </BeeMonoLabel>
        )}
        {phase === "extracting" && (
          <BeeMonoLabel as="div" className="mt-4">
            ↻ {progressMsg || "Estrazione punti B-Roll…"}
          </BeeMonoLabel>
        )}
        {phase === "error" && err && (
          <p className="mt-4 font-mono text-[12px] font-bold uppercase tracking-[0.4px] text-red-700 break-words">
            ! {err}
          </p>
        )}

        {phase === "done" && (
          <>
            <BeeMonoLabel as="div" className="mt-3 mb-6">
              {project.broll_points.length} punti B-Roll trovati
            </BeeMonoLabel>
            <ul className="m-0 p-0 list-none flex flex-col gap-3 mb-8">
              {project.broll_points.map((p, i) => (
                <li
                  key={p.id}
                  className="border-bee border-bee-ink p-4 bg-white"
                >
                  <div className="flex items-center mb-2 gap-2 flex-wrap">
                    <span className="font-mono text-[11px] font-bold tracking-[0.4px] uppercase bg-bee-ink text-bee-yellow px-1.5 py-0.5 leading-none">
                      {padded(i + 1)}
                    </span>
                    {p.theme && (
                      <span className="font-mono text-[10px] font-bold tracking-[0.4px] uppercase text-bee-mute">
                        ▶ {p.theme}
                      </span>
                    )}
                    <span className="font-mono text-[11px] font-bold tracking-[0.4px] uppercase text-bee-mute ml-auto">
                      {p.status}
                    </span>
                  </div>
                  <p className="text-[15px] font-medium italic mb-2.5 m-0 leading-snug">
                    « {p.phrase} »
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    {p.keywords.map((kw) => (
                      <span
                        key={kw}
                        className={`text-[12px] font-semibold px-2 py-1 border-2 border-bee-ink ${
                          kw === p.active_keyword
                            ? "bg-bee-yellow text-bee-ink"
                            : "bg-white text-bee-ink"
                        }`}
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t-bee border-bee-ink pt-6 flex items-center justify-between gap-4 flex-wrap">
              <BeeMonoLabel as="div" className="max-w-[340px] leading-[1.5]">
                Scegli un video YouTube per ogni punto · scarica e usa.
              </BeeMonoLabel>
              <BeeButton variant="cta-large" onClick={() => nav("/picker")}>
                Inizia a scegliere video
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                >
                  <path d="M4 9h10M9 4l5 5-5 5" />
                </svg>
              </BeeButton>
            </div>
          </>
        )}
      </div>
    </BeeWindow>
  );
}
