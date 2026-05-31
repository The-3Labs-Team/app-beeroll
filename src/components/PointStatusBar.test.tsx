import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { PointStatusBar } from "./PointStatusBar";
import { candidateFromSource, makePoint } from "../test-utils/factories";

describe("PointStatusBar", () => {
  test("hides pending points", () => {
    const { container } = render(
      <PointStatusBar point={makePoint({ status: "pending" })} download={undefined} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  test("renders downloading percent and ETA", () => {
    render(
      <PointStatusBar
        point={makePoint({
          status: "downloading",
          selected_video: candidateFromSource("youtube", "yt1"),
        })}
        download={{ point_id: "bp_01", percent: 33.6, eta_sec: 75 }}
      />,
    );

    expect(screen.getByText("Download 34%")).toBeInTheDocument();
    expect(screen.getByText("ETA 1m 15s")).toBeInTheDocument();
  });

  test("renders done filename, skipped state, and error state", () => {
    const done = makePoint({
      status: "done",
      output_clip: "clips/0001_final.mp4",
      selected_video: candidateFromSource("youtube", "yt1"),
    });
    const { rerender } = render(<PointStatusBar point={done} download={undefined} />);

    expect(screen.getByText("Clip pronta per questo punto")).toBeInTheDocument();
    expect(screen.getByText("0001_final.mp4")).toBeInTheDocument();

    rerender(<PointStatusBar point={makePoint({ status: "skipped" })} download={undefined} />);
    expect(screen.getByText("Saltato")).toBeInTheDocument();

    rerender(<PointStatusBar point={makePoint({ status: "error" })} download={undefined} />);
    expect(
      screen.getByText("Errore — download o elaborazione non riusciti"),
    ).toBeInTheDocument();
  });
});
