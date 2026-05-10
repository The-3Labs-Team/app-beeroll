import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useStore } from "../store";
import type { Project, VideoCandidate, DownloadProgressEvent } from "../types";

interface RenderOptions {
  route?: string;
  path?: string;
  project?: Project | null;
  currentIndex?: number;
  searchResults?: Record<string, VideoCandidate[]>;
  downloads?: Record<string, DownloadProgressEvent>;
}

export function resetStore(options: RenderOptions = {}) {
  useStore.setState({
    project: options.project ?? null,
    currentIndex: options.currentIndex ?? 0,
    searchResults: options.searchResults ?? {},
    downloads: options.downloads ?? {},
  });
}

export function renderWithRouter(
  ui: ReactElement,
  options: RenderOptions = {},
) {
  resetStore(options);
  const route = options.route ?? "/";
  const path = options.path ?? route;
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path={path} element={ui} />
        <Route path="/projects" element={<div>Projects route</div>} />
        <Route path="/import" element={<div>Import route</div>} />
        <Route path="/review" element={<div>Review route</div>} />
        <Route path="/picker" element={<div>Picker route</div>} />
        <Route path="/summary" element={<div>Summary route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
