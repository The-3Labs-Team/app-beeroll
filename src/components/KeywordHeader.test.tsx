import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { KeywordHeader } from "./KeywordHeader";

function renderHeader(overrides = {}) {
  const props = {
    keyword: "trail running",
    theme: "outdoor sport",
    phrase: "A runner climbs a mountain trail.",
    current: 0,
    total: 3,
    onPrev: vi.fn(),
    onSkip: vi.fn(),
    onFilter: vi.fn(),
    filterActive: true,
    onChange: vi.fn(),
    ...overrides,
  };
  render(<KeywordHeader {...props} />);
  return props;
}

describe("KeywordHeader", () => {
  test("renders keyword, theme, phrase, and progress", () => {
    renderHeader();

    expect(screen.getByText("trail running")).toBeInTheDocument();
    expect(screen.getByText("outdoor sport")).toBeInTheDocument();
    expect(screen.getByText("A runner climbs a mountain trail.")).toBeInTheDocument();
    expect(screen.getByText("01/03")).toBeInTheDocument();
  });

  test("commits edited keyword on Enter", () => {
    const props = renderHeader();

    fireEvent.click(screen.getByText("trail running"));
    const input = screen.getByDisplayValue("trail running");
    fireEvent.change(input, { target: { value: "mountain race" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(props.onChange).toHaveBeenCalledWith("mountain race");
  });

  test("does not edit or skip when disabled", () => {
    const props = renderHeader({ disabled: true });

    fireEvent.click(screen.getByText("trail running"));
    expect(screen.queryByDisplayValue("trail running")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Salta →"));
    expect(props.onSkip).not.toHaveBeenCalled();
  });
});
