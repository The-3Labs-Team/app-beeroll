import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ipc, events } from "../ipc";
import { useStore } from "../store";
import { KeywordHeader } from "../components/KeywordHeader";
import { VideoGrid } from "../components/VideoGrid";
import { PreviewPane } from "../components/PreviewPane";
import { TimelineStrip } from "../components/TimelineStrip";
import { ActiveDownloadsBanner } from "../components/ActiveDownloadsBanner";
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
    if (!project) return;
    if (project.broll_points.length === 0) return;
    const next = project.broll_points.findIndex((p) => p.status !== "done" && p.status !== "skipped");
    if (next === -1) {
      nav("/summary");
      return;
    }
    setCurrentIndex(next);
  }, [project?.slug]);

  useEffect(() => {
    if (!point) return;
    setSelected(null);
    if (searchResults[point.id]) return;
    runSearch(activeKeyword, point.id);
  }, [point?.id, activeKeyword]);

  // Prefetch search for the next 2 points so they're ready when user advances
  useEffect(() => {
    if (!project) return;
    const PREFETCH_COUNT = 2;
    for (let i = 1; i <= PREFETCH_COUNT; i++) {
      const idx = currentIndex + i;
      const nextPoint = project.broll_points[idx];
      if (!nextPoint) break;
      if (nextPoint.status === "done" || nextPoint.status === "skipped") continue;
      if (searchResults[nextPoint.id]) continue; // already cached

      const kw = editedKeywords[nextPoint.id] ?? nextPoint.active_keyword;
      if (!kw) continue;

      // fire-and-forget prefetch (non blocca UI)
      ipc.searchRun(kw)
        .then((results) => setSearchResults(nextPoint.id, results))
        .catch((e) => console.warn("prefetch failed for point", nextPoint.id, e));
    }
  }, [currentIndex, project?.slug]);

  useEffect(() => {
    const offComplete = events.onDownloadComplete((e) => {
      const filename = e.output.split("/").pop() || "clip";
      toast.success(`Clip ready: ${filename}`);
    });
    return () => { offComplete.then((f) => f()); };
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
    // Fire-and-forget: download runs in background, advance UI immediately
    toast.info(`Downloading: ${selected.title.slice(0, 50)}…`);
    ipc.pickVideo(point.id, selected).catch((e) => {
      console.error("pickVideo failed:", e);
      toast.error(`Download failed: ${String(e)}`);
    });
    goNext();
  };

  const onPause = () => {
    if (!point) return;
    ipc.cancelDownload(point.id, false).catch((e) =>
      toast.error(`Pause failed: ${String(e)}`),
    );
  };
  const onStop = () => {
    if (!point) return;
    ipc.cancelDownload(point.id, true).catch((e) =>
      toast.error(`Stop failed: ${String(e)}`),
    );
  };
  const onResume = () => {
    if (!point || !point.selected_video) return;
    toast.info(`Resuming: ${point.selected_video.title.slice(0, 50)}…`);
    ipc.pickVideo(point.id, point.selected_video).catch((e) =>
      toast.error(`Resume failed: ${String(e)}`),
    );
  };

  // While the current point is downloading or paused, lock down navigation
  // mutations so the user can't accidentally clobber state mid-flight.
  const locked = point ? (point.status === "downloading" || point.status === "paused") : false;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!project || !point) return;
      const results = searchResults[point.id] || [];
      // Block keys that would mutate selection / status while busy. Arrow-left
      // stays available so the user can navigate back without aborting.
      if (locked && (e.key >= "1" && e.key <= "9")) return;
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
  }, [point?.id, selected, searchResults, currentIndex, locked]);

  if (!project) return <div className="p-8">No project loaded.</div>;
  if (!point) return <div className="p-8">No B-Roll point at index {currentIndex}.</div>;

  const results = searchResults[point.id] || [];
  // While downloading or paused, the preview pane should reflect the picked
  // video (so Pause/Stop/Resume buttons line up with what's actually in
  // flight), not whatever was last clicked in the grid.
  const previewCandidate = locked ? point.selected_video : selected;

  return (
    <div className="flex flex-col h-screen">
      <ActiveDownloadsBanner points={project.broll_points} />
      <KeywordHeader
        keyword={activeKeyword}
        phrase={point.phrase}
        current={currentIndex}
        total={project.broll_points.length}
        onPrev={goPrev}
        onSkip={skipCurrent}
        onChange={onChangeKeyword}
        disabled={locked}
      />
      <PointStatusBar point={point} download={downloads[point.id]} />
      <main className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {searchErr ? <p className="p-8 text-red-600">{searchErr}</p> : null}
          {!searchResults[point.id] && !searchErr ? <p className="p-8 text-muted-foreground">Searching YouTube…</p> : null}
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
        <aside className="w-[420px] border-l border-border">
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
    </div>
  );
}
