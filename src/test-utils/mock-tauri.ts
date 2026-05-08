import { vi } from "vitest";

const mockResponses: Record<string, unknown> = {};

export function setMockResponse(command: string, response: unknown) {
  mockResponses[command] = response;
}

export function clearMockResponses() {
  for (const k of Object.keys(mockResponses)) delete mockResponses[k];
}

export function mockTauri() {
  vi.mock("@tauri-apps/api/core", () => ({
    invoke: vi.fn((command: string) => {
      if (mockResponses[command] !== undefined) {
        return Promise.resolve(mockResponses[command]);
      }
      return Promise.reject(new Error(`mock missing for ${command}`));
    }),
  }));
  vi.mock("@tauri-apps/api/event", () => ({
    listen: vi.fn(() => Promise.resolve(() => undefined)),
  }));
  vi.mock("@tauri-apps/plugin-dialog", () => ({
    open: vi.fn(),
    save: vi.fn(),
  }));
}
