import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ipc, events } from "../ipc";
import { useStore } from "../store";
import { BeeWindow } from "../components/BeeWindow";
import { KeywordHeader } from "../components/KeywordHeader";
import { VideoGrid } from "../components/VideoGrid";
import { PreviewPane } from "../components/PreviewPane";
import { TimelineStrip } from "../components/TimelineStrip";
import { PointStatusBar } from "../components/PointStatusBar";
import { ActiveDownloadsBanner } from "../components/ActiveDownloadsBanner";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  FilterDialog,
  applyFilters,
  isFilterActive,
  DEFAULT_FILTERS,
  type PickerFilters,
} from "../components/FilterDialog";
import type { VideoCandidate } from "../types";

export function PickerPage() {
  const nav = useNavigate();
  const project = useStore((s) => s.project);
  const setProject = useStore((s) => s.setProject);
  const currentIndex = useStore((s) => s.currentIndex);
  const setCurrentIndex = useStore((s) => s.setCurrentIndex);
  const searchResults = useStore((s) => s.searchResults);
  const setSearchResults = useStore((s) => s.setSearchResults);
  const downloads = useStore((s) => s.downloads);

  const [selected, setSelected] = useState<VideoCandidate | null>(null);
  const [searchErr, setSearchErr] = useState("");
  const [editedKeywords, setEditedKeywords] = useState<Record<string, string>>({});
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<PickerFilters>(DEFAULT_FILTERS);

  const point = project?.broll_points[currentIndex];
  const activeKeyword = point ? (editedKeywords[point.id] ?? point.active_keyword) : "";

  useEffect(() => {
    if (!project) {
      nav("/projects", { replace: true });
    }
  }, [project, nav]);

  useEffect(() => {
    if (!project) return;
    if (project.broll_points.length === 0) return;
    const next = project.broll_points.findIndex(
      (p) => p.status !== "done" && p.status !== "skipped",
    );
    if (next === -1) {
      nav("/summary");
      return;
    }
    setCurrentIndex(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.slug]);

  useEffect(() => {
    if (!point) return;
    setSelected(null);
    if (searchResults[point.id]) return;
    runSearch(activeKeyword, point.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point?.id, activeKeyword]);

  // Prefetch search for the next 2 points. We only prefetch YouTube here
  // (the slow source) so the main bandwidth budget goes to the active point;
  // stock extras for the prefetched points are fetched lazily when the user
  // actually navigates to them.
  useEffect(() => {
    if (!project) return;
    const PREFETCH_COUNT = 2;
    for (let i = 1; i <= PREFETCH_COUNT; i++) {
      const idx = currentIndex + i;
      const nextPoint = project.broll_points[idx];
      if (!nextPoint) break;
      if (nextPoint.status === "done" || nextPoint.status === "skipped") continue;
      if (searchResults[nextPoint.id]) continue;

      const kw = editedKeywords[nextPoint.id] ?? nextPoint.active_keyword;
      if (!kw) continue;

      ipc
        .searchRun(kw)
        .then((results) => setSearchResults(nextPoint.id, results))
        .catch((e) => console.warn("prefetch failed for point", nextPoint.id, e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, project?.slug]);

  useEffect(() => {
    const offComplete = events.onDownloadComplete((e) => {
      const filename = e.output.split("/").pop() || "clip";
      toast.success(`Clip pronta: ${filename}`);
    });
    return () => {
      offComplete.then((f) => f());
    };
  }, []);

  // Polling fallback for timeline freshness. The backend already emits
  // `project.updated` after every status transition, but there have been
  // reports of those events not landing in time (the listener attaches a tick
  // late, or the bridge drops a payload). Rather than chase the race, we
  // simply re-fetch the project every 1.5s while at least one point is
  // actively downloading, and stop the moment everything has either
  // completed or errored. Cost is one IPC call per tick; well under the
  // bandwidth budget.
  const hasActiveWork = project?.broll_points.some(
    (p) =>
      p.status === "downloading" ||
      p.status === "paused" ||
      p.status === "processing" ||
      p.status === "searching" ||
      p.status === "picking",
  ) ?? false;

  useEffect(() => {
    if (!project || !hasActiveWork) return;
    const slug = project.slug;
    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const fresh = await ipc.projectLoad(slug);
        if (!cancelled) setProject(fresh);
      } catch (e) {
        console.warn("polling refresh failed:", e);
      }
    }, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveWork, project?.slug]);

  const runSearch = async (kw: string, pointId: string) => {
    setSearchErr("");
    try {
      // Phase 1: YouTube only — render as soon as it returns (~2s) so the user
      // sees something fast.
      const ytResults = await ipc.searchRun(kw);
      setSearchResults(pointId, ytResults);

      // Phase 2: stock providers in the background. They append to the YouTube
      // results without blocking the initial render. Failures are silent — the
      // user still has YouTube candidates to pick from.
      ipc
        .searchRunExtras(kw)
        .then((extras) => {
          if (extras.length === 0) return;
          setSearchResults(pointId, [...ytResults, ...extras]);
        })
        .catch((e) =>
          console.warn("stock extras search failed for point", pointId, e),
        );
    } catch (e) {
      setSearchErr(String(e));
    }
  };

  const onChangeKeyword = async (kw: string) => {
    if (!point || !project) return;
    setEditedKeywords((m) => ({ ...m, [point.id]: kw }));
    setSearchResults(point.id, []);
    runSearch(kw, point.id);
  };

  const goPrev = () => setCurrentIndex(Math.max(0, currentIndex - 1));
  const goNext = () => {
    if (!project) return;
    if (currentIndex + 1 >= project.broll_points.length) nav("/summary");
    else setCurrentIndex(currentIndex + 1);
  };

  const skipCurrent = async () => {
    if (!point) return;
    // If a download is already in flight (or paused) on this point, don't
    // mark it as skipped — that would cancel the work. Just advance to the
    // next point and let the background download keep running.
    if (
      point.status !== "downloading" &&
      point.status !== "paused" &&
      point.status !== "processing"
    ) {
      await ipc.skipPoint(point.id);
    }
    goNext();
  };

  const commitSelected = () => {
    if (!point || !selected || !project) return;
    toast.info(`Download: ${selected.title.slice(0, 50)}…`);
    // Optimistically mark the point as downloading + attach the picked video,
    // so the status bar and the card overlay appear immediately. The backend
    // will overwrite this state via the next project.updated emit / polling
    // refresh once it has actually persisted the transition.
    setProject({
      ...project,
      broll_points: project.broll_points.map((p) =>
        p.id === point.id
          ? { ...p, status: "downloading", selected_video: selected }
          : p,
      ),
    });
    setSelected(null);
    ipc.pickVideo(point.id, selected).catch((e) => {
      console.error("pickVideo failed:", e);
      toast.error(`Download fallito: ${String(e)}`);
    });
  };

  const onPause = () => {
    if (!point) return;
    ipc
      .cancelDownload(point.id, false)
      .catch((e) => toast.error(`Pausa fallita: ${String(e)}`));
  };
  const onStop = () => {
    if (!point) return;
    ipc
      .cancelDownload(point.id, true)
      .catch((e) => toast.error(`Stop fallito: ${String(e)}`));
  };
  const onResume = () => {
    if (!point || !point.selected_video) return;
    toast.info(`Ripresa: ${point.selected_video.title.slice(0, 50)}…`);
    ipc
      .pickVideo(point.id, point.selected_video)
      .catch((e) => toast.error(`Ripresa fallita: ${String(e)}`));
  };

  const locked = point
    ? point.status === "downloading" ||
      point.status === "paused" ||
      point.status === "processing"
    : false;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!project || !point) return;
      const results = searchResults[point.id] || [];
      if (locked && e.key >= "1" && e.key <= "9") return;
      if (locked && e.key === "Enter") return;
      // ArrowRight intentionally stays enabled while locked — it advances
      // to the next point without cancelling the in-flight download
      // (skipCurrent handles the conditional).
      if (e.key >= "1" && e.key <= "9") {
        const i = parseInt(e.key) - 1;
        if (results[i]) setSelected(results[i]);
      } else if (e.key === "Enter") commitSelected();
      else if (e.key === "ArrowRight") skipCurrent();
      else if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point?.id, selected, searchResults, currentIndex, locked]);

  if (!project) {
    return (
      <BeeWindow title="BeeRoll" className="w-[1180px] max-w-full h-[820px]">
        <div className="p-8 font-mono text-[12px] uppercase tracking-[0.4px] text-bee-mute">
          Nessun progetto caricato.
        </div>
      </BeeWindow>
    );
  }
  if (!point) {
    return (
      <BeeWindow title="BeeRoll" className="w-[1180px] max-w-full h-[820px]">
        <div className="p-8 font-mono text-[12px] uppercase tracking-[0.4px] text-bee-mute">
          Nessun punto B-Roll all'indice {currentIndex}.
        </div>
      </BeeWindow>
    );
  }

  const rawResults = searchResults[point.id] || [];
  const results = applyFilters(rawResults, filters);
  const previewCandidate = locked ? point.selected_video : selected;

  return (
    <BeeWindow
      title={`BeeRoll · ${project.name}`}
      className="w-[1180px] max-w-full h-[820px]"
    >
      <KeywordHeader
        keyword={activeKeyword}
        theme={point.theme}
        phrase={point.phrase}
        current={currentIndex}
        total={project.broll_points.length}
        onPrev={goPrev}
        onSkip={skipCurrent}
        onFinish={() => setConfirmFinish(true)}
        onFilter={() => setFilterOpen(true)}
        filterActive={isFilterActive(filters)}
        onChange={onChangeKeyword}
        onHome={() => nav("/projects")}
        disabled={locked}
        advanceOnly={locked}
      />
      <FilterDialog
        open={filterOpen}
        onOpenChange={setFilterOpen}
        filters={filters}
        onChange={setFilters}
      />
      <ConfirmDialog
        open={confirmFinish}
        onOpenChange={setConfirmFinish}
        title="Terminare il progetto?"
        description={
          <>
            Vai al riepilogo finale: clip pronte, statistiche e link alla
            cartella. I download in corso non vengono interrotti.
          </>
        }
        confirmLabel="Sì, vai al riepilogo"
        cancelLabel="Annulla"
        onConfirm={() => {
          setConfirmFinish(false);
          nav("/summary");
        }}
      />
      {project.broll_points.some(
        (p) =>
          p.id !== point.id &&
          (p.status === "downloading" || p.status === "processing"),
      ) && (
        <div className="mx-[22px] mt-3.5">
          <ActiveDownloadsBanner points={project.broll_points} />
        </div>
      )}
      <PointStatusBar point={point} download={downloads[point.id]} />
      <main className="flex flex-1 overflow-hidden min-h-0" style={{ display: "grid", gridTemplateColumns: "1fr 380px" }}>
        <div className="border-r-bee border-bee-ink overflow-y-auto bee-scroll px-[22px] pt-1.5 pb-[22px] min-w-0">
          {searchErr ? (
            <p className="font-mono text-[12px] font-bold uppercase tracking-[0.4px] text-red-700 p-4 mt-2">
              {searchErr}
            </p>
          ) : null}
          {!searchResults[point.id] && !searchErr ? (
            <p className="font-mono text-[12px] font-bold uppercase tracking-[0.4px] text-bee-mute p-4 mt-2">
              Ricerca su YouTube…
            </p>
          ) : null}
          {results.length > 0 && (
            <VideoGrid
              results={results}
              selectedId={selected?.video_id ?? null}
              pickedVideoId={point.selected_video?.video_id ?? null}
              pickedStatus={point.status}
              pickedPointId={point.id}
              onSelect={setSelected}
              disabled={locked}
            />
          )}
        </div>
        <aside className="overflow-hidden flex flex-col">
          <PreviewPane
            candidate={previewCandidate}
            onCommit={commitSelected}
            onPause={onPause}
            onStop={onStop}
            onResume={onResume}
            pickedPointStatus={point.status}
          />
        </aside>
      </main>
      <TimelineStrip
        points={project.broll_points}
        currentIndex={currentIndex}
        onJump={(i) => setCurrentIndex(i)}
      />
    </BeeWindow>
  );
}
