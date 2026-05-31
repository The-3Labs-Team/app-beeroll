import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../ipc", () => ({
  ipc: { openExternal: vi.fn().mockResolvedValue(undefined) },
}));

import { ipc } from "../ipc";
import { PreviewPane } from "./PreviewPane";
import { makeVideoCandidate } from "../test-utils/factories";

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
const WIN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

const noop = () => {};

describe("PreviewPane YouTube preview", () => {
  afterEach(() => vi.clearAllMocks());

  test("embeds the YouTube iframe on Windows", () => {
    setUserAgent(WIN_UA);
    const candidate = makeVideoCandidate({ source: "youtube" });
    const { container } = render(
      <PreviewPane candidate={candidate} onCommit={noop} />,
    );

    expect(container.querySelector("iframe")).not.toBeNull();
    expect(screen.queryByText("Guarda su YouTube")).toBeNull();
  });

  test("falls back to a thumbnail that opens externally on macOS", () => {
    setUserAgent(MAC_UA);
    const candidate = makeVideoCandidate({
      source: "youtube",
      url: "https://www.youtube.com/watch?v=abc123",
    });
    const { container } = render(
      <PreviewPane candidate={candidate} onCommit={noop} />,
    );

    expect(container.querySelector("iframe")).toBeNull();
    fireEvent.click(screen.getByTitle("Guarda su YouTube"));
    expect(ipc.openExternal).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=abc123",
    );
  });
});

describe("PreviewPane overlay processing", () => {
  test("shows an Annulla button that triggers onStop", () => {
    setUserAgent(WIN_UA);
    const onStop = vi.fn();
    render(
      <PreviewPane
        candidate={makeVideoCandidate({ source: "youtube" })}
        onCommit={noop}
        onStop={onStop}
        pickedPointStatus="processing"
      />,
    );

    expect(screen.getByText(/Elaborazione overlay/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Annulla/ }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
