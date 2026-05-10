import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { makeAiCliStatus, makeSettings } from "../test-utils/factories";
import { renderWithRouter } from "../test-utils/render";

vi.mock("../ipc", () => ({
  ipc: {
    settingsLoad: vi.fn(),
    aiCliStatus: vi.fn(),
    settingsSetAnthropicKey: vi.fn(),
    settingsSetOpenaiKey: vi.fn(),
    settingsSetGroqKey: vi.fn(),
    settingsSave: vi.fn(),
    settingsTestProvider: vi.fn(),
    settingsSetYoutubeKey: vi.fn(),
    settingsTestYoutube: vi.fn(),
    settingsSetPixabayKey: vi.fn(),
    settingsTestPixabay: vi.fn(),
    settingsSetPexelsKey: vi.fn(),
    settingsTestPexels: vi.fn(),
  },
}));

import { ipc } from "../ipc";
import { SettingsPage } from "./SettingsPage";

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ipc.settingsLoad as any).mockResolvedValue(makeSettings());
    (ipc.aiCliStatus as any).mockResolvedValue(makeAiCliStatus());
    (ipc.settingsSetAnthropicKey as any).mockResolvedValue(undefined);
    (ipc.settingsSetOpenaiKey as any).mockResolvedValue(undefined);
    (ipc.settingsSetGroqKey as any).mockResolvedValue(undefined);
    (ipc.settingsSave as any).mockResolvedValue(undefined);
    (ipc.settingsTestProvider as any).mockResolvedValue(true);
    (ipc.settingsSetYoutubeKey as any).mockResolvedValue(undefined);
    (ipc.settingsTestYoutube as any).mockResolvedValue(true);
    (ipc.settingsSetPixabayKey as any).mockResolvedValue(undefined);
    (ipc.settingsTestPixabay as any).mockResolvedValue(true);
    (ipc.settingsSetPexelsKey as any).mockResolvedValue(undefined);
    (ipc.settingsTestPexels as any).mockResolvedValue(true);
  });

  function renderSettings() {
    renderWithRouter(<SettingsPage />, { route: "/settings", path: "/settings" });
  }

  test("loads settings and AI CLI status", async () => {
    (ipc.settingsLoad as any).mockResolvedValue(makeSettings());
    (ipc.aiCliStatus as any).mockResolvedValue(makeAiCliStatus());

    renderSettings();

    expect(await screen.findByText("Impostazioni")).toBeInTheDocument();
    expect(screen.getByText("Provider AI")).toBeInTheDocument();
    expect(screen.getByText("Anthropic API")).toBeInTheDocument();
  });

  test("saves provider settings and shows verified state", async () => {
    renderSettings();

    fireEvent.change(
      await screen.findByPlaceholderText("sk-ant-... (lascia vuoto per mantenere)"),
      { target: { value: "sk-ant-test" } },
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Salva e testa" })[0]);

    await waitFor(() =>
      expect(ipc.settingsSetAnthropicKey).toHaveBeenCalledWith("sk-ant-test"),
    );
    expect(ipc.settingsSave).toHaveBeenCalledWith(makeSettings());
    expect(ipc.settingsTestProvider).toHaveBeenCalledWith("anthropic_api");
    expect(await screen.findByText(/Impostazioni verificate/)).toBeInTheDocument();
  });

  test("shows provider test error", async () => {
    (ipc.settingsTestProvider as any).mockResolvedValue(false);

    renderSettings();

    await screen.findByText("Provider AI");
    fireEvent.click(screen.getAllByRole("button", { name: "Salva e testa" })[0]);

    expect(
      await screen.findByText(
        /Impostazioni salvate, ma il test del provider non è riuscito\./,
      ),
    ).toBeInTheDocument();
  });

  test("saves and tests YouTube stock source key", async () => {
    renderSettings();

    const youtubeInput = await screen.findByPlaceholderText("API key YouTube (AIza…)");
    fireEvent.change(youtubeInput, { target: { value: "AIza-test" } });
    fireEvent.click(
      within(youtubeInput.closest("div")!).getByRole("button", {
        name: "Salva e testa",
      }),
    );

    await waitFor(() =>
      expect(ipc.settingsSetYoutubeKey).toHaveBeenCalledWith("AIza-test"),
    );
    expect(ipc.settingsTestYoutube).toHaveBeenCalled();
    expect(await screen.findByText(/Chiave salvata e verificata/)).toBeInTheDocument();
  });

  test("validates empty Pixabay key", async () => {
    renderSettings();

    const pixabayInput = await screen.findByPlaceholderText("API key Pixabay");
    fireEvent.click(
      within(pixabayInput.closest("div")!).getByRole("button", {
        name: "Salva e testa",
      }),
    );

    expect(await screen.findByText(/Inserisci la chiave/)).toBeInTheDocument();
  });

  test("custom model mode updates settings before save", async () => {
    renderSettings();

    fireEvent.click(await screen.findByRole("button", { name: /Impostazioni avanzate/ }));
    fireEvent.click(screen.getByLabelText("Scegli il modello manualmente"));
    fireEvent.change(screen.getByDisplayValue("claude-haiku-4-5"), {
      target: { value: "claude-opus-4-7" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Salva e testa" })[0]);

    await waitFor(() =>
      expect(ipc.settingsSave).toHaveBeenCalledWith(
        expect.objectContaining({
          model_preset: "custom",
          model_overrides: expect.objectContaining({
            anthropic_api: "claude-opus-4-7",
          }),
        }),
      ),
    );
  });
});
