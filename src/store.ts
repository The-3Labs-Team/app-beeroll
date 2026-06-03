import { create } from "zustand";
import type { Project, VideoCandidate, DownloadProgressEvent } from "./types";

interface State {
  project: Project | null;
  currentIndex: number;
  searchResults: Record<string, VideoCandidate[]>;
  downloads: Record<string, DownloadProgressEvent>;
  setProject: (p: Project | null) => void;
  setCurrentIndex: (i: number) => void;
  setSearchResults: (point_id: string, results: VideoCandidate[]) => void;
  setDownloadProgress: (e: DownloadProgressEvent) => void;
}

export const useStore = create<State>((set) => ({
  project: null,
  currentIndex: 0,
  searchResults: {},
  downloads: {},
  setProject: (project) =>
    set((s) => {
      // `searchResults`, `downloads` and `currentIndex` are keyed by / scoped to
      // the current project's point ids, but ids restart at `bp_01` for every
      // project. Switching to a different project (or clearing to null) must wipe
      // these transient maps — otherwise the new project's `bp_01`, `bp_02`… would
      // surface the previous project's cached search results and download state on
      // its overlapping points. Same-slug updates (polling refresh, `project:updated`
      // events) keep the maps intact so in-flight state isn't lost.
      if (project?.slug !== s.project?.slug) {
        return { project, searchResults: {}, downloads: {}, currentIndex: 0 };
      }
      return { project };
    }),
  setCurrentIndex: (currentIndex) => set({ currentIndex }),
  setSearchResults: (point_id, results) =>
    set((s) => ({ searchResults: { ...s.searchResults, [point_id]: results } })),
  setDownloadProgress: (e) =>
    set((s) => ({ downloads: { ...s.downloads, [e.point_id]: e } })),
}));

// Expose the store on window for E2E tests (Playwright). This is harmless in
// production: the app runs in a Tauri webview where there's no untrusted JS.
if (typeof window !== "undefined") {
  (window as unknown as { __STORE_FOR_TEST__: typeof useStore }).__STORE_FOR_TEST__ = useStore;
}
