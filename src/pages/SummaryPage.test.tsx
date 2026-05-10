import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { makePoint, makeProject, makeVideoCandidate } from "../test-utils/factories";
import { renderWithRouter } from "../test-utils/render";

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

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { save } from "@tauri-apps/plugin-dialog";
import { ipc } from "../ipc";
import { SummaryPage } from "./SummaryPage";

function summaryProject() {
  return makeProject({
    broll_points: [
      makePoint({
        id: "bp_01",
        status: "done",
        phrase: "Done clip",
        selected_video: makeVideoCandidate({ title: "Done video" }),
        output_clip: "clips/0001_done.mp4",
      }),
      makePoint({ id: "bp_02", status: "skipped", phrase: "Skipped clip" }),
    ],
  });
}

describe("SummaryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ipc.projectSize as any).mockResolvedValue(1048576);
    (ipc.openProjectFolder as any).mockResolvedValue(undefined);
    (ipc.exportEdl as any).mockResolvedValue(undefined);
    (ipc.exportFcpxml as any).mockResolvedValue(undefined);
  });

  test("renders done, skipped, project size, and opens folder", async () => {
    const project = summaryProject();

    renderWithRouter(<SummaryPage />, { route: "/summary", project });

    expect(screen.getByText(/1 clip/i)).toBeInTheDocument();
    expect(screen.getByText(/1 saltati/i)).toBeInTheDocument();
    expect(await screen.findByText(/1(?:\.0)? MB su disco/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Apri cartella" }));

    expect(ipc.openProjectFolder).toHaveBeenCalledWith(project.slug);
  });

  test("exports EDL and FCPXML using save dialog paths", async () => {
    (save as any)
      .mockResolvedValueOnce("/tmp/Test Project.edl")
      .mockResolvedValueOnce("/tmp/Test Project.fcpxml");

    renderWithRouter(<SummaryPage />, { route: "/summary", project: summaryProject() });

    fireEvent.click(screen.getByRole("button", { name: "Esporta EDL" }));
    await waitFor(() =>
      expect(ipc.exportEdl).toHaveBeenCalledWith("/tmp/Test Project.edl"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Esporta FCPXML" }));
    await waitFor(() =>
      expect(ipc.exportFcpxml).toHaveBeenCalledWith("/tmp/Test Project.fcpxml"),
    );
  });
});
