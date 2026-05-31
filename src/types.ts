export type BRollStatus =
  | "pending" | "searching" | "picking" | "downloading" | "paused" | "processing" | "done" | "skipped" | "error";

export type VideoSourceId = "youtube" | "pixabay" | "pexels";

export interface VideoCandidate {
  source: VideoSourceId;
  video_id: string;
  title: string;
  channel: string;
  duration_sec: number;
  thumb_url: string;
  url: string;
  stream_url: string | null;
}

export interface BRollPoint {
  id: string;
  theme: string;
  phrase: string;
  t_start: number | null;
  t_end: number | null;
  keywords: string[];
  active_keyword: string;
  status: BRollStatus;
  selected_video: VideoCandidate | null;
  output_clip: string | null;
  cached_results: VideoCandidate[];
  cached_keyword: string | null;
}

export interface Project {
  version: number;
  slug: string;
  name: string;
  created_at: string;
  voiceover: { kind: "audio" | "text"; path: string; duration_sec: number | null };
  transcript: { start: number; end: number; text: string }[];
  broll_points: BRollPoint[];
}

export interface DownloadProgressEvent {
  point_id: string;
  percent: number;
  eta_sec: number | null;
}

export type ProviderId =
  | "anthropic_api"
  | "openai_api"
  | "ollama"
  | "claude_cli"
  | "codex_cli"
  | "antigravity_cli";

export type TranscriptionProviderId = "groq_api" | "openai_api";

export type ModelPreset = "fast" | "balanced" | "accurate" | "custom";

export interface AppSettings {
  selected_provider: ProviderId;
  anthropic_model: string;
  ollama_base_url: string | null;
  claude_cli_path: string | null;
  codex_cli_path: string | null;
  yt_dlp_path: string | null;
  antigravity_cli_path: string | null;
  transcription_provider: TranscriptionProviderId;
  model_preset: ModelPreset;
  /** Per-provider model id used when `model_preset === "custom"`. */
  model_overrides: Record<string, string>;
  /** Custom location for the projects root. When `null` the default
   * `~/B-Roll Projects/` is used. */
  projects_dir: string | null;
}

/** Which secrets are already stored in the OS keyring. Lets the settings UI
 * flag a saved key without ever reading the secret value back. */
export interface KeyPresence {
  anthropic: boolean;
  openai: boolean;
  groq: boolean;
  youtube: boolean;
  pixabay: boolean;
  pexels: boolean;
}

export interface TranscriptionResult {
  segments: { start: number; end: number; text: string }[];
  full_text: string;
  duration_sec: number;
}

export interface TranscriptionProgressEvent {
  step: "start" | "end";
  provider?: string;
  message?: string;
  duration_sec?: number;
  segments?: number;
}

export interface ToolStatus {
  found: boolean;
  path: string | null;
  version: string | null;
}

export interface AiCliStatus {
  claude: ToolStatus;
  codex: ToolStatus;
  ollama: ToolStatus;
  antigravity: ToolStatus;
}

export interface ToolchainStatus {
  ytdlp: ToolStatus;
  ffmpeg: ToolStatus;
}

export interface FirstRunStatus {
  is_first_run: boolean;
  has_anthropic_key: boolean;
  has_openai_key: boolean;
  has_groq_key: boolean;
  toolchain: ToolchainStatus;
  ai_clis: AiCliStatus;
}

export interface LogEntry {
  time: string;
  level: string;
  target: string;
  message: string;
}
