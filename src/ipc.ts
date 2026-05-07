import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AiCliStatus,
  AppSettings,
  BRollPoint,
  DownloadProgressEvent,
  Project,
  TranscriptionProgressEvent,
  TranscriptionResult,
  VideoCandidate,
} from "./types";

export const ipc = {
  projectCreate: (
    name: string,
    text_voiceover: string | null,
    audio_path: string | null,
  ) =>
    invoke<Project>("project_create", {
      name,
      textVoiceover: text_voiceover,
      audioPath: audio_path,
    }),
  projectLoad: (slug: string) => invoke<Project>("project_load", { slug }),
  projectList: () => invoke<Project[]>("project_list"),
  settingsSetAnthropicKey: (key: string) =>
    invoke<void>("settings_set_anthropic_key", { key }),
  settingsSetOpenaiKey: (key: string) =>
    invoke<void>("settings_set_openai_key", { key }),
  settingsSetGroqKey: (key: string) =>
    invoke<void>("settings_set_groq_key", { key }),
  settingsTestAnthropic: () => invoke<boolean>("settings_test_anthropic"),
  settingsTestProvider: (providerId: string) =>
    invoke<boolean>("settings_test_provider", { providerId }),
  settingsLoad: () => invoke<AppSettings>("settings_load"),
  settingsSave: (settings: AppSettings) =>
    invoke<void>("settings_save", { settings }),
  aiCliStatus: () => invoke<AiCliStatus>("ai_cli_status"),
  extractionRun: () => invoke<BRollPoint[]>("extraction_run"),
  transcriptionRun: (audioPath: string) =>
    invoke<TranscriptionResult>("transcription_run", { audioPath }),
  searchRun: (keyword: string) => invoke<VideoCandidate[]>("search_run", { keyword }),
  pickVideo: (point_id: string, candidate: VideoCandidate) =>
    invoke<string>("pick_video", { pointId: point_id, candidate }),
  skipPoint: (point_id: string) => invoke<void>("skip_point", { pointId: point_id }),
  openProjectFolder: () => invoke<void>("open_project_folder"),
};

export const events = {
  onProjectUpdated: (cb: (p: Project) => void): Promise<UnlistenFn> =>
    listen<Project>("project.updated", (e) => cb(e.payload)),
  onDownloadProgress: (cb: (e: DownloadProgressEvent) => void): Promise<UnlistenFn> =>
    listen<DownloadProgressEvent>("download.progress", (e) => cb(e.payload)),
  onDownloadComplete: (cb: (e: { point_id: string; output: string }) => void): Promise<UnlistenFn> =>
    listen<{ point_id: string; output: string }>("download.complete", (e) => cb(e.payload)),
  onTranscriptionProgress: (
    cb: (e: TranscriptionProgressEvent) => void,
  ): Promise<UnlistenFn> =>
    listen<TranscriptionProgressEvent>("transcription.progress", (e) => cb(e.payload)),
};
