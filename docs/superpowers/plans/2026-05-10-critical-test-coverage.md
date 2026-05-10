# Critical Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CI-friendly tests for the critical frontend, backend, and browser workflows without relying on external APIs, credentials, ffmpeg, yt-dlp, or interactive Keychain access.

**Architecture:** Use a test pyramid: Vitest covers React pages/components with mocked IPC, Rust tests cover backend behavior with fixture data and mock HTTP, and Playwright covers a few browser-level journeys with mocked Tauri APIs. Shared test factories and render helpers keep page tests small and consistent.

**Tech Stack:** React 19, Vitest 4, Testing Library, Playwright, Tauri 2 IPC mocks, Rust `cargo test`, `mockito`, `tempfile`, GitHub Actions.

---

## Scope Check

The design spans frontend tests, Rust tests, Playwright, and CI. This stays in one plan because all tasks serve one release goal: a CI-friendly critical-flow test suite. Each task below is independently testable and commit-sized.

## File Structure

- Create `src/test-utils/factories.ts`: typed fixtures for projects, B-Roll points, candidates, settings, toolchain status, and AI CLI status.
- Create `src/test-utils/render.tsx`: `renderWithRouter` and store reset helper for React tests.
- Modify `src/test-utils/mock-tauri.ts`: top-level Tauri module mocks, eliminating nested `vi.mock(...)` warnings.
- Create frontend test files beside the code they cover: `src/lib/utils.test.ts`, `src/components/*.test.tsx`, `src/pages/*.test.tsx`.
- Modify Rust test modules inline in `src-tauri/src/*.rs`, following existing project style.
- Create `e2e-pw/helpers/tauri.ts`: reusable Playwright Tauri boot mock.
- Modify `e2e-pw/timeline.spec.ts` and add one boot-state Playwright spec.
- Modify `playwright.config.ts`: start Vite automatically with `webServer`.
- Modify `.github/workflows/test.yml`: run Vitest coverage and Playwright Chromium in CI.

---

### Task 1: Frontend Test Utilities

**Files:**
- Create: `src/test-utils/factories.ts`
- Create: `src/test-utils/render.tsx`
- Modify: `src/test-utils/mock-tauri.ts`
- Verify: `src/pages/PickerPage.test.tsx`

- [ ] **Step 1: Replace `src/test-utils/mock-tauri.ts` with top-level mocks**

```ts
import { vi } from "vitest";

type Listener = (event: { payload: unknown }) => void;

export const tauriMock = vi.hoisted(() => {
  const responses = new Map<string, unknown>();
  const listeners = new Map<string, Set<Listener>>();

  const invoke = vi.fn((command: string) => {
    if (responses.has(command)) {
      const value = responses.get(command);
      return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
    }
    return Promise.reject(new Error(`mock missing for ${command}`));
  });

  const listen = vi.fn((event: string, cb: Listener) => {
    const set = listeners.get(event) ?? new Set<Listener>();
    set.add(cb);
    listeners.set(event, set);
    return Promise.resolve(() => set.delete(cb));
  });

  return {
    responses,
    listeners,
    invoke,
    listen,
    open: vi.fn(),
    save: vi.fn(),
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriMock.invoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: tauriMock.listen,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: tauriMock.open,
  save: tauriMock.save,
}));

export function setMockResponse(command: string, response: unknown) {
  tauriMock.responses.set(command, response);
}

export function clearMockResponses() {
  tauriMock.responses.clear();
  tauriMock.listeners.clear();
  tauriMock.invoke.mockClear();
  tauriMock.listen.mockClear();
  tauriMock.open.mockReset();
  tauriMock.save.mockReset();
}

export function emitTauriEvent(event: string, payload: unknown) {
  for (const cb of tauriMock.listeners.get(event) ?? []) {
    cb({ payload });
  }
}

export function mockTauri() {
  clearMockResponses();
}
```

- [ ] **Step 2: Create typed fixture factories**

Create `src/test-utils/factories.ts`:

```ts
import type {
  AiCliStatus,
  AppSettings,
  BRollPoint,
  FirstRunStatus,
  Project,
  ToolchainStatus,
  VideoCandidate,
  VideoSourceId,
} from "../types";

export function makeVideoCandidate(
  overrides: Partial<VideoCandidate> = {},
): VideoCandidate {
  const source = overrides.source ?? "youtube";
  const id = overrides.video_id ?? `${source}-001`;
  return {
    source,
    video_id: id,
    title: overrides.title ?? `${source} clip`,
    channel: overrides.channel ?? `${source} channel`,
    duration_sec: overrides.duration_sec ?? 90,
    thumb_url:
      overrides.thumb_url ??
      (source === "youtube"
        ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
        : `https://cdn.example.test/${id}.jpg`),
    url: overrides.url ?? `https://example.test/${source}/${id}`,
    stream_url: overrides.stream_url ?? null,
  };
}

export function makePoint(overrides: Partial<BRollPoint> = {}): BRollPoint {
  const id = overrides.id ?? "bp_01";
  return {
    id,
    theme: overrides.theme ?? "trail running",
    phrase: overrides.phrase ?? "A runner climbs a mountain trail.",
    t_start: overrides.t_start ?? null,
    t_end: overrides.t_end ?? null,
    keywords: overrides.keywords ?? ["trail running"],
    active_keyword: overrides.active_keyword ?? "trail running",
    status: overrides.status ?? "pending",
    selected_video: overrides.selected_video ?? null,
    output_clip: overrides.output_clip ?? null,
  };
}

export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    version: overrides.version ?? 1,
    slug: overrides.slug ?? "test-project",
    name: overrides.name ?? "Test Project",
    created_at: overrides.created_at ?? "2026-05-10T08:00:00Z",
    voiceover:
      overrides.voiceover ??
      { kind: "text", path: "voiceover.txt", duration_sec: null },
    transcript: overrides.transcript ?? [],
    broll_points:
      overrides.broll_points ??
      [
        makePoint({ id: "bp_01", active_keyword: "trail running" }),
        makePoint({
          id: "bp_02",
          theme: "gear closeups",
          phrase: "Hands tighten a backpack strap.",
          keywords: ["backpack closeup"],
          active_keyword: "backpack closeup",
        }),
      ],
  };
}

export function makeSettings(
  overrides: Partial<AppSettings> = {},
): AppSettings {
  return {
    selected_provider: overrides.selected_provider ?? "anthropic_api",
    anthropic_model: overrides.anthropic_model ?? "claude-sonnet-4-6",
    ollama_base_url: overrides.ollama_base_url ?? null,
    claude_cli_path: overrides.claude_cli_path ?? null,
    codex_cli_path: overrides.codex_cli_path ?? null,
    transcription_provider: overrides.transcription_provider ?? "groq_api",
    model_preset: overrides.model_preset ?? "balanced",
    model_overrides: overrides.model_overrides ?? {},
  };
}

export function makeToolchainStatus(
  found = true,
): ToolchainStatus {
  return {
    ytdlp: { found, path: found ? "/tmp/yt-dlp" : null, version: found ? "2026.01.01" : null },
    ffmpeg: { found, path: found ? "/tmp/ffmpeg" : null, version: found ? "7.0" : null },
  };
}

export function makeAiCliStatus(): AiCliStatus {
  return {
    claude: { found: false, path: null, version: null },
    codex: { found: false, path: null, version: null },
    ollama: { found: false, path: null, version: null },
  };
}

export function makeFirstRunStatus(
  overrides: Partial<FirstRunStatus> = {},
): FirstRunStatus {
  return {
    is_first_run: overrides.is_first_run ?? false,
    has_anthropic_key: overrides.has_anthropic_key ?? true,
    has_openai_key: overrides.has_openai_key ?? false,
    has_groq_key: overrides.has_groq_key ?? false,
    toolchain: overrides.toolchain ?? makeToolchainStatus(),
    ai_clis: overrides.ai_clis ?? makeAiCliStatus(),
  };
}

export function candidateFromSource(source: VideoSourceId, id: string) {
  return makeVideoCandidate({ source, video_id: id, title: `${source} ${id}` });
}
```

- [ ] **Step 3: Create router/store render helper**

Create `src/test-utils/render.tsx`:

```tsx
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
```

- [ ] **Step 4: Run existing frontend tests**

Run:

```bash
npm test
```

Expected: `2` test files pass, `5` tests pass, and the nested `vi.mock(...)` warning no longer appears.

- [ ] **Step 5: Commit**

```bash
git add src/test-utils/factories.ts src/test-utils/render.tsx src/test-utils/mock-tauri.ts
git commit -m "test: add frontend test utilities"
```

---

### Task 2: Utility And Filter Tests

**Files:**
- Create: `src/lib/utils.test.ts`
- Create: `src/components/FilterDialog.test.tsx`
- Verify: `src/lib/utils.ts`, `src/components/FilterDialog.tsx`

- [ ] **Step 1: Create utility tests**

Create `src/lib/utils.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { formatBytes, formatDuration, formatEtaIt, relativeTimeIt } from "./utils";

describe("utils", () => {
  test("formatDuration renders seconds, minutes, and hours", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(75)).toBe("1:15");
    expect(formatDuration(3661)).toBe("1:01:01");
    expect(formatDuration(-5)).toBe("0:00");
  });

  test("formatEtaIt renders empty, seconds, and minute ranges", () => {
    expect(formatEtaIt(null)).toBe("");
    expect(formatEtaIt(undefined)).toBe("");
    expect(formatEtaIt(45)).toBe("45s");
    expect(formatEtaIt(120)).toBe("2m");
    expect(formatEtaIt(125)).toBe("2m 5s");
  });

  test("formatBytes renders user-facing binary units", () => {
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1_572_864)).toBe("1.5 MB");
  });

  test("relativeTimeIt handles invalid, recent, yesterday, and old dates", () => {
    const now = new Date("2026-05-10T12:00:00Z");
    expect(relativeTimeIt("not-a-date", now)).toBe("—");
    expect(relativeTimeIt("2026-05-10T11:59:40Z", now)).toBe("Ora");
    expect(relativeTimeIt("2026-05-10T11:05:00Z", now)).toBe("55 min fa");
    expect(relativeTimeIt("2026-05-09T12:00:00Z", now)).toBe("Ieri");
    expect(relativeTimeIt("2026-05-03T12:00:00Z", now)).toBe("03/05");
  });
});
```

- [ ] **Step 2: Create filter tests**

Create `src/components/FilterDialog.test.tsx`:

```tsx
import { describe, expect, test } from "vitest";
import {
  DEFAULT_FILTERS,
  applyFilters,
  isFilterActive,
  type PickerFilters,
} from "./FilterDialog";
import { candidateFromSource } from "../test-utils/factories";

describe("FilterDialog helpers", () => {
  test("isFilterActive is false only for default filters", () => {
    expect(isFilterActive(DEFAULT_FILTERS)).toBe(false);
    expect(isFilterActive({ ...DEFAULT_FILTERS, duration: "short" })).toBe(true);
    expect(
      isFilterActive({
        ...DEFAULT_FILTERS,
        sources: { youtube: true, pixabay: false, pexels: true },
      }),
    ).toBe(true);
  });

  test("applyFilters filters by source and duration bucket", () => {
    const rows = [
      candidateFromSource("youtube", "yt-short"),
      candidateFromSource("pixabay", "px-medium"),
      candidateFromSource("pexels", "pe-long"),
    ].map((c, i) => ({
      ...c,
      duration_sec: [59, 120, 301][i],
    }));

    const filters: PickerFilters = {
      sources: { youtube: true, pixabay: false, pexels: true },
      duration: "long",
    };

    expect(applyFilters(rows, filters).map((r) => r.video_id)).toEqual([
      "pe-long",
    ]);
  });
});
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
npx vitest run src/lib/utils.test.ts src/components/FilterDialog.test.tsx
```

Expected: both new test files pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/utils.test.ts src/components/FilterDialog.test.tsx
git commit -m "test: cover utility and picker filter helpers"
```

---

### Task 3: Critical Component Tests

**Files:**
- Create: `src/components/VideoGrid.test.tsx`
- Create: `src/components/KeywordHeader.test.tsx`
- Create: `src/components/PointStatusBar.test.tsx`
- Verify: `src/components/VideoGrid.tsx`, `src/components/KeywordHeader.tsx`, `src/components/PointStatusBar.tsx`

- [ ] **Step 1: Add `VideoGrid` tests**

Create `src/components/VideoGrid.test.tsx` with tests named:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { VideoGrid } from "./VideoGrid";
import { candidateFromSource, makePoint } from "../test-utils/factories";
import { resetStore } from "../test-utils/render";

describe("VideoGrid", () => {
  test("renders empty state when no results exist", () => {
    resetStore();
    render(<VideoGrid results={[]} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText("Nessun risultato. Cambia keyword.")).toBeInTheDocument();
  });

  test("renders source badges and calls onSelect", () => {
    resetStore();
    const onSelect = vi.fn();
    const results = [
      candidateFromSource("youtube", "yt1"),
      candidateFromSource("pixabay", "px1"),
      candidateFromSource("pexels", "pe1"),
    ];
    render(<VideoGrid results={results} selectedId={null} onSelect={onSelect} />);
    expect(screen.getByText("YT")).toBeInTheDocument();
    expect(screen.getByText("PX")).toBeInTheDocument();
    expect(screen.getByText("PE")).toBeInTheDocument();
    fireEvent.click(screen.getByText("youtube yt1"));
    expect(onSelect).toHaveBeenCalledWith(results[0]);
  });

  test("shows download percent for picked downloading video", () => {
    const point = makePoint({
      id: "bp_dl",
      status: "downloading",
      selected_video: candidateFromSource("youtube", "yt1"),
    });
    resetStore({
      downloads: { bp_dl: { point_id: "bp_dl", percent: 42.4, eta_sec: 10 } },
    });
    render(
      <VideoGrid
        results={[point.selected_video!]}
        selectedId={null}
        pickedVideoId="yt1"
        pickedStatus="downloading"
        pickedPointId="bp_dl"
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("DOWNLOAD 42%")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Add `KeywordHeader` tests**

Create `src/components/KeywordHeader.test.tsx` with tests for render, edit commit, Escape cancel, disabled skip, and filter indicator:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { KeywordHeader } from "./KeywordHeader";

function renderHeader(overrides = {}) {
  const props = {
    keyword: "trail running",
    theme: "outdoor sport",
    phrase: "A runner climbs a mountain trail.",
    current: 0,
    total: 3,
    onPrev: vi.fn(),
    onSkip: vi.fn(),
    onFilter: vi.fn(),
    filterActive: true,
    onChange: vi.fn(),
    ...overrides,
  };
  render(<KeywordHeader {...props} />);
  return props;
}

describe("KeywordHeader", () => {
  test("renders keyword, theme, phrase, and progress", () => {
    renderHeader();
    expect(screen.getByText("trail running")).toBeInTheDocument();
    expect(screen.getByText("outdoor sport")).toBeInTheDocument();
    expect(screen.getByText("A runner climbs a mountain trail.")).toBeInTheDocument();
    expect(screen.getByText("01/03")).toBeInTheDocument();
  });

  test("commits edited keyword on Enter", () => {
    const props = renderHeader();
    fireEvent.click(screen.getByText("trail running"));
    const input = screen.getByDisplayValue("trail running");
    fireEvent.change(input, { target: { value: "mountain race" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onChange).toHaveBeenCalledWith("mountain race");
  });

  test("does not edit or skip when disabled", () => {
    const props = renderHeader({ disabled: true });
    fireEvent.click(screen.getByText("trail running"));
    expect(screen.queryByDisplayValue("trail running")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Salta →"));
    expect(props.onSkip).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Add `PointStatusBar` tests**

Create `src/components/PointStatusBar.test.tsx` with tests for hidden pending, downloading ETA, done filename, skipped, and error states:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { PointStatusBar } from "./PointStatusBar";
import { candidateFromSource, makePoint } from "../test-utils/factories";

describe("PointStatusBar", () => {
  test("hides pending points", () => {
    const { container } = render(
      <PointStatusBar point={makePoint({ status: "pending" })} download={undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("renders downloading percent and ETA", () => {
    render(
      <PointStatusBar
        point={makePoint({
          status: "downloading",
          selected_video: candidateFromSource("youtube", "yt1"),
        })}
        download={{ point_id: "bp_01", percent: 33.6, eta_sec: 75 }}
      />,
    );
    expect(screen.getByText("Download 34%")).toBeInTheDocument();
    expect(screen.getByText("ETA 1m 15s")).toBeInTheDocument();
  });

  test("renders done filename, skipped state, and error state", () => {
    const done = makePoint({
      status: "done",
      output_clip: "clips/0001_final.mp4",
      selected_video: candidateFromSource("youtube", "yt1"),
    });
    const { rerender } = render(<PointStatusBar point={done} download={undefined} />);
    expect(screen.getByText("Clip pronta per questo punto")).toBeInTheDocument();
    expect(screen.getByText("0001_final.mp4")).toBeInTheDocument();

    rerender(<PointStatusBar point={makePoint({ status: "skipped" })} download={undefined} />);
    expect(screen.getByText("Saltato")).toBeInTheDocument();

    rerender(<PointStatusBar point={makePoint({ status: "error" })} download={undefined} />);
    expect(screen.getByText("Errore — download fallito")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run component tests**

Run:

```bash
npx vitest run src/components/VideoGrid.test.tsx src/components/KeywordHeader.test.tsx src/components/PointStatusBar.test.tsx
```

Expected: all component tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/VideoGrid.test.tsx src/components/KeywordHeader.test.tsx src/components/PointStatusBar.test.tsx
git commit -m "test: cover critical picker components"
```

---

### Task 4: Page Flow Vitest Tests

**Files:**
- Create: `src/pages/ProjectsPage.test.tsx`
- Create: `src/pages/ImportPage.test.tsx`
- Create: `src/pages/ReviewPage.test.tsx`
- Create: `src/pages/SummaryPage.test.tsx`
- Modify: `src/pages/PickerPage.test.tsx`

- [ ] **Step 1: Add shared page IPC mock pattern**

At the top of each page test file that imports a page using `../ipc`, use this pattern with page-specific mock implementations:

```ts
import { vi } from "vitest";

vi.mock("../ipc", () => ({
  ipc: {
    projectCreate: vi.fn(),
    projectLoad: vi.fn(),
    projectList: vi.fn(),
    projectDelete: vi.fn(),
    projectSize: vi.fn(),
    openProjectFolder: vi.fn(),
    extractionRun: vi.fn(),
    transcriptionRun: vi.fn(),
    exportEdl: vi.fn(),
    exportFcpxml: vi.fn(),
    toolchainWaitReady: vi.fn(),
  },
  events: {
    onProjectUpdated: vi.fn(() => Promise.resolve(() => undefined)),
    onTranscriptionProgress: vi.fn(() => Promise.resolve(() => undefined)),
  },
}));
```

Page tests may omit unused functions from the mock only after the focused test command proves the page imports successfully.

- [ ] **Step 2: Create `ProjectsPage.test.tsx`**

Cover these test names and assertions:

```tsx
test("renders empty state and navigates to import", async () => {
  (ipc.projectList as any).mockResolvedValue([]);
  (ipc.toolchainWaitReady as any).mockResolvedValue(true);
  renderWithRouter(<ProjectsPage />, { route: "/projects", path: "/projects" });
  expect(await screen.findByText("Nessun progetto")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Crea progetto"));
  expect(await screen.findByText("Import route")).toBeInTheDocument();
});

test("loads project and sends empty project to review", async () => {
  const project = makeProject({ broll_points: [] });
  (ipc.projectList as any).mockResolvedValue([project]);
  (ipc.projectLoad as any).mockResolvedValue(project);
  (ipc.projectSize as any).mockResolvedValue(1024);
  (ipc.toolchainWaitReady as any).mockResolvedValue(true);
  renderWithRouter(<ProjectsPage />, { route: "/projects", path: "/projects" });
  fireEvent.click(await screen.findByText(project.name));
  expect(await screen.findByText("Review route")).toBeInTheDocument();
});

test("deletes a project after confirmation", async () => {
  const project = makeProject();
  (ipc.projectList as any).mockResolvedValue([project]);
  (ipc.projectDelete as any).mockResolvedValue(undefined);
  (ipc.projectSize as any).mockResolvedValue(1024);
  (ipc.toolchainWaitReady as any).mockResolvedValue(true);
  renderWithRouter(<ProjectsPage />, { route: "/projects", path: "/projects" });
  expect(await screen.findByText(project.name)).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText(`Elimina ${project.name}`));
  fireEvent.click(screen.getByText("Elimina"));
  await waitFor(() => expect(ipc.projectDelete).toHaveBeenCalledWith(project.slug));
  expect(screen.queryByText(project.name)).not.toBeInTheDocument();
});
```

Use `makeProject({ broll_points: [] })`, `renderWithRouter(<ProjectsPage />, { route: "/projects", path: "/projects" })`, `screen.findByText`, and `fireEvent.click`.

- [ ] **Step 3: Create `ImportPage.test.tsx`**

Cover:

```tsx
test("validates project name before creating", async () => {
  // Render ImportPage, click "Crea ed estrai", assert "Inserisci un nome progetto."
});

test("creates text project and navigates to review", async () => {
  // Click "Trascrizione", fill "Nome progetto" and textarea, mock projectCreate.
  // Assert projectCreate called with trimmed name, trimmed text, null audio path.
  // Assert store project equals created project and "Review route" appears.
});

test("shows IPC error when project creation fails", async () => {
  // projectCreate rejects Error("disk full").
  // Assert "disk full" appears and busy overlay clears.
});
```

- [ ] **Step 4: Create `ReviewPage.test.tsx`**

Cover:

```tsx
test("renders existing B-Roll points and starts picker", async () => {
  // Store project with two points.
  // Assert "2 punti B-Roll trovati", keywords, and click "Inizia a scegliere video".
  // Assert "Picker route" appears.
});

test("runs extraction for text project without B-Roll points", async () => {
  // Store project with broll_points [].
  // extractionRun resolves, projectLoad resolves project with points.
  // Assert extractionRun called and final points render.
});

test("shows error when extraction fails", async () => {
  // extractionRun rejects Error("provider down").
  // Assert "provider down" appears.
});
```

- [ ] **Step 5: Create `SummaryPage.test.tsx`**

Cover:

```tsx
test("renders done, skipped, project size, and opens folder", async () => {
  // Store project with one done point and one skipped point.
  // projectSize resolves 1048576.
  // Assert "1 clip", "1 saltati", "1 MB su disco".
  // Click "Apri cartella" and assert openProjectFolder called.
});

test("exports EDL and FCPXML using save dialog paths", async () => {
  // Mock @tauri-apps/plugin-dialog save through mock-tauri helper.
  // Click "Esporta EDL", assert exportEdl called with returned path.
  // Click "Esporta FCPXML", assert exportFcpxml called.
});
```

- [ ] **Step 6: Extend `PickerPage.test.tsx`**

Add tests named:

```tsx
test("skip calls skipPoint and advances", async () => {
  // Render with two points and search results.
  // Click "Salta →".
  // Assert ipc.skipPoint called with "bp_01" and currentIndex is 1.
});

test("editing keyword clears results and reruns search", async () => {
  // Render with current point and cached results.
  // Click keyword, type "new search", press Enter.
  // Assert ipc.searchRun called with "new search".
});

test("download complete event shows success toast", async () => {
  // Capture the callback passed to events.onDownloadComplete.
  // Invoke it with output "clips/0001_clip.mp4".
  // Assert toast.success called with "Clip pronta: 0001_clip.mp4".
});
```

- [ ] **Step 7: Run page tests**

Run:

```bash
npx vitest run src/pages/ProjectsPage.test.tsx src/pages/ImportPage.test.tsx src/pages/ReviewPage.test.tsx src/pages/SummaryPage.test.tsx src/pages/PickerPage.test.tsx
```

Expected: all page tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/pages/ProjectsPage.test.tsx src/pages/ImportPage.test.tsx src/pages/ReviewPage.test.tsx src/pages/SummaryPage.test.tsx src/pages/PickerPage.test.tsx
git commit -m "test: cover critical page flows"
```

---

### Task 5: Settings Page Tests

**Files:**
- Create: `src/pages/SettingsPage.test.tsx`
- Verify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Create SettingsPage tests**

Create `src/pages/SettingsPage.test.tsx` covering these exact cases:

```tsx
test("loads settings and AI CLI status", async () => {
  // settingsLoad resolves makeSettings().
  // aiCliStatus resolves makeAiCliStatus().
  // Assert "Impostazioni", "Provider AI", and "Anthropic API".
});

test("saves provider settings and shows verified state", async () => {
  // Fill Anthropic key, click "Salva e testa".
  // settingsSetAnthropicKey, settingsSave, and settingsTestProvider resolve.
  // Assert settingsTestProvider called with "anthropic_api".
  // Assert "Impostazioni verificate".
});

test("shows provider test error", async () => {
  // settingsTestProvider resolves false.
  // Assert "Impostazioni salvate, ma il test del provider non è riuscito."
});

test("saves and tests YouTube stock source key", async () => {
  // Fill "API key YouTube (AIza…)", click its "Salva e testa".
  // Assert settingsSetYoutubeKey and settingsTestYoutube called.
  // Assert "Chiave salvata e verificata".
});

test("validates empty Pixabay key", async () => {
  // Click Pixabay "Salva e testa" with empty input.
  // Assert "Inserisci la chiave".
});

test("custom model mode updates settings before save", async () => {
  // Open "Impostazioni avanzate".
  // Check "Scegli il modello manualmente".
  // Change select to "claude-opus-4-7".
  // Save and assert settingsSave receives model_preset "custom" and override.
});
```

Use Testing Library role and label queries where available; fall back to visible text for custom styled controls.

- [ ] **Step 2: Run focused settings test**

Run:

```bash
npx vitest run src/pages/SettingsPage.test.tsx
```

Expected: all SettingsPage tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/pages/SettingsPage.test.tsx
git commit -m "test: cover settings provider flows"
```

---

### Task 6: Rust Critical Tests

**Files:**
- Modify: `src-tauri/src/settings_store.rs`
- Modify: `src-tauri/src/download_manager.rs`
- Modify: `src-tauri/src/search/youtube_api.rs`
- Modify: `src-tauri/src/search/mod.rs`

- [ ] **Step 1: Add settings model tests**

Append these tests to `src-tauri/src/settings_store.rs` inside the existing `mod tests`:

```rust
#[test]
fn preset_model_for_maps_known_provider_presets() {
    assert_eq!(
        preset_model_for("fast", "anthropic_api"),
        Some("claude-haiku-4-5")
    );
    assert_eq!(
        preset_model_for("balanced", "openai_api"),
        Some("gpt-4o")
    );
    assert_eq!(
        preset_model_for("accurate", "ollama"),
        Some("llama3.1:70b")
    );
    assert_eq!(preset_model_for("balanced", "claude_cli"), None);
    assert_eq!(preset_model_for("unknown", "anthropic_api"), None);
}

#[test]
fn resolved_model_prefers_custom_override() {
    let mut settings = AppSettings::default();
    settings.model_preset = "custom".into();
    settings
        .model_overrides
        .insert("anthropic_api".into(), "claude-opus-4-7".into());

    assert_eq!(
        settings.resolved_model("anthropic_api"),
        Some("claude-opus-4-7".to_string())
    );
    assert_eq!(settings.resolved_model("openai_api"), None);
}

#[test]
fn legacy_settings_default_model_fields_are_populated() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("settings.json");
    let legacy = r#"{
        "selected_provider": "anthropic_api",
        "anthropic_model": "claude-sonnet-4-6",
        "ollama_base_url": null,
        "claude_cli_path": null,
        "codex_cli_path": null
    }"#;
    std::fs::write(&path, legacy).unwrap();
    let loaded = SettingsStore::load_settings_at(&path).unwrap();
    assert_eq!(loaded.model_preset, "balanced");
    assert!(loaded.model_overrides.is_empty());
    assert_eq!(
        loaded.resolved_model("anthropic_api"),
        Some("claude-sonnet-4-6".to_string())
    );
}
```

- [ ] **Step 2: Add download progress edge tests**

Append these tests to `src-tauri/src/download_manager.rs` inside `mod tests`:

```rust
#[test]
fn parse_progress_handles_hour_minute_second_eta() {
    let p = parse_progress("[download] 100.0% of 99.0MiB at 2.0MiB/s ETA 01:02:03").unwrap();
    assert!((p.percent - 100.0).abs() < 0.01);
    assert_eq!(p.eta_sec, Some(3723));
}

#[test]
fn parse_progress_handles_missing_eta() {
    let p = parse_progress("[download]  7.5% of 1.0MiB at 200.0KiB/s").unwrap();
    assert!((p.percent - 7.5).abs() < 0.01);
    assert_eq!(p.eta_sec, None);
}

#[test]
fn parse_progress_rejects_malformed_percent() {
    assert!(parse_progress("[download] nope% of 1.0MiB ETA 00:01").is_none());
}
```

- [ ] **Step 3: Add YouTube API response tests**

Append these tests to `src-tauri/src/search/youtube_api.rs` inside `mod tests`:

```rust
use crate::search::VideoSource;

#[tokio::test]
async fn search_uses_search_results_and_duration_batch() {
    let mut server = mockito::Server::new_async().await;
    let search = server
        .mock("GET", "/search")
        .match_query(mockito::Matcher::AllOf(vec![
            mockito::Matcher::UrlEncoded("part".into(), "snippet".into()),
            mockito::Matcher::UrlEncoded("type".into(), "video".into()),
            mockito::Matcher::UrlEncoded("maxResults".into(), "2".into()),
            mockito::Matcher::UrlEncoded("q".into(), "trail".into()),
            mockito::Matcher::UrlEncoded("key".into(), "test-key".into()),
        ]))
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(r#"{
            "items": [{
                "id": { "videoId": "abc123" },
                "snippet": {
                    "title": "Trail clip",
                    "channelTitle": "Runner Channel",
                    "thumbnails": { "medium": { "url": "https://img.example/abc.jpg" } }
                }
            }]
        }"#)
        .create_async()
        .await;
    let videos = server
        .mock("GET", "/videos")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(r#"{
            "items": [{
                "id": "abc123",
                "contentDetails": { "duration": "PT1M05S" }
            }]
        }"#)
        .create_async()
        .await;

    let source = YouTubeApiSource::new("test-key".into()).with_base_url(server.url());
    let results = source.search("trail", 2).await.unwrap();

    search.assert_async().await;
    videos.assert_async().await;
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].video_id, "abc123");
    assert_eq!(results[0].duration_sec, 65);
    assert_eq!(results[0].source, crate::domain::VideoSourceId::Youtube);
}

#[tokio::test]
async fn search_defaults_duration_when_videos_call_fails() {
    let mut server = mockito::Server::new_async().await;
    server
        .mock("GET", "/search")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(r#"{
            "items": [{
                "id": { "videoId": "abc123" },
                "snippet": {
                    "title": "Trail clip",
                    "channelTitle": "Runner Channel",
                    "thumbnails": {}
                }
            }]
        }"#)
        .create_async()
        .await;
    server
        .mock("GET", "/videos")
        .with_status(500)
        .with_body("quota problem")
        .create_async()
        .await;

    let source = YouTubeApiSource::new("test-key".into()).with_base_url(server.url());
    let results = source.search("trail", 2).await.unwrap();

    assert_eq!(results[0].duration_sec, 0);
    assert!(results[0].thumb_url.contains("hqdefault.jpg"));
}
```

- [ ] **Step 4: Add multi-source aggregation edge test**

Append this test to `src-tauri/src/search/mod.rs` inside `mod tests`:

```rust
#[tokio::test]
async fn passes_per_source_limit_to_each_source() {
    struct LimitSource(VideoSourceId);

    #[async_trait]
    impl VideoSource for LimitSource {
        fn id(&self) -> VideoSourceId {
            self.0.clone()
        }

        async fn search(&self, _kw: &str, limit: u8) -> AppResult<Vec<VideoCandidate>> {
            Ok(vec![cand(self.0.clone(), &format!("limit-{limit}"))])
        }
    }

    let agg = MultiSourceSearch::new(vec![
        Arc::new(LimitSource(VideoSourceId::Youtube)),
        Arc::new(LimitSource(VideoSourceId::Pexels)),
    ]);
    let result = agg.search("k", 4).await;
    let ids: Vec<&str> = result.iter().map(|c| c.video_id.as_str()).collect();
    assert_eq!(ids, vec!["limit-4", "limit-4"]);
}
```

- [ ] **Step 5: Run focused Rust tests**

Run:

```bash
PATH="$HOME/.cargo/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml settings_store
PATH="$HOME/.cargo/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml download_manager
PATH="$HOME/.cargo/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml youtube_api
PATH="$HOME/.cargo/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml search::
```

Expected: focused Rust tests pass. If the local sandbox blocks mock HTTP, rerun the same command outside the sandbox.

- [ ] **Step 6: Run all Rust tests**

Run:

```bash
PATH="$HOME/.cargo/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: `73` or more tests pass, `0` fail, existing ignored tests remain ignored.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/settings_store.rs src-tauri/src/download_manager.rs src-tauri/src/search/youtube_api.rs src-tauri/src/search/mod.rs
git commit -m "test: cover critical Rust edge cases"
```

---

### Task 7: Playwright Mocked Browser Journeys

**Files:**
- Create: `e2e-pw/helpers/tauri.ts`
- Modify: `playwright.config.ts`
- Modify: `e2e-pw/timeline.spec.ts`
- Create: `e2e-pw/app-boot.spec.ts`

- [ ] **Step 1: Add Playwright webServer**

Modify `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-pw",
  fullyParallel: false,
  reporter: [["list"]],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://127.0.0.1:1420",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
```

- [ ] **Step 2: Extract Tauri mock helper**

Create `e2e-pw/helpers/tauri.ts`:

```ts
import type { Page } from "@playwright/test";

export async function mockTauri(page: Page) {
  await page.addInitScript(() => {
    const responses: Record<string, unknown> = {
      first_run_status: {
        is_first_run: false,
        has_anthropic_key: true,
        has_openai_key: false,
        has_groq_key: false,
        toolchain: {
          ytdlp: { found: true, path: null, version: null },
          ffmpeg: { found: true, path: null, version: null },
        },
        ai_clis: {
          claude: { found: false, path: null, version: null },
          codex: { found: false, path: null, version: null },
          ollama: { found: false, path: null, version: null },
        },
      },
      toolchain_wait_ready: true,
      toolchain_status: {
        ytdlp: { found: true, path: null, version: null },
        ffmpeg: { found: true, path: null, version: null },
      },
      toolchain_bootstrap: true,
      project_list: [],
      project_size: 0,
    };

    (window as any).__TAURI_INTERNALS__ = {
      transformCallback: (cb: unknown) => cb,
      invoke: async (cmd: string) => {
        if (cmd in responses) return responses[cmd];
        return null;
      },
    };
    (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: () => {},
    };
  });
}
```

- [ ] **Step 3: Update existing timeline spec**

Modify `e2e-pw/timeline.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { mockTauri } from "./helpers/tauri";
```

Remove the local `mockTauri` function from the file and keep the existing test body.

- [ ] **Step 4: Add app boot spec**

Create `e2e-pw/app-boot.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { mockTauri } from "./helpers/tauri";

test("app boots to projects empty state with Tauri mocked", async ({ page }) => {
  await mockTauri(page);
  await page.goto("/");
  await expect(page.getByText("Progetti")).toBeVisible();
  await expect(page.getByText("Nessun progetto")).toBeVisible();
  await expect(page.getByText("Crea progetto")).toBeVisible();
});
```

- [ ] **Step 5: Run Playwright**

Run:

```bash
npm run test:pw
```

Expected: both Playwright specs pass under Chromium. Vite starts through Playwright `webServer`.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e-pw/helpers/tauri.ts e2e-pw/timeline.spec.ts e2e-pw/app-boot.spec.ts
git commit -m "test: run mocked Playwright journeys"
```

---

### Task 8: CI Coverage And Playwright

**Files:**
- Modify: `.github/workflows/test.yml`
- Verify: `package.json`, `playwright.config.ts`

- [ ] **Step 1: Update Vitest CI step**

In `.github/workflows/test.yml`, replace:

```yaml
      - name: Vitest
        run: npx vitest run
```

with:

```yaml
      - name: Vitest coverage
        run: npm run test:coverage
```

- [ ] **Step 2: Add Playwright browser install steps**

After `Install frontend deps`, add:

```yaml
      - name: Install Playwright Chromium dependencies
        if: matrix.platform == 'ubuntu-latest'
        run: npx playwright install --with-deps chromium

      - name: Install Playwright Chromium
        if: matrix.platform != 'ubuntu-latest'
        run: npx playwright install chromium
```

- [ ] **Step 3: Add Playwright test step**

After `Vite build`, add:

```yaml
      - name: Playwright
        run: npm run test:pw
```

- [ ] **Step 4: Run local final verification**

Run:

```bash
npm run test:coverage
npm run test:pw
PATH="$HOME/.cargo/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml
npm run build
```

Expected:

- Vitest coverage passes and reports more than the old 21.9% line coverage.
- Playwright passes with Vite started automatically.
- Rust tests pass with existing ignored tests still ignored.
- Build exits successfully.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: run coverage and Playwright tests"
```

---

### Task 9: Final Audit

**Files:**
- Inspect: `git status --short`
- Inspect: `coverage/lcov.info`
- Inspect: `.github/workflows/test.yml`

- [ ] **Step 1: Confirm only intended files changed**

Run:

```bash
git status --short
```

Expected: no unstaged files from this plan remain. Existing unrelated user changes may still be present; do not stage or revert them.

- [ ] **Step 2: Record test counts**

Run:

```bash
npm run test:coverage
npm run test:pw
PATH="$HOME/.cargo/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: commands exit `0`. Copy the Vitest file/test count, coverage summary, Playwright spec count, and Rust pass/ignored count into the final response.

- [ ] **Step 3: Check CI workflow syntax by inspection**

Run:

```bash
sed -n '1,220p' .github/workflows/test.yml
```

Expected: Playwright install steps appear after `npm ci`, `npm run test:coverage` replaces plain Vitest, and `npm run test:pw` appears after build.

- [ ] **Step 4: Final response**

Report:

- Test areas added.
- Verification command results.
- Current coverage summary.
- Any warnings that remain, including whether Vitest mock hoisting warnings were removed.
