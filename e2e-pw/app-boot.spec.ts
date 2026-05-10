import { test, expect } from "@playwright/test";
import { mockTauri } from "./helpers/tauri";

test("app boots to projects empty state with Tauri mocked", async ({ page }) => {
  await mockTauri(page);
  await page.goto("/");
  await expect(page.getByText("Progetti", { exact: true })).toBeVisible();
  await expect(page.getByText("Nessun progetto")).toBeVisible();
  await expect(page.getByText("Crea progetto")).toBeVisible();
});
