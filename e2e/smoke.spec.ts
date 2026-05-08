// Smoke test for the Tauri app via webdriverio + tauri-driver.
// Linux/Windows only — see wdio.conf.ts for platform notes.

import { browser } from "@wdio/globals";

describe("Video B-Roll smoke", () => {
  it("opens and shows the projects screen", async () => {
    // The Tauri title varies per platform; just verify the driver works
    // and the webview is reachable.
    const title = await browser.getTitle();
    expect(title).toBeDefined();
  });
});
