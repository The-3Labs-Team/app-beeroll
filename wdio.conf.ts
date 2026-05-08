// E2E config for webdriverio + tauri-driver.
//
// IMPORTANT: tauri-driver only supports Linux and Windows. macOS is NOT
// supported by upstream because Apple's WebDriver does not expose the API
// needed to drive a Tauri webview. Running `npm run e2e` on macOS will exit
// immediately with "tauri-driver is not supported on this platform". For a
// macOS-friendly substitute, run the frontend integration tests under
// `src/pages/*.test.tsx` via `npx vitest run` — they mock the IPC layer and
// cover the same user flows.
//
// Linux/Windows usage:
//   1. cargo install tauri-driver --locked
//   2. npm run tauri build -- --debug   (produces src-tauri/target/debug/video-broll)
//   3. npm run e2e
//
// On Linux you also need WebKitGTK's WebDriver: install `webkit2gtk-driver`
// (Debian/Ubuntu) or the equivalent. On Windows, install Edge WebDriver
// matching the system WebView2 runtime.

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import os from "node:os";

let tauriDriver: ChildProcess | undefined;

const tauriDriverBin = path.resolve(
  process.env.HOME ?? os.homedir(),
  ".cargo/bin/tauri-driver",
);

const appBin = path.resolve(
  process.cwd(),
  "src-tauri/target/debug/video-broll",
);

export const config: WebdriverIO.Config = {
  hostname: "127.0.0.1",
  port: 4444,
  specs: ["./e2e/**/*.spec.ts"],
  maxInstances: 1,
  capabilities: [
    {
      // @ts-expect-error custom Tauri capability not in WebdriverIO core types
      "tauri:options": {
        application: appBin,
      },
    },
  ],
  reporters: ["spec"],
  framework: "mocha",
  mochaOpts: { ui: "bdd", timeout: 60_000 },
  logLevel: "info",

  beforeSession: () =>
    new Promise<void>((resolve, reject) => {
      tauriDriver = spawn(tauriDriverBin, [], {
        stdio: [null, process.stdout, process.stderr],
      });
      tauriDriver.on("error", reject);
      // Give tauri-driver a moment to bind its port before WDIO connects.
      setTimeout(resolve, 1500);
    }),

  afterSession: () => {
    tauriDriver?.kill();
  },
};
