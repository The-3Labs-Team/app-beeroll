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
import type { VideoCandidate } from "../types";

export function PickerPage() {
  const nav = useNavigate();
  const project = useStore((s) => s.project);
  const currentIndex = useStore((s) => s.currentIndex);
  const setCurrentIndex = useStore((s) => s.setCurrentIndex);
  const searchResults = useStore((s) => s.searchResults);
  const setSearchResults = useStore((s) => s.setSearchResults);
  const downloads = useStore((s) => s.downloads);

  const [selected, setSelected] = useState<VideoCandidate | null>(null);
  const [searchErr, setSearchErr] = useState("");
  const [editedKeywords, setEditedKeywords] = useState<Record<string, string>>({});

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

  // Prefetch search for the next 2 points
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

  const runSearch = async (kw: string, pointId: string) => {
    setSearchErr("");
    try {
      const results = await ipc.searchRun(kw);
      setSearchResults(pointId, results);
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
    await ipc.skipPoint(point.id);
    goNext();
  };

  const commitSelected = () => {
    if (!point || !selected) return;
    toast.info(`Download: ${selected.title.slice(0, 50)}…`);
    ipc.pickVideo(point.id, selected).catch((e) => {
      console.error("pickVideo failed:", e);
      toast.error(`Download fallito: ${String(e)}`);
    });
    goNext();
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

  const locked = point ? point.status === "downloading" || point.status === "paused" : false;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!project || !point) return;
      const results = searchResults[point.id] || [];
      if (locked && e.key >= "1" && e.key <= "9") return;
      if (locked && e.key === "Enter") return;
      if (locked && e.key === "ArrowRight") return;
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

  const results = searchResults[point.id] || [];
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
        onChange={onChangeKeyword}
        onHome={() => nav("/projects")}
        disabled={locked}
      />
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
