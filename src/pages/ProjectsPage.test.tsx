import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderWithRouter } from "../test-utils/render";
import { makeProject } from "../test-utils/factories";

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

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { ipc } from "../ipc";
import { ProjectsPage } from "./ProjectsPage";

describe("ProjectsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ipc.projectSize as any).mockResolvedValue(0);
    (ipc.toolchainWaitReady as any).mockResolvedValue(true);
  });

  test("renders empty state and navigates to import", async () => {
    (ipc.projectList as any).mockResolvedValue([]);

    renderWithRouter(<ProjectsPage />, { route: "/projects" });

    expect(await screen.findByText("Nessun progetto")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Crea progetto" }));

    expect(screen.getByText("Import route")).toBeInTheDocument();
  });

  test("loads project and sends empty project to review", async () => {
    const project = makeProject({ broll_points: [] });
    (ipc.projectList as any).mockResolvedValue([project]);
    (ipc.projectLoad as any).mockResolvedValue(project);
    (ipc.projectSize as any).mockResolvedValue(1024);

    renderWithRouter(<ProjectsPage />, { route: "/projects" });

    const title = await screen.findByText(project.name);
    fireEvent.click(title.closest("button")!);

    await waitFor(() => expect(ipc.projectLoad).toHaveBeenCalledWith(project.slug));
    expect(screen.getByText("Review route")).toBeInTheDocument();
  });

  test("deletes a project after confirmation", async () => {
    const project = makeProject({ name: "Delete Me", slug: "delete-me" });
    (ipc.projectList as any).mockResolvedValue([project]);
    (ipc.projectDelete as any).mockResolvedValue(undefined);

    renderWithRouter(<ProjectsPage />, { route: "/projects" });

    expect(await screen.findByText(project.name)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(`Elimina ${project.name}`));
    fireEvent.click(await screen.findByRole("button", { name: "Elimina" }));

    await waitFor(() => expect(ipc.projectDelete).toHaveBeenCalledWith(project.slug));
    await waitFor(() => expect(screen.queryByText(project.name)).not.toBeInTheDocument());
  });
});
