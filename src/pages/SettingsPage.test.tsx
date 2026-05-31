import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { makeAiCliStatus, makeSettings, makeToolchainStatus } from "../test-utils/factories";
import { renderWithRouter } from "../test-utils/render";

vi.mock("../ipc", () => ({
  ipc: {
    settingsLoad: vi.fn(),
    settingsKeysPresent: vi.fn(),
    aiCliStatus: vi.fn(),
    toolchainStatus: vi.fn(),
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
    (ipc.settingsKeysPresent as any).mockResolvedValue({
      anthropic: false,
      openai: false,
      groq: false,
      youtube: false,
      pixabay: false,
      pexels: false,
    });
    (ipc.aiCliStatus as any).mockResolvedValue(makeAiCliStatus());
    (ipc.toolchainStatus as any).mockResolvedValue(makeToolchainStatus());
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

  function providerSection() {
    return screen.getByText("Provider AI").closest("section")!;
  }

  function providerSaveButton() {
    return within(providerSection()).getByRole("button", { name: "Salva e testa" });
  }

  test("loads settings and AI CLI status", async () => {
    (ipc.settingsLoad as any).mockResolvedValue(makeSettings());
    (ipc.aiCliStatus as any).mockResolvedValue({
      ...makeAiCliStatus(),
      claude: { found: true, path: "/usr/local/bin/claude", version: "1.2.3" },
    });

    renderSettings();

    expect(await screen.findByText("Impostazioni")).toBeInTheDocument();
    expect(screen.getByText("Provider AI")).toBeInTheDocument();
    expect(screen.getByText("Anthropic API")).toBeInTheDocument();
    expect(ipc.aiCliStatus).toHaveBeenCalled();
    expect(ipc.toolchainStatus).toHaveBeenCalled();
    expect(
      within(screen.getByText("Claude CLI").closest("label")!).getByText(/Rilevato/),
    ).toBeInTheDocument();
  });

  test("flags stored secrets with a 'Salvata' badge", async () => {
    (ipc.settingsKeysPresent as any).mockResolvedValue({
      anthropic: false,
      openai: false,
      groq: false,
      youtube: true,
      pixabay: false,
      pexels: false,
    });

    renderSettings();
    await screen.findByText("Impostazioni");

    const ytSection = screen
      .getByText("YouTube Data API v3")
      .closest<HTMLElement>("div.border-bee")!;
    expect(within(ytSection).getByText(/Salvata/)).toBeInTheDocument();

    // A source without a stored key reads "Nessuna chiave" instead.
    const pixabaySection = screen
      .getByText("Pixabay")
      .closest<HTMLElement>("div.border-bee")!;
    expect(within(pixabaySection).getByText(/Nessuna chiave/)).toBeInTheDocument();
  });

  test("shows an unsaved badge while typing a new key", async () => {
    renderSettings();
    await screen.findByText("Impostazioni");

    const input = screen.getByPlaceholderText("API key YouTube (AIza…)");
    fireEvent.change(input, { target: { value: "AIzaSomeNewKey" } });

    const ytSection = screen
      .getByText("YouTube Data API v3")
      .closest<HTMLElement>("div.border-bee")!;
    expect(within(ytSection).getByText(/Non salvata/)).toBeInTheDocument();
  });

  test("autofills binary path fields from detected tools when empty", async () => {
    (ipc.settingsLoad as any).mockResolvedValue(
      makeSettings({
        yt_dlp_path: null,
        claude_cli_path: null,
        codex_cli_path: null,
        antigravity_cli_path: null,
      }),
    );
    (ipc.aiCliStatus as any).mockResolvedValue({
      ...makeAiCliStatus(),
      claude: { found: true, path: "/usr/local/bin/claude", version: "1.2.3" },
      codex: { found: true, path: "/usr/local/bin/codex", version: "0.9.0" },
      antigravity: { found: true, path: "/usr/local/bin/antigravity", version: "0.3.0" },
    });
    (ipc.toolchainStatus as any).mockResolvedValue({
      ...makeToolchainStatus(),
      ytdlp: { found: true, path: "/usr/local/bin/yt-dlp", version: "2026.01.01" },
    });

    renderSettings();

    expect(await screen.findByDisplayValue("/usr/local/bin/yt-dlp")).toBeInTheDocument();
    expect(screen.getByDisplayValue("/usr/local/bin/claude")).toBeInTheDocument();
    expect(screen.getByDisplayValue("/usr/local/bin/codex")).toBeInTheDocument();
    expect(screen.getByDisplayValue("/usr/local/bin/antigravity")).toBeInTheDocument();
  });

  test("saves provider settings and shows verified state", async () => {
    renderSettings();

    fireEvent.change(
      await screen.findByPlaceholderText("sk-ant-... (lascia vuoto per mantenere)"),
      { target: { value: "sk-ant-test" } },
    );
    fireEvent.click(providerSaveButton());

    await waitFor(() =>
      expect(ipc.settingsSetAnthropicKey).toHaveBeenCalledWith("sk-ant-test"),
    );
    expect(ipc.settingsSave).toHaveBeenCalledWith(
      expect.objectContaining({
        ...makeSettings(),
        yt_dlp_path: "/tmp/yt-dlp",
      }),
    );
    expect(ipc.settingsTestProvider).toHaveBeenCalledWith("anthropic_api");
    expect(await screen.findByText(/Impostazioni verificate/)).toBeInTheDocument();
  });

  test("shows provider test error", async () => {
    (ipc.settingsTestProvider as any).mockResolvedValue(false);

    renderSettings();

    await screen.findByText("Provider AI");
    fireEvent.click(providerSaveButton());

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
    expect(ipc.settingsSetPixabayKey).not.toHaveBeenCalled();
    expect(ipc.settingsTestPixabay).not.toHaveBeenCalled();
  });

  test("custom model mode updates settings before save", async () => {
    renderSettings();

    fireEvent.click(await screen.findByRole("button", { name: /Impostazioni avanzate/ }));
    fireEvent.click(screen.getByLabelText("Scegli il modello manualmente"));
    fireEvent.change(screen.getByDisplayValue("claude-haiku-4-5"), {
      target: { value: "claude-opus-4-7" },
    });
    fireEvent.click(providerSaveButton());

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
