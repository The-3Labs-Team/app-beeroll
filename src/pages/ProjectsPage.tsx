import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { ipc } from "../ipc";
import { useStore } from "../store";
import { BeeWindow } from "../components/BeeWindow";
import { BeeButton } from "../components/bee/BeeButton";
import { BeeHL } from "../components/bee/BeeHL";
import { BeeMonoLabel } from "../components/bee/BeeMonoLabel";
import { relativeTimeIt } from "../lib/utils";
import type { Project } from "../types";

function metaForProject(p: Project): string {
  const when = relativeTimeIt(p.created_at);
  const total = p.broll_points.length;
  const done = p.broll_points.filter((b) => b.status === "done").length;
  if (total === 0) return `${when} · bozza`;
  if (done === total) return `${when} · ${done}/${total} pronto`;
  return `${when} · ${done}/${total}`;
}

function lastActivityLabel(projects: Project[]): string {
  if (projects.length === 0) return "—";
  const latest = projects.reduce((acc, p) => (p.created_at > acc.created_at ? p : acc));
  return relativeTimeIt(latest.created_at).toLowerCase();
}

export function ProjectsPage() {
  const nav = useNavigate();
  const setProject = useStore((s) => s.setProject);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [ytdlpReady, setYtdlpReady] = useState(false);
  const [ytdlpError, setYtdlpError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    ipc.projectList().then((p) => {
      setProjects(p);
      setLoading(false);
    });

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
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="9" cy="9" r="2.6" />
                <path
                  d="M9 1v2M9 15v2M1 9h2M15 9h2M3 3l1.5 1.5M13.5 13.5L15 15M3 15l1.5-1.5M13.5 4.5L15 3"
                  strokeLinecap="round"
                />
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

        {/* Toolchain banner (when yt-dlp not ready) */}
        {(!ytdlpReady || ytdlpError) && (
          <div
            className={`mx-8 mt-5 border-bee border-bee-ink ${
              ytdlpError ? "bg-white shadow-bee-2" : "bg-bee-yellow shadow-bee-2"
            } px-4 py-3`}
          >
            {!ytdlpReady && !ytdlpError && (
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 flex-shrink-0 bg-bee-ink text-bee-yellow flex items-center justify-center font-mono text-[12px] font-bold">
                  …
                </span>
                <div className="flex-1">
                  <p className="font-bold text-[13px] tracking-[-0.2px]">
                    Preparazione downloader video (yt-dlp)…
                  </p>
                </div>
              </div>
            )}
            {ytdlpError && (
              <div className="flex items-start gap-3">
                <span className="w-7 h-7 flex-shrink-0 bg-bee-ink text-bee-yellow flex items-center justify-center font-mono text-[14px] font-bold">
                  !
                </span>
                <div className="flex-1">
                  <p className="font-bold text-[13px] tracking-[-0.2px]">
                    Installazione yt-dlp fallita
                  </p>
                  <p className="text-[12px] mt-1 break-words">{ytdlpError}</p>
                  <BeeMonoLabel as="p" tone="strong" className="mt-2 normal-case tracking-normal text-[11px] font-medium">
                    Installa manualmente con <code className="bg-bee-ink text-bee-yellow px-1.5 py-0.5">brew install yt-dlp</code>{" "}
                    o riavvia l'app.
                  </BeeMonoLabel>
                </div>
              </div>
            )}
          </div>
        )}

        {/* List */}
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
            <ul className="m-0 p-0 list-none">
              {filtered.map((p, i) => (
                <li
                  key={p.slug}
                  className="bee-row border-b-bee border-bee-ink grid items-stretch cursor-pointer bg-white text-bee-ink hover:bg-bee-yellow group"
                  style={{ gridTemplateColumns: "88px 1fr auto auto" }}
                  onClick={() => open(p.slug)}
                >
                  <div className="flex items-center justify-center font-mono text-[22px] font-bold border-r-bee border-bee-ink bg-bee-yellow text-bee-ink group-hover:bg-bee-ink group-hover:text-bee-yellow transition-[background,color] duration-100">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="px-[22px] py-[18px] flex flex-col gap-1 justify-center min-w-0">
                    <div className="text-[20px] font-semibold tracking-[-0.4px] leading-tight overflow-hidden text-ellipsis whitespace-nowrap">
                      {p.name}
                    </div>
                    <BeeMonoLabel
                      as="div"
                      className="group-hover:text-bee-ink/70 transition-colors duration-100"
                    >
                      {metaForProject(p)}
                    </BeeMonoLabel>
                  </div>
                  <div className="self-center px-[22px] font-mono text-[11px] font-bold tracking-[0.6px] uppercase whitespace-nowrap text-right">
                    <b className="text-[14px]">{p.broll_points.length}</b> B-roll
                  </div>
                  <div className="self-stretch border-l-bee border-bee-ink w-[60px] flex items-center justify-center bg-white group-hover:bg-bee-ink group-hover:text-bee-yellow transition-[background,color] duration-100">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 18 18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    >
                      <path d="M5 9h8M9 5l4 4-4 4" />
                    </svg>
                  </div>
                </li>
              ))}
            </ul>
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
    </BeeWindow>
  );
}
