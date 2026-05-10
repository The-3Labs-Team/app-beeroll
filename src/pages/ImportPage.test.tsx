import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useStore } from "../store";
import { makeProject } from "../test-utils/factories";
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
  open: vi.fn(),
}));

import { ipc } from "../ipc";
import { ImportPage } from "./ImportPage";

describe("ImportPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("validates project name before creating", () => {
    renderWithRouter(<ImportPage />, { route: "/import" });

    fireEvent.click(screen.getByRole("button", { name: /Crea ed estrai/i }));

    expect(screen.getByText(/Inserisci un nome progetto\./i)).toBeInTheDocument();
    expect(ipc.projectCreate).not.toHaveBeenCalled();
  });

  test("creates text project and navigates to review", async () => {
    const created = makeProject({ name: "Episode 12", slug: "episode-12" });
    (ipc.projectCreate as any).mockResolvedValue(created);

    renderWithRouter(<ImportPage />, { route: "/import" });

    fireEvent.click(screen.getByRole("tab", { name: "Trascrizione" }));
    fireEvent.change(screen.getByPlaceholderText("Episodio 12"), {
      target: { value: "  Episode 12  " },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Incolla qui la trascrizione del tuo episodio…"),
      { target: { value: "  Text voiceover  " } },
    );
    fireEvent.click(screen.getByRole("button", { name: /Crea ed estrai/i }));

    await waitFor(() =>
      expect(ipc.projectCreate).toHaveBeenCalledWith(
        "Episode 12",
        "Text voiceover",
        null,
      ),
    );
    expect(useStore.getState().project).toEqual(created);
    expect(screen.getByText("Review route")).toBeInTheDocument();
  });

  test("shows IPC error when project creation fails", async () => {
    (ipc.projectCreate as any).mockRejectedValue(new Error("disk full"));

    renderWithRouter(<ImportPage />, { route: "/import" });

    fireEvent.click(screen.getByRole("tab", { name: "Trascrizione" }));
    fireEvent.change(screen.getByPlaceholderText("Episodio 12"), {
      target: { value: "Episode 12" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Incolla qui la trascrizione del tuo episodio…"),
      { target: { value: "Text voiceover" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /Crea ed estrai/i }));

    expect(await screen.findByText(/disk full/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("Sto salvando la trascrizione e preparando il progetto.")).not.toBeInTheDocument(),
    );
  });
});
