import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { VideoGrid } from "./VideoGrid";
import { candidateFromSource, makePoint } from "../test-utils/factories";
import { resetStore } from "../test-utils/render";

describe("VideoGrid", () => {
  test("renders empty state when no results exist", () => {
    resetStore();

    render(<VideoGrid results={[]} selectedId={null} onSelect={() => {}} />);

    expect(screen.getByText("Nessun risultato. Cambia keyword.")).toBeInTheDocument();
  });

  test("renders source badges and calls onSelect", () => {
    resetStore();
    const onSelect = vi.fn();
    const results = [
      candidateFromSource("youtube", "yt1"),
      candidateFromSource("pixabay", "px1"),
      candidateFromSource("pexels", "pe1"),
    ];

    render(<VideoGrid results={results} selectedId={null} onSelect={onSelect} />);

    expect(screen.getByText("YT")).toBeInTheDocument();
    expect(screen.getByText("PX")).toBeInTheDocument();
    expect(screen.getByText("PE")).toBeInTheDocument();

    fireEvent.click(screen.getByText("youtube yt1"));

    expect(onSelect).toHaveBeenCalledWith(results[0]);
  });

  test("shows download percent for picked downloading video", () => {
    const point = makePoint({
      id: "bp_dl",
      status: "downloading",
      selected_video: candidateFromSource("youtube", "yt1"),
    });
    resetStore({
      downloads: { bp_dl: { point_id: "bp_dl", percent: 42.4, eta_sec: 10 } },
    });

    render(
      <VideoGrid
        results={[point.selected_video!]}
        selectedId={null}
        pickedVideoId="yt1"
        pickedStatus="downloading"
        pickedPointId="bp_dl"
        onSelect={() => {}}
      />,
    );

    expect(screen.getByText("DOWNLOAD 42%")).toBeInTheDocument();
  });
});
