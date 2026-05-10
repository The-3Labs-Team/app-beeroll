import { describe, expect, test } from "vitest";
import { formatBytes, formatDuration, formatEtaIt, relativeTimeIt } from "./utils";

describe("utils", () => {
  test("formatDuration renders seconds, minutes, and hours", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(75)).toBe("1:15");
    expect(formatDuration(3661)).toBe("1:01:01");
    expect(formatDuration(-5)).toBe("0:00");
  });

  test("formatEtaIt renders empty, seconds, and minute ranges", () => {
    expect(formatEtaIt(null)).toBe("");
    expect(formatEtaIt(undefined)).toBe("");
    expect(formatEtaIt(45)).toBe("45s");
    expect(formatEtaIt(120)).toBe("2m");
    expect(formatEtaIt(125)).toBe("2m 5s");
  });

  test("formatBytes renders user-facing binary units", () => {
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1_572_864)).toBe("1.5 MB");
  });

  test("relativeTimeIt handles invalid, recent, yesterday, and old dates", () => {
    const now = new Date("2026-05-10T12:00:00Z");
    expect(relativeTimeIt("not-a-date", now)).toBe("—");
    expect(relativeTimeIt("2026-05-10T11:59:40Z", now)).toBe("Ora");
    expect(relativeTimeIt("2026-05-10T11:05:00Z", now)).toBe("55 min fa");
    expect(relativeTimeIt("2026-05-09T12:00:00Z", now)).toBe("Ieri");
    expect(relativeTimeIt("2026-05-03T12:00:00Z", now)).toBe("03/05");
  });
});
