import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, test, expect, beforeEach } from "vitest";
import { useStore } from "../store";
import type { Project, VideoCandidate } from "../types";

// Mock IPC layer BEFORE importing PickerPage
vi.mock("../ipc", () => ({
  ipc: {
    searchRun: vi.fn(),
    pickVideo: vi.fn(),
    skipPoint: vi.fn(),
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
  video_id: id,
  title,
  channel: "Ch",
  duration_sec: 60,
  thumb_url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
  url: `https://www.youtube.com/watch?v=${id}`,
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
      phrase: "first",
      t_start: null,
      t_end: null,
      keywords: ["kw1"],
      active_keyword: "kw1",
      status: "pending",
      selected_video: null,
      output_clip: null,
    },
    {
      id: "bp_02",
      phrase: "second",
      t_start: null,
      t_end: null,
      keywords: ["kw2"],
      active_keyword: "kw2",
      status: "pending",
      selected_video: null,
      output_clip: null,
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

    // Click Download & use
    const downloadBtn = await screen.findByText(/Download & use/i);
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

    const downloadBtn = await screen.findByText(/Download & use/i);
    await act(async () => {
      fireEvent.click(downloadBtn);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("yt-dlp failed"),
      );
    });
  });
});
