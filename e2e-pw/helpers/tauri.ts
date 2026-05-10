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

    (window as Window & {
      __TAURI_INTERNALS__?: unknown;
      __TAURI_EVENT_PLUGIN_INTERNALS__?: unknown;
    }).__TAURI_INTERNALS__ = {
      transformCallback: (cb: unknown) => cb,
      invoke: async (cmd: string) => {
        if (cmd in responses) return responses[cmd];
        return null;
      },
    };
    (window as Window & {
      __TAURI_EVENT_PLUGIN_INTERNALS__?: unknown;
    }).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: () => {},
    };
  });
}
