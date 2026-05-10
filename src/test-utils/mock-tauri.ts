import { vi } from "vitest";

type Listener = (event: { payload: unknown }) => void;

export const tauriMock = vi.hoisted(() => {
  const responses = new Map<string, unknown>();
  const listeners = new Map<string, Set<Listener>>();

  const invoke = vi.fn((command: string) => {
    if (responses.has(command)) {
      const value = responses.get(command);
      return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
    }
    return Promise.reject(new Error(`mock missing for ${command}`));
  });

  const listen = vi.fn((event: string, cb: Listener) => {
    const set = listeners.get(event) ?? new Set<Listener>();
    set.add(cb);
    listeners.set(event, set);
    return Promise.resolve(() => set.delete(cb));
  });

  return {
    responses,
    listeners,
    invoke,
    listen,
    open: vi.fn(),
    save: vi.fn(),
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauriMock.invoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: tauriMock.listen,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: tauriMock.open,
  save: tauriMock.save,
}));

export function setMockResponse(command: string, response: unknown) {
  tauriMock.responses.set(command, response);
}

export function clearMockResponses() {
  tauriMock.responses.clear();
  tauriMock.listeners.clear();
  tauriMock.invoke.mockClear();
  tauriMock.listen.mockClear();
  tauriMock.open.mockReset();
  tauriMock.save.mockReset();
}

export function emitTauriEvent(event: string, payload: unknown) {
  for (const cb of tauriMock.listeners.get(event) ?? []) {
    cb({ payload });
  }
}

export function mockTauri() {
  clearMockResponses();
}
