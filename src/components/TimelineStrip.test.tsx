import { render, screen, fireEvent } from "@testing-library/react";
import { TimelineStrip } from "./TimelineStrip";
import type { BRollPoint } from "../types";

const point = (id: string, status: BRollPoint["status"]): BRollPoint => ({
  id, theme: "", phrase: `phrase ${id}`, t_start: null, t_end: null,
  keywords: [], active_keyword: "", status,
  selected_video: null, output_clip: null,
  cached_results: [], cached_keyword: null,
});

test("renders one cell per point", () => {
  render(
    <TimelineStrip
      points={[point("a", "pending"), point("b", "done")]}
      currentIndex={0}
      onJump={() => {}}
    />
  );
  expect(screen.getAllByRole("button")).toHaveLength(2);
});

test("clicking a cell calls onJump with the index", () => {
  const onJump = vi.fn();
  render(
    <TimelineStrip
      points={[point("a", "pending"), point("b", "done"), point("c", "skipped")]}
      currentIndex={0}
      onJump={onJump}
    />
  );
  fireEvent.click(screen.getAllByRole("button")[2]);
  expect(onJump).toHaveBeenCalledWith(2);
});
