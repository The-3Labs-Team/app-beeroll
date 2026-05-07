export type BRollStatus =
  | "pending" | "searching" | "picking" | "downloading" | "done" | "skipped" | "error";

export interface VideoCandidate {
  video_id: string;
  title: string;
  channel: string;
  duration_sec: number;
  thumb_url: string;
  url: string;
}

export interface BRollPoint {
  id: string;
  phrase: string;
  t_start: number | null;
  t_end: number | null;
  keywords: string[];
  active_keyword: string;
  status: BRollStatus;
  selected_video: VideoCandidate | null;
  output_clip: string | null;
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
  | "codex_cli";

export type TranscriptionProviderId = "groq_api" | "openai_api";

export interface AppSettings {
  selected_provider: ProviderId;
  anthropic_model: string;
  ollama_base_url: string | null;
  claude_cli_path: string | null;
  codex_cli_path: string | null;
  transcription_provider: TranscriptionProviderId;
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
