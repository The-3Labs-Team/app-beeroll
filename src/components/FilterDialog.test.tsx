import { describe, expect, test } from "vitest";
import {
  DEFAULT_FILTERS,
  applyFilters,
  isFilterActive,
  type PickerFilters,
} from "./FilterDialog";
import { candidateFromSource } from "../test-utils/factories";

describe("FilterDialog helpers", () => {
  test("isFilterActive is false only for default filters", () => {
    expect(isFilterActive(DEFAULT_FILTERS)).toBe(false);
    expect(isFilterActive({ ...DEFAULT_FILTERS, duration: "short" })).toBe(true);
    expect(
      isFilterActive({
        ...DEFAULT_FILTERS,
        sources: { youtube: true, pixabay: false, pexels: true },
      }),
    ).toBe(true);
  });

  test("applyFilters filters by source and duration bucket", () => {
    const rows = [
      candidateFromSource("youtube", "yt-short"),
      candidateFromSource("pixabay", "px-medium"),
      candidateFromSource("pexels", "pe-long"),
    ].map((c, i) => ({
      ...c,
      duration_sec: [59, 120, 301][i],
    }));

    const filters: PickerFilters = {
      sources: { youtube: true, pixabay: false, pexels: true },
      duration: "long",
    };

    expect(applyFilters(rows, filters).map((r) => r.video_id)).toEqual([
      "pe-long",
    ]);
  });
});
