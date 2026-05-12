import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useStore } from "../store";
import type { Project, VideoCandidate } from "../types";

// Mock IPC layer BEFORE importing PickerPage
vi.mock("../ipc", () => ({
  ipc: {
    searchRun: vi.fn(),
    searchRunExtras: vi.fn(),
    pickVideo: vi.fn(),
    skipPoint: vi.fn(),
    cancelDownload: vi.fn(),
    projectLoad: vi.fn(),
  },
  events: {
    onDownloadProgress: vi.fn(() => Promise.resolve(() => undefined)),
    onDownloadComplete: vi.fn(() => Promise.resolve(() => undefined)),
  },
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { ipc, events } from "../ipc";
import { PickerPage } from "./PickerPage";

const sampleVideo = (id: string, title: string): VideoCandidate => ({
  source: "youtube",
  video_id: id,
  title,
  channel: "Ch",
  duration_sec: 60,
  thumb_url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
  url: `https://www.youtube.com/watch?v=${id}`,
  stream_url: null,
});

const sampleProject = (): Project => ({
  version: 1,
  slug: "t",
  name: "Test",
  created_at: "2026-01-01T00:00:00Z",
  voiceover: { kind: "text", path: "voiceover.txt", duration_sec: null },
  transcript: [],
  broll_points: [
    {
      id: "bp_01",
      theme: "",
      phrase: "first",
      t_start: null,
      t_end: null,
      keywords: ["kw1"],
      active_keyword: "kw1",
      status: "pending",
      selected_video: null,
      output_clip: null,
      cached_results: [],
      cached_keyword: null,
    },
    {
      id: "bp_02",
      theme: "",
      phrase: "second",
      t_start: null,
      t_end: null,
      keywords: ["kw2"],
      active_keyword: "kw2",
      status: "pending",
      selected_video: null,
      output_clip: null,
      cached_results: [],
      cached_keyword: null,
    },
  ],
});

describe("PickerPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-stub the events listeners since clearAllMocks resets the
    // implementation; PickerPage's useEffect calls .then() on the result.
    (events.onDownloadProgress as any).mockImplementation(() =>
      Promise.resolve(() => undefined),
    );
    (events.onDownloadComplete as any).mockImplementation(() =>
      Promise.resolve(() => undefined),
    );
    (ipc.searchRunExtras as any).mockResolvedValue([]);
    (ipc.skipPoint as any).mockResolvedValue(undefined);
    (ipc.cancelDownload as any).mockResolvedValue(undefined);
    useStore.setState({
      project: sampleProject(),
      currentIndex: 0,
      searchResults: {},
      downloads: {},
    });
  });

  test("renders keyword header and triggers search on mount", async () => {
    (ipc.searchRun as any).mockResolvedValue([
      sampleVideo("aaa", "Vid A"),
      sampleVideo("bbb", "Vid B"),
    ]);
    render(
      <MemoryRouter>
        <PickerPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("kw1")).toBeInTheDocument();
    await waitFor(() => expect(ipc.searchRun).toHaveBeenCalledWith("kw1"));
  });

  test("clicking 'Download & use' calls pickVideo and advances", async () => {
    (ipc.searchRun as any).mockResolvedValue([sampleVideo("aaa", "Vid A")]);
    (ipc.pickVideo as any).mockResolvedValue("clips/0001_a.mp4");

    render(
      <MemoryRouter>
        <PickerPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(ipc.searchRun).toHaveBeenCalled());

    // Wait for results to render
    await waitFor(() => screen.getByText("Vid A"));

    // Click thumbnail to select
    const thumb = screen.getByText("Vid A").closest("button")!;
    await act(async () => {
      fireEvent.click(thumb);
    });

    // Click Scarica e usa (Italian Download & use)
    const downloadBtn = await screen.findByText(/Scarica e usa/i);
    await act(async () => {
      fireEvent.click(downloadBtn);
    });

    expect(ipc.pickVideo).toHaveBeenCalledWith(
      "bp_01",
      expect.objectContaining({ video_id: "aaa" }),
    );

    // Should advance to point 2
    await waitFor(() => {
      const state = useStore.getState();
      expect(state.currentIndex).toBe(1);
    });
  });

  test("toast error if pickVideo rejects", async () => {
    const { toast } = await import("sonner");
    (ipc.searchRun as any).mockResolvedValue([sampleVideo("aaa", "Vid A")]);
    (ipc.pickVideo as any).mockRejectedValue(new Error("yt-dlp failed"));

    render(
      <MemoryRouter>
        <PickerPage />
      </MemoryRouter>,
    );
    await waitFor(() => screen.getByText("Vid A"));

    const thumb = screen.getByText("Vid A").closest("button")!;
    await act(async () => {
      fireEvent.click(thumb);
    });

    const downloadBtn = await screen.findByText(/Scarica e usa/i);
    await act(async () => {
      fireEvent.click(downloadBtn);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("yt-dlp failed"),
      );
    });
  });

  test("skip calls skipPoint and advances", async () => {
    (ipc.searchRun as any).mockResolvedValue([sampleVideo("aaa", "Vid A")]);

    render(
      <MemoryRouter>
        <PickerPage />
      </MemoryRouter>,
    );

    await waitFor(() => screen.getByText("Vid A"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salta →" }));
    });

    expect(ipc.skipPoint).toHaveBeenCalledWith("bp_01");
    await waitFor(() => expect(useStore.getState().currentIndex).toBe(1));
  });

  test("editing keyword clears results and reruns search", async () => {
    (ipc.searchRun as any).mockImplementation(() => new Promise(() => {}));
    useStore.setState({
      project: sampleProject(),
      currentIndex: 0,
      searchResults: { bp_01: [sampleVideo("old", "Old result")] },
      downloads: {},
    });

    render(
      <MemoryRouter>
        <PickerPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText("kw1"));
    const input = screen.getByDisplayValue("kw1");
    fireEvent.change(input, { target: { value: "new search" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(useStore.getState().searchResults.bp_01).toEqual([]);
    expect(ipc.searchRun).toHaveBeenCalledWith("new search");
  });

  test("download complete event shows success toast", async () => {
    const { toast } = await import("sonner");
    let onComplete: ((e: { point_id: string; output: string }) => void) | undefined;
    (events.onDownloadComplete as any).mockImplementation((cb: typeof onComplete) => {
      onComplete = cb;
      return Promise.resolve(() => undefined);
    });
    (ipc.searchRun as any).mockResolvedValue([]);

    render(
      <MemoryRouter>
        <PickerPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(onComplete).toBeDefined());
    await act(async () => {
      onComplete?.({ point_id: "bp_01", output: "clips/0001_clip.mp4" });
    });

    expect(toast.success).toHaveBeenCalledWith("Clip pronta: 0001_clip.mp4");
  });
});
