import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AiCliStatus,
  AppSettings,
  BRollPoint,
  DownloadProgressEvent,
  FirstRunStatus,
  KeyPresence,
  LogEntry,
  Project,
  ToolchainStatus,
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
  projectDelete: (slug: string) => invoke<void>("project_delete", { slug }),
  projectSize: (slug: string) => invoke<number>("project_size", { slug }),
  settingsSetAnthropicKey: (key: string) =>
    invoke<void>("settings_set_anthropic_key", { key }),
  settingsSetOpenaiKey: (key: string) =>
    invoke<void>("settings_set_openai_key", { key }),
  settingsSetGroqKey: (key: string) =>
    invoke<void>("settings_set_groq_key", { key }),
  settingsSetPixabayKey: (key: string) =>
    invoke<void>("settings_set_pixabay_key", { key }),
  settingsTestPixabay: () => invoke<boolean>("settings_test_pixabay"),
  settingsSetPexelsKey: (key: string) =>
    invoke<void>("settings_set_pexels_key", { key }),
  settingsTestPexels: () => invoke<boolean>("settings_test_pexels"),
  settingsSetYoutubeKey: (key: string) =>
    invoke<void>("settings_set_youtube_key", { key }),
  settingsTestYoutube: () => invoke<boolean>("settings_test_youtube"),
  settingsTestAnthropic: () => invoke<boolean>("settings_test_anthropic"),
  settingsTestProvider: (providerId: string) =>
    invoke<boolean>("settings_test_provider", { providerId }),
  settingsLoad: () => invoke<AppSettings>("settings_load"),
  settingsSave: (settings: AppSettings) =>
    invoke<void>("settings_save", { settings }),
  settingsKeysPresent: () => invoke<KeyPresence>("settings_keys_present"),
  aiCliStatus: () => invoke<AiCliStatus>("ai_cli_status"),
  toolchainStatus: () => invoke<ToolchainStatus>("toolchain_status"),
  firstRunStatus: () => invoke<FirstRunStatus>("first_run_status"),
  toolchainBootstrap: () => invoke<boolean>("toolchain_bootstrap"),
  toolchainWaitReady: () => invoke<boolean>("toolchain_wait_ready"),
  extractionRun: () => invoke<BRollPoint[]>("extraction_run"),
  transcriptionRun: (audioPath: string) =>
    invoke<TranscriptionResult>("transcription_run", { audioPath }),
  searchRun: (keyword: string) => invoke<VideoCandidate[]>("search_run", { keyword }),
  searchRunExtras: (keyword: string) =>
    invoke<VideoCandidate[]>("search_run_extras", { keyword }),
  pointCacheSearchResults: (
    point_id: string,
    keyword: string,
    results: VideoCandidate[],
  ) =>
    invoke<void>("point_cache_search_results", {
      pointId: point_id,
      keyword,
      results,
    }),
  pickVideo: (point_id: string, candidate: VideoCandidate) =>
    invoke<string>("pick_video", { pointId: point_id, candidate }),
  cancelDownload: (point_id: string, delete_partial: boolean) =>
    invoke<void>("cancel_download", { pointId: point_id, deletePartial: delete_partial }),
  skipPoint: (point_id: string) => invoke<void>("skip_point", { pointId: point_id }),
  openProjectFolder: (slug?: string) =>
    invoke<void>("open_project_folder", slug ? { slug } : {}),
  openExternal: (url: string) => invoke<void>("open_external", { url }),
  exportEdl: (outputPath: string) => invoke<void>("export_edl", { outputPath }),
  exportFcpxml: (outputPath: string) => invoke<void>("export_fcpxml", { outputPath }),
  logsGet: (limit?: number) =>
    invoke<LogEntry[]>("logs_get", { limit: limit ?? null }),
  logsClear: () => invoke<void>("logs_clear"),
};

export const events = {
  onProjectUpdated: (cb: (p: Project) => void): Promise<UnlistenFn> =>
    listen<Project>("project:updated", (e) => cb(e.payload)),
  onDownloadProgress: (cb: (e: DownloadProgressEvent) => void): Promise<UnlistenFn> =>
    listen<DownloadProgressEvent>("download:progress", (e) => cb(e.payload)),
  onDownloadComplete: (cb: (e: { point_id: string; output: string }) => void): Promise<UnlistenFn> =>
    listen<{ point_id: string; output: string }>("download:complete", (e) => cb(e.payload)),
  onTranscriptionProgress: (
    cb: (e: TranscriptionProgressEvent) => void,
  ): Promise<UnlistenFn> =>
    listen<TranscriptionProgressEvent>("transcription:progress", (e) => cb(e.payload)),
};
