import type {
  AiCliStatus,
  AppSettings,
  BRollPoint,
  FirstRunStatus,
  Project,
  ToolchainStatus,
  VideoCandidate,
  VideoSourceId,
} from "../types";

export function makeVideoCandidate(
  overrides: Partial<VideoCandidate> = {},
): VideoCandidate {
  const source = overrides.source ?? "youtube";
  const id = overrides.video_id ?? `${source}-001`;
  return {
    source,
    video_id: id,
    title: overrides.title ?? `${source} clip`,
    channel: overrides.channel ?? `${source} channel`,
    duration_sec: overrides.duration_sec ?? 90,
    thumb_url:
      overrides.thumb_url ??
      (source === "youtube"
        ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
        : `https://cdn.example.test/${id}.jpg`),
    url: overrides.url ?? `https://example.test/${source}/${id}`,
    stream_url: overrides.stream_url ?? null,
  };
}

export function makePoint(overrides: Partial<BRollPoint> = {}): BRollPoint {
  const id = overrides.id ?? "bp_01";
  return {
    id,
    theme: overrides.theme ?? "trail running",
    phrase: overrides.phrase ?? "A runner climbs a mountain trail.",
    t_start: overrides.t_start ?? null,
    t_end: overrides.t_end ?? null,
    keywords: overrides.keywords ?? ["trail running"],
    active_keyword: overrides.active_keyword ?? "trail running",
    status: overrides.status ?? "pending",
    selected_video: overrides.selected_video ?? null,
    output_clip: overrides.output_clip ?? null,
  };
}

export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    version: overrides.version ?? 1,
    slug: overrides.slug ?? "test-project",
    name: overrides.name ?? "Test Project",
    created_at: overrides.created_at ?? "2026-05-10T08:00:00Z",
    voiceover:
      overrides.voiceover ??
      { kind: "text", path: "voiceover.txt", duration_sec: null },
    transcript: overrides.transcript ?? [],
    broll_points:
      overrides.broll_points ??
      [
        makePoint({ id: "bp_01", active_keyword: "trail running" }),
        makePoint({
          id: "bp_02",
          theme: "gear closeups",
          phrase: "Hands tighten a backpack strap.",
          keywords: ["backpack closeup"],
          active_keyword: "backpack closeup",
        }),
      ],
  };
}

export function makeSettings(
  overrides: Partial<AppSettings> = {},
): AppSettings {
  return {
    selected_provider: overrides.selected_provider ?? "anthropic_api",
    anthropic_model: overrides.anthropic_model ?? "claude-sonnet-4-6",
    ollama_base_url: overrides.ollama_base_url ?? null,
    claude_cli_path: overrides.claude_cli_path ?? null,
    codex_cli_path: overrides.codex_cli_path ?? null,
    transcription_provider: overrides.transcription_provider ?? "groq_api",
    model_preset: overrides.model_preset ?? "balanced",
    model_overrides: overrides.model_overrides ?? {},
  };
}

export function makeToolchainStatus(
  found = true,
): ToolchainStatus {
  return {
    ytdlp: { found, path: found ? "/tmp/yt-dlp" : null, version: found ? "2026.01.01" : null },
    ffmpeg: { found, path: found ? "/tmp/ffmpeg" : null, version: found ? "7.0" : null },
  };
}

export function makeAiCliStatus(): AiCliStatus {
  return {
    claude: { found: false, path: null, version: null },
    codex: { found: false, path: null, version: null },
    ollama: { found: false, path: null, version: null },
  };
}

export function makeFirstRunStatus(
  overrides: Partial<FirstRunStatus> = {},
): FirstRunStatus {
  return {
    is_first_run: overrides.is_first_run ?? false,
    has_anthropic_key: overrides.has_anthropic_key ?? true,
    has_openai_key: overrides.has_openai_key ?? false,
    has_groq_key: overrides.has_groq_key ?? false,
    toolchain: overrides.toolchain ?? makeToolchainStatus(),
    ai_clis: overrides.ai_clis ?? makeAiCliStatus(),
  };
}

export function candidateFromSource(source: VideoSourceId, id: string) {
  return makeVideoCandidate({ source, video_id: id, title: `${source} ${id}` });
}
