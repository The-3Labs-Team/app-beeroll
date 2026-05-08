import { test, expect, Page } from "@playwright/test";

/**
 * Mocks the @tauri-apps/api invoke + listen modules + window internals so the
 * React app can boot at http://localhost:1420 without a Tauri runtime. We can
 * then poke the Zustand store directly to put it in any UI state we want and
 * assert against rendered DOM.
 */
async function mockTauri(page: Page) {
  await page.addInitScript(() => {
    // @ts-expect-error global stub
    window.__TAURI_INTERNALS__ = {
      transformCallback: (cb: unknown) => cb,
      invoke: async (cmd: string) => {
        if (cmd === "first_run_status") {
          return {
            is_first_run: false,
            has_anthropic_key: true,
            has_openai_key: false,
            has_groq_key: false,
            toolchain: { ytdlp: { found: true, path: null, version: null }, ffmpeg: { found: true, path: null, version: null } },
            ai_clis: { claude: { found: false, path: null, version: null }, codex: { found: false, path: null, version: null }, ollama: { found: false, path: null, version: null } },
          };
        }
        if (cmd === "toolchain_status") {
          return { ytdlp: { found: true, path: null, version: null }, ffmpeg: { found: true, path: null, version: null } };
        }
        if (cmd === "toolchain_bootstrap") return true;
        if (cmd === "project_list") return [];
        return null;
      },
    };
    // @ts-expect-error global stub
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: () => {},
    };
  });
}

test("timeline shows SVG progress ring when point is downloading", async ({ page }) => {
  await mockTauri(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Inject a synthetic project state into the Zustand store
  await page.evaluate(() => {
    // The Zustand store is a module-level singleton; we re-export it via
    // a debug hook for tests.
    const w = window as any;
    if (!w.__STORE_FOR_TEST__) throw new Error("test hook __STORE_FOR_TEST__ not exposed");
    w.__STORE_FOR_TEST__.setState({
      project: {
        version: 1,
        slug: "playwright-test",
        name: "Playwright Test",
        created_at: "2026-05-08T00:00:00Z",
        voiceover: { kind: "text", path: "voiceover.txt", duration_sec: null },
        transcript: [],
        broll_points: [
          { id: "bp_01", phrase: "first phrase", t_start: null, t_end: null, keywords: ["k1"], active_keyword: "k1", status: "downloading", selected_video: { source: "youtube", video_id: "abc", title: "Vid A", channel: "Ch", duration_sec: 60, thumb_url: "", url: "https://www.youtube.com/watch?v=abc", stream_url: null }, output_clip: null },
          { id: "bp_02", phrase: "second", t_start: null, t_end: null, keywords: ["k2"], active_keyword: "k2", status: "pending", selected_video: null, output_clip: null },
          { id: "bp_03", phrase: "third", t_start: null, t_end: null, keywords: ["k3"], active_keyword: "k3", status: "done", selected_video: null, output_clip: "clips/0003.mp4" },
        ],
      },
      currentIndex: 0,
      searchResults: {
        bp_01: [
          { source: "youtube", video_id: "vidyt", title: "YouTube clip", channel: "YT Ch", duration_sec: 120, thumb_url: "https://i.ytimg.com/vi/vidyt/mqdefault.jpg", url: "https://www.youtube.com/watch?v=vidyt", stream_url: null },
          { source: "pixabay", video_id: "12345", title: "Pixabay clip", channel: "px_user", duration_sec: 30, thumb_url: "https://i.vimeocdn.com/video/abc_640x360.jpg", url: "https://pixabay.com/videos/12345/", stream_url: "https://cdn.pixabay.com/video/12345/medium.mp4" },
          { source: "pexels", video_id: "67890", title: "Pexels clip", channel: "pe_user", duration_sec: 17, thumb_url: "https://images.pexels.com/videos/67890/thumb.jpg", url: "https://www.pexels.com/video/67890/", stream_url: "https://videos.pexels.com/67890_hd.mp4" },
        ],
      },
      downloads: { bp_01: { point_id: "bp_01", percent: 42.5, eta_sec: 12 } },
    });
  });

  // Navigate to /picker via React Router
  await page.evaluate(() => {
    history.pushState({}, "", "/picker");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });

  // Capture full screenshot for visual inspection
  await page.screenshot({ path: "e2e-pw/screenshots/timeline-downloading.png", fullPage: true });

  // Assert SVG progress ring is present in the timeline (the downloading
  // marker renders an SVG circle)
  const svgs = page.locator("svg");
  expect(await svgs.count()).toBeGreaterThan(0);

  // The downloading cell should contain an SVG (ProgressRing)
  // Find the timeline strip (border-t border-border in className) and look for SVG inside its first button
  const timelineButtons = page.locator("[class*='border-t'] button");
  const firstBtn = timelineButtons.first();
  await expect(firstBtn).toBeVisible();

  // The first button (bp_01, downloading) should have an SVG inside
  const svgInFirstBtn = firstBtn.locator("svg");
  await expect(svgInFirstBtn).toHaveCount(1);

  // Verify source badges appear in the grid
  await expect(page.locator('text=YT').first()).toBeVisible();
  await expect(page.locator('text=PX').first()).toBeVisible();
  await expect(page.locator('text=PE').first()).toBeVisible();
});
