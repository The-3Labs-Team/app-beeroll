import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { ipc } from "../ipc";
import { useStore } from "../store";
import { BeeWindow } from "../components/BeeWindow";
import { BeeButton } from "../components/bee/BeeButton";
import { BeeHL } from "../components/bee/BeeHL";
import { BeeMonoLabel } from "../components/bee/BeeMonoLabel";
import { ActiveDownloadsBanner } from "../components/ActiveDownloadsBanner";

const padded = (n: number) => String(n).padStart(2, "0");

export function SummaryPage() {
  const nav = useNavigate();
  const project = useStore((s) => s.project);
  const [exporting, setExporting] = useState<null | "edl" | "fcpxml">(null);

  useEffect(() => {
    if (!project) nav("/projects", { replace: true });
  }, [project, nav]);

  if (!project) return null;

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
      if (!path) return;
      setExporting(kind);
      if (kind === "edl") {
        await ipc.exportEdl(path);
      } else {
        await ipc.exportFcpxml(path);
      }
      toast.success(`${label} esportato`, { description: path });
    } catch (e) {
      toast.error(`Esportazione ${label} fallita`, { description: String(e) });
    } finally {
      setExporting(null);
    }
  };

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

        <ActiveDownloadsBanner points={project.broll_points} />

        <h1 className="text-[46px] font-bold tracking-[-1.2px] leading-none mt-[18px] mb-1 break-words">
          <BeeHL>{project.name}</BeeHL>
        </h1>
        <BeeMonoLabel as="div" className="mt-3 mb-6">
          {done.length} clip · {skipped.length} saltati ·{" "}
          {project.broll_points.length} punti totali
        </BeeMonoLabel>

        <div className="flex flex-wrap gap-3 mb-8">
          <BeeButton variant="primary" onClick={() => ipc.openProjectFolder()}>
            Apri cartella
          </BeeButton>
          <BeeButton
            variant="default"
            onClick={() => runExport("edl")}
            disabled={exporting !== null || done.length === 0}
          >
            {exporting === "edl" ? "Esportazione…" : "Esporta EDL"}
          </BeeButton>
          <BeeButton
            variant="default"
            onClick={() => runExport("fcpxml")}
            disabled={exporting !== null || done.length === 0}
          >
            {exporting === "fcpxml" ? "Esportazione…" : "Esporta FCPXML"}
          </BeeButton>
          <BeeButton variant="default" onClick={() => nav("/projects")}>
            Torna alla lista
          </BeeButton>
        </div>

        <h2 className="font-mono text-[11px] font-bold tracking-[0.6px] uppercase mb-3.5 text-bee-ink">
          Clip generati
        </h2>
        {done.length === 0 ? (
          <BeeMonoLabel as="div">Nessuna clip generata.</BeeMonoLabel>
        ) : (
          <ul className="m-0 p-0 list-none flex flex-col gap-2.5">
            {done.map((p, i) => (
              <li
                key={p.id}
                className="flex items-center justify-between border-bee border-bee-ink bg-white p-3 gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold m-0 truncate">
                    <span className="font-mono bg-bee-ink text-bee-yellow px-1.5 py-px mr-2 text-[11px] tracking-[0.4px]">
                      {padded(i + 1)}
                    </span>
                    {p.phrase}
                  </p>
                  <p className="font-mono text-[10.5px] font-medium tracking-[0.3px] uppercase text-bee-mute mt-1 m-0 truncate">
                    {p.output_clip} · {p.selected_video?.channel}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BeeWindow>
  );
}
