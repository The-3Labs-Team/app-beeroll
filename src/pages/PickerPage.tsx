import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ipc, events } from "../ipc";
import { useStore } from "../store";
import { KeywordHeader } from "../components/KeywordHeader";
import { VideoGrid } from "../components/VideoGrid";
import { PreviewPane } from "../components/PreviewPane";
import { TimelineStrip } from "../components/TimelineStrip";
import type { VideoCandidate } from "../types";

export function PickerPage() {
  const nav = useNavigate();
  const project = useStore((s) => s.project);
  const currentIndex = useStore((s) => s.currentIndex);
  const setCurrentIndex = useStore((s) => s.setCurrentIndex);
  const searchResults = useStore((s) => s.searchResults);
  const setSearchResults = useStore((s) => s.setSearchResults);

  const [selected, setSelected] = useState<VideoCandidate | null>(null);
  const [busy, setBusy] = useState(false);
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

  useEffect(() => {
    const off = events.onDownloadComplete(() => {
      goNext();
    });
    return () => { off.then((f) => f()); };
  }, [currentIndex]);

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

  const commitSelected = async () => {
    if (!point || !selected) return;
    setBusy(true);
    try {
      await ipc.pickVideo(point.id, selected);
    } catch (e) {
      console.error(e);
      alert(String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!project || !point) return;
      const results = searchResults[point.id] || [];
      if (e.key >= "1" && e.key <= "9") {
        const i = parseInt(e.key) - 1;
        if (results[i]) setSelected(results[i]);
      } else if (e.key === "Enter") commitSelected();
      else if (e.key === "ArrowRight") skipCurrent();
      else if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [point?.id, selected, searchResults, currentIndex]);

  if (!project) return <div className="p-8">No project loaded.</div>;
  if (!point) return <div className="p-8">No B-Roll point at index {currentIndex}.</div>;

  const results = searchResults[point.id] || [];

  return (
    <div className="flex flex-col h-screen">
      <KeywordHeader
        keyword={activeKeyword}
        current={currentIndex}
        total={project.broll_points.length}
        onPrev={goPrev}
        onSkip={skipCurrent}
        onChange={onChangeKeyword}
      />
      <main className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {searchErr ? <p className="p-8 text-red-600">{searchErr}</p> : null}
          {!searchResults[point.id] && !searchErr ? <p className="p-8 text-muted-foreground">Searching YouTube…</p> : null}
          {results.length > 0 && (
            <VideoGrid
              results={results}
              selectedId={selected?.video_id ?? null}
              onSelect={setSelected}
            />
          )}
        </div>
        <aside className="w-[420px] border-l border-border">
          <PreviewPane candidate={selected} onCommit={commitSelected} busy={busy} />
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
