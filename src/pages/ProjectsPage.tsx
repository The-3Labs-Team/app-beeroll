import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { events, ipc } from "../ipc";
import { useStore } from "../store";
import { BeeWindow } from "../components/BeeWindow";
import { BeeButton } from "../components/bee/BeeButton";
import { BeeHL } from "../components/bee/BeeHL";
import { BeeMonoLabel } from "../components/bee/BeeMonoLabel";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ProjectFolderCard } from "../components/ProjectFolderCard";
import { relativeTimeIt } from "../lib/utils";
import type { Project } from "../types";

function lastActivityLabel(projects: Project[]): string {
  if (projects.length === 0) return "—";
  const latest = projects.reduce((acc, p) => (p.created_at > acc.created_at ? p : acc));
  return relativeTimeIt(latest.created_at).toLowerCase();
}

export function ProjectsPage() {
  const nav = useNavigate();
  const setProject = useStore((s) => s.setProject);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadProjects = () =>
    ipc.projectList().then((list) => {
      setProjects(list);
      setLoading(false);
      // Fetch sizes in parallel; update each as it resolves so the UI doesn't
      // wait on the slowest folder.
      list.forEach((p) => {
        ipc
          .projectSize(p.slug)
          .then((b) => setSizes((m) => ({ ...m, [p.slug]: b })))
          .catch(() => {});
      });
    });

  useEffect(() => {
    loadProjects();

    // Subscribe to project.updated so the dashboard reflects backend state
    // (download status, B-roll points) without forcing the user to navigate
    // away and come back. Each event carries the full Project payload, so we
    // just splice it into the existing list.
    const offProjectUpdated = events.onProjectUpdated((updated) => {
      setProjects((list) => {
        const idx = list.findIndex((p) => p.slug === updated.slug);
        if (idx === -1) return list;
        const next = list.slice();
        next[idx] = updated;
        return next;
      });
    });

    return () => {
      offProjectUpdated.then((f) => f());
    };
  }, []);

  const open = async (slug: string) => {
    const p = await ipc.projectLoad(slug);
    setProject(p);
    // If the project has no B-Roll points yet, the extraction pipeline either
    // never started or was interrupted. Send the user to /review so the page
    // resumes transcription/extraction and shows the WaitScreen — opening
    // /picker for an empty project would crash with "Nessun punto B-Roll".
    if (p.broll_points.length === 0) {
      nav("/review");
    } else {
      nav("/picker");
    }
  };

  const onConfirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await ipc.projectDelete(pendingDelete.slug);
      toast.success(`Progetto "${pendingDelete.name}" eliminato`);
      setProjects((list) => list.filter((p) => p.slug !== pendingDelete.slug));
      setSizes((m) => {
        const { [pendingDelete.slug]: _omit, ...rest } = m;
        return rest;
      });
      setPendingDelete(null);
    } catch (e) {
      toast.error(`Eliminazione fallita: ${String(e)}`);
    } finally {
      setDeleting(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query]);

  const total = projects.length;
  const padded = (n: number) => String(n).padStart(2, "0");

  return (
    <BeeWindow title="BeeRoll" className="w-[880px] max-w-full h-[660px]">
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="px-8 pt-7 pb-5 border-b-bee border-bee-ink flex items-end justify-between gap-6">
          <div>
            <h1 className="text-[28px] font-bold tracking-[-0.8px] leading-none m-0">
              <BeeHL>Progetti</BeeHL>
            </h1>
            <BeeMonoLabel as="div" className="mt-2.5 text-[12px]">
              {padded(total)} {total === 1 ? "attivo" : "attivi"} · ultimo:{" "}
              {lastActivityLabel(projects)}
            </BeeMonoLabel>
          </div>
          <div className="flex gap-3 flex-shrink-0">
            <BeeButton
              variant="icon"
              aria-label="Impostazioni"
              title="Impostazioni"
              onClick={() => nav("/settings")}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </BeeButton>
            <BeeButton variant="primary" onClick={() => nav("/import")}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M8 2v12M2 8h12" />
              </svg>
              Nuovo progetto
            </BeeButton>
          </div>
        </div>

        {/* Folder grid */}
        <div className="flex-1 overflow-y-auto bee-scroll">
          {loading ? (
            <BeeMonoLabel as="div" className="p-8">
              Caricamento…
            </BeeMonoLabel>
          ) : filtered.length === 0 && projects.length === 0 ? (
            <div className="border-bee border-dashed border-bee-ink m-8 p-12 text-center">
              <p className="text-lg font-bold mb-2">Nessun progetto</p>
              <BeeMonoLabel as="p" className="mb-6">
                Crea il primo progetto per iniziare.
              </BeeMonoLabel>
              <BeeButton variant="primary" onClick={() => nav("/import")}>
                Crea progetto
              </BeeButton>
            </div>
          ) : filtered.length === 0 ? (
            <BeeMonoLabel as="div" className="p-8">
              Nessun progetto corrisponde a "{query}"
            </BeeMonoLabel>
          ) : (
            <div
              className="px-7 pt-9 pb-6 grid gap-x-5 gap-y-7"
              style={{
                gridTemplateColumns:
                  "repeat(auto-fill, minmax(220px, 1fr))",
              }}
            >
              {filtered.map((p, i) => (
                <ProjectFolderCard
                  key={p.slug}
                  index={i + 1}
                  project={p}
                  sizeBytes={sizes[p.slug]}
                  onOpen={() => open(p.slug)}
                  onOpenFolder={() => {
                    ipc
                      .openProjectFolder(p.slug)
                      .catch((err) =>
                        toast.error(`Apertura fallita: ${String(err)}`),
                      );
                  }}
                  onDelete={() => setPendingDelete(p)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer search */}
        <div className="border-t-bee border-bee-ink flex items-center flex-shrink-0">
          <div className="flex-1 h-[50px] flex items-center gap-2.5 px-[18px] font-mono text-[13px] font-medium">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="6" cy="6" r="4" />
              <path d="M9 9l3 3" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca progetto…"
              className="flex-1 border-none outline-none bg-transparent font-mono text-[13px] text-bee-ink placeholder:text-bee-mute"
            />
            <span className="font-mono text-[10px] font-bold tracking-[0.4px] border-[1.5px] border-bee-ink px-[7px] py-[3px]">
              ⌘K
            </span>
          </div>
          <div className="border-l-bee border-bee-ink px-[18px] h-[50px] flex items-center font-mono text-[11px] font-bold tracking-[0.6px] uppercase bg-bee-yellow text-bee-ink whitespace-nowrap">
            {padded(total)} {total === 1 ? "progetto" : "progetti"}
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
        title="Eliminare il progetto?"
        description={
          pendingDelete && (
            <>
              Verrà rimossa permanentemente la cartella{" "}
              <strong>{pendingDelete.name}</strong> con tutti i clip,
              transcript e cache. L'operazione non è reversibile.
            </>
          )
        }
        confirmLabel="Elimina"
        cancelLabel="Annulla"
        danger
        busy={deleting}
        onConfirm={onConfirmDelete}
      />
    </BeeWindow>
  );
}
