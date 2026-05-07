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
  setProject: (project) => set({ project }),
  setCurrentIndex: (currentIndex) => set({ currentIndex }),
  setSearchResults: (point_id, results) =>
    set((s) => ({ searchResults: { ...s.searchResults, [point_id]: results } })),
  setDownloadProgress: (e) =>
    set((s) => ({ downloads: { ...s.downloads, [e.point_id]: e } })),
}));
