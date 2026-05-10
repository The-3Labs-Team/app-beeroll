import { test, expect } from "@playwright/test";
import { mockTauri } from "./helpers/tauri";

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
    const thumb =
      "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20320%20180%22%3E%3Crect%20width%3D%22320%22%20height%3D%22180%22%20fill%3D%22%23263238%22%2F%3E%3Cpath%20d%3D%22M132%2050l76%2040-76%2040z%22%20fill%3D%22%23e8f0f2%22%2F%3E%3C%2Fsvg%3E";
    w.__STORE_FOR_TEST__.setState({
      project: {
        version: 1,
        slug: "playwright-test",
        name: "Playwright Test",
        created_at: "2026-05-08T00:00:00Z",
        voiceover: { kind: "text", path: "voiceover.txt", duration_sec: null },
        transcript: [],
        broll_points: [
          { id: "bp_01", theme: "trail running", phrase: "first phrase", t_start: null, t_end: null, keywords: ["k1"], active_keyword: "k1", status: "downloading", selected_video: { source: "youtube", video_id: "abc", title: "Vid A", channel: "Ch", duration_sec: 60, thumb_url: "", url: "https://www.youtube.com/watch?v=abc", stream_url: null }, output_clip: null },
          { id: "bp_02", theme: "gear", phrase: "second", t_start: null, t_end: null, keywords: ["k2"], active_keyword: "k2", status: "pending", selected_video: null, output_clip: null },
          { id: "bp_03", theme: "scenery", phrase: "third", t_start: null, t_end: null, keywords: ["k3"], active_keyword: "k3", status: "done", selected_video: null, output_clip: "clips/0003.mp4" },
        ],
      },
      currentIndex: 0,
      searchResults: {
        bp_01: [
          { source: "youtube", video_id: "vidyt", title: "YouTube clip", channel: "YT Ch", duration_sec: 120, thumb_url: thumb, url: "https://www.youtube.com/watch?v=vidyt", stream_url: null },
          { source: "pixabay", video_id: "12345", title: "Pixabay clip", channel: "px_user", duration_sec: 30, thumb_url: thumb, url: "https://pixabay.com/videos/12345/", stream_url: "https://cdn.pixabay.com/video/12345/medium.mp4" },
          { source: "pexels", video_id: "67890", title: "Pexels clip", channel: "pe_user", duration_sec: 17, thumb_url: thumb, url: "https://www.pexels.com/video/67890/", stream_url: "https://videos.pexels.com/67890_hd.mp4" },
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

  // Verify the theme label is rendered in the header
  await expect(page.getByText("trail running", { exact: false }).first()).toBeVisible();
});
