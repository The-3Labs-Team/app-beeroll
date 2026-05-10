import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { makePoint, makeProject } from "../test-utils/factories";
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

import { ipc } from "../ipc";
import { ReviewPage } from "./ReviewPage";

describe("ReviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders existing B-Roll points and starts picker", async () => {
    const project = makeProject({
      broll_points: [
        makePoint({ id: "bp_01", active_keyword: "city sunrise", keywords: ["city sunrise"] }),
        makePoint({ id: "bp_02", active_keyword: "coffee closeup", keywords: ["coffee closeup"] }),
      ],
    });

    renderWithRouter(<ReviewPage />, { route: "/review", project });

    expect(await screen.findByText("2 punti B-Roll trovati")).toBeInTheDocument();
    expect(screen.getByText("city sunrise")).toBeInTheDocument();
    expect(screen.getByText("coffee closeup")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Inizia a scegliere video/i }));

    expect(screen.getByText("Picker route")).toBeInTheDocument();
  });

  test("runs extraction for text project without B-Roll points", async () => {
    const project = makeProject({ broll_points: [] });
    const finalProject = makeProject({
      slug: project.slug,
      broll_points: [
        makePoint({ id: "bp_01", active_keyword: "final keyword", keywords: ["final keyword"] }),
      ],
    });
    (ipc.extractionRun as any).mockResolvedValue(finalProject.broll_points);
    (ipc.projectLoad as any).mockResolvedValue(finalProject);

    renderWithRouter(<ReviewPage />, { route: "/review", project });

    await waitFor(() => expect(ipc.extractionRun).toHaveBeenCalled());
    expect(await screen.findByText("1 punti B-Roll trovati")).toBeInTheDocument();
    expect(screen.getByText("final keyword")).toBeInTheDocument();
  });

  test("shows error when extraction fails", async () => {
    const project = makeProject({ broll_points: [] });
    (ipc.extractionRun as any).mockRejectedValue(new Error("provider down"));

    renderWithRouter(<ReviewPage />, { route: "/review", project });

    expect(await screen.findByText(/provider down/i)).toBeInTheDocument();
  });
});
