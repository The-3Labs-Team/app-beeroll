use crate::ai::{self, AIProvider, ProviderConfig};
use crate::ai::anthropic::AnthropicProvider;
use crate::domain::*;
use crate::download_manager::DownloadManager;
use crate::error::{AppError, AppResult};
use crate::extractor::BRollExtractor;
use crate::project_store::ProjectStore;
use crate::settings_store::{self, AppSettings, SettingsStore};
use crate::transcription::{self, TranscriptionConfig, TranscriptionResult};
use crate::video_processor::VideoProcessor;
use crate::youtube_search::YouTubeSearch;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::RwLock;

pub struct AppState {
    pub current_project: RwLock<Option<Arc<ProjectStore>>>,
    pub projects_root: PathBuf,
    pub bin_paths: BinPaths,
}

#[derive(Clone)]
pub struct BinPaths {
    pub ytdlp: String,
    pub font: PathBuf,
}

fn projects_root() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")).join("B-Roll Projects")
}

/// Build a [`ProviderConfig`] by combining persisted [`AppSettings`] with
/// secrets pulled from the OS keyring.
fn build_provider_config(settings: &AppSettings) -> AppResult<ProviderConfig> {
    Ok(ProviderConfig {
        anthropic_key: SettingsStore::get_anthropic_key()?,
        openai_key: SettingsStore::get_openai_key()?,
        ollama_base_url: settings.ollama_base_url.clone(),
        claude_cli_path: settings.claude_cli_path.clone(),
        codex_cli_path: settings.codex_cli_path.clone(),
    })
}

#[tauri::command]
pub async fn project_create(
    state: State<'_, AppState>,
    name: String,
    text_voiceover: Option<String>,
    audio_path: Option<String>,
) -> AppResult<Project> {
    if name.trim().is_empty() {
        return Err(AppError::InvalidInput("name is empty".into()));
    }

    let voiceover = if let Some(audio) = audio_path.as_deref() {
        let src = std::path::Path::new(audio);
        if !src.exists() {
            return Err(AppError::InvalidInput(format!(
                "audio file does not exist: {audio}"
            )));
        }
        let filename = src
            .file_name()
            .ok_or_else(|| AppError::InvalidInput("invalid audio path".into()))?
            .to_string_lossy()
            .into_owned();
        VoiceoverInput {
            kind: VoiceoverKind::Audio,
            path: format!("audio/{filename}"),
            duration_sec: None,
        }
    } else if text_voiceover.as_deref().map(|s| !s.trim().is_empty()).unwrap_or(false) {
        VoiceoverInput {
            kind: VoiceoverKind::Text,
            path: "voiceover.txt".into(),
            duration_sec: None,
        }
    } else {
        return Err(AppError::InvalidInput(
            "either text_voiceover or audio_path required".into(),
        ));
    };

    tokio::fs::create_dir_all(&state.projects_root).await?;
    let store = ProjectStore::create(&state.projects_root, &name, voiceover.clone()).await?;
    let project_dir = state.projects_root.join(slug::slugify(&name));

    if let Some(audio) = audio_path.as_deref() {
        let dest = project_dir.join(&voiceover.path);
        tokio::fs::copy(audio, dest).await?;
    } else if let Some(text) = text_voiceover.as_deref() {
        tokio::fs::write(project_dir.join("voiceover.txt"), text).await?;
    }

    let project = store.project().await;
    *state.current_project.write().await = Some(Arc::new(store));
    Ok(project)
}

#[tauri::command]
pub async fn project_load(
    state: State<'_, AppState>,
    slug: String,
) -> AppResult<Project> {
    let dir = state.projects_root.join(&slug);
    if !dir.exists() {
        return Err(AppError::ProjectNotFound(slug));
    }
    let store = ProjectStore::load(&dir).await?;
    let project = store.project().await;
    *state.current_project.write().await = Some(Arc::new(store));
    Ok(project)
}

#[tauri::command]
pub async fn project_list(state: State<'_, AppState>) -> AppResult<Vec<Project>> {
    let mut out = Vec::new();
    if !state.projects_root.exists() {
        return Ok(out);
    }
    let mut entries = tokio::fs::read_dir(&state.projects_root).await?;
    while let Some(entry) = entries.next_entry().await? {
        if !entry.file_type().await?.is_dir() { continue; }
        let pj = entry.path().join("project.json");
        if pj.exists() {
            if let Ok(bytes) = tokio::fs::read(&pj).await {
                if let Ok(p) = serde_json::from_slice::<Project>(&bytes) { out.push(p); }
            }
        }
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

// ---- Settings: API keys ---------------------------------------------------

#[tauri::command]
pub async fn settings_set_anthropic_key(key: String) -> AppResult<()> {
    SettingsStore::set_anthropic_key(&key)
}

#[tauri::command]
pub async fn settings_set_openai_key(key: String) -> AppResult<()> {
    SettingsStore::set_openai_key(&key)
}

#[tauri::command]
pub async fn settings_set_groq_key(key: String) -> AppResult<()> {
    SettingsStore::set_groq_key(&key)
}

/// Retained for backwards compatibility with the original frontend; thin
/// wrapper around [`settings_test_provider`] for the Anthropic provider.
#[tauri::command]
pub async fn settings_test_anthropic() -> AppResult<bool> {
    let key = SettingsStore::get_anthropic_key()?
        .ok_or_else(|| AppError::InvalidInput("no anthropic key set".into()))?;
    let provider = AnthropicProvider::new(key);
    let result = provider.complete("Reply with just OK", "ping").await?;
    Ok(result.to_lowercase().contains("ok"))
}

/// Build the named provider from current settings/keyring and ping it. Returns
/// `true` when the provider's response contains the literal "ok".
#[tauri::command]
pub async fn settings_test_provider(provider_id: String) -> AppResult<bool> {
    let settings = SettingsStore::load_settings()?;
    let config = build_provider_config(&settings)?;
    let provider = ai::create_provider(&provider_id, &config)?;
    let result = provider.complete("Reply with just OK", "ping").await?;
    Ok(result.to_lowercase().contains("ok"))
}

// ---- Settings: persistence -----------------------------------------------

#[tauri::command]
pub async fn settings_load() -> AppResult<AppSettings> {
    SettingsStore::load_settings()
}

#[tauri::command]
pub async fn settings_save(settings: AppSettings) -> AppResult<()> {
    SettingsStore::save_settings(&settings)
}

#[tauri::command]
pub async fn extraction_run(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Vec<BRollPoint>> {
    let store = {
        let cur = state.current_project.read().await;
        cur.clone().ok_or_else(|| AppError::InvalidInput("no project loaded".into()))?
    };
    let project = store.project().await;

    // For audio voiceovers we feed the model the previously-stored transcript
    // segments concatenated; for text voiceovers we read voiceover.txt as
    // before. Transcription is driven by `transcription_run` and must run
    // first.
    let transcript = match project.voiceover.kind {
        VoiceoverKind::Audio => {
            if project.transcript.is_empty() {
                return Err(AppError::InvalidInput(
                    "transcript missing — run transcription first".into(),
                ));
            }
            project
                .transcript
                .iter()
                .map(|s| s.text.as_str())
                .collect::<Vec<_>>()
                .join(" ")
        }
        VoiceoverKind::Text => {
            let voiceover_path = state
                .projects_root
                .join(&project.slug)
                .join(&project.voiceover.path);
            tokio::fs::read_to_string(&voiceover_path).await?
        }
    };

    let app_settings = SettingsStore::load_settings()?;
    let provider_config = build_provider_config(&app_settings)?;
    let provider: Arc<dyn AIProvider> =
        ai::create_provider(&app_settings.selected_provider, &provider_config)?;
    let provider_label = provider.name();
    let extractor = BRollExtractor::new(provider);
    app.emit(
        "extraction.progress",
        serde_json::json!({
            "step": "calling_ai",
            "message": format!("Calling AI provider: {provider_label}")
        }),
    )
    .ok();
    let points = extractor.extract(&transcript).await?;

    for p in &points {
        store.add_broll_point(p.clone()).await?;
    }
    let project_after = store.project().await;
    app.emit("project.updated", &project_after).ok();
    Ok(points)
}

#[tauri::command]
pub async fn transcription_run(
    app: AppHandle,
    state: State<'_, AppState>,
    audio_path: String,
) -> AppResult<TranscriptionResult> {
    let store = {
        let cur = state.current_project.read().await;
        cur.clone()
            .ok_or_else(|| AppError::InvalidInput("no project loaded".into()))?
    };
    let project = store.project().await;
    let project_dir = state.projects_root.join(&project.slug);

    // Resolve relative paths against the project dir; absolute paths pass
    // through. Frontend supplies the project-relative path (e.g.
    // "audio/voiceover.mp3") it learned from project.voiceover.path.
    let candidate = std::path::Path::new(&audio_path);
    let resolved: PathBuf = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        project_dir.join(candidate)
    };
    if !resolved.exists() {
        return Err(AppError::InvalidInput(format!(
            "audio file not found: {}",
            resolved.display()
        )));
    }

    let app_settings = SettingsStore::load_settings()?;
    let config = build_transcription_config()?;
    let provider = transcription::create_transcription_provider(
        &app_settings.transcription_provider,
        &config,
    )?;
    let provider_label = provider.name();

    app.emit(
        "transcription.progress",
        serde_json::json!({
            "step": "start",
            "provider": provider_label,
            "message": format!("Transcribing with {provider_label}…")
        }),
    )
    .ok();

    let result = provider.transcribe(&resolved).await?;

    store.set_transcript(result.segments.clone()).await?;
    let project_after = store.project().await;
    app.emit("project.updated", &project_after).ok();
    app.emit(
        "transcription.progress",
        serde_json::json!({
            "step": "end",
            "provider": provider_label,
            "duration_sec": result.duration_sec,
            "segments": result.segments.len(),
        }),
    )
    .ok();

    Ok(result)
}

fn build_transcription_config() -> AppResult<TranscriptionConfig> {
    Ok(TranscriptionConfig {
        groq_key: SettingsStore::get_groq_key()?,
        openai_key: SettingsStore::get_openai_key()?,
    })
}

#[tauri::command]
pub async fn search_run(
    state: State<'_, AppState>,
    keyword: String,
) -> AppResult<Vec<VideoCandidate>> {
    let search = YouTubeSearch::new(state.bin_paths.ytdlp.clone());
    search.search(&keyword, 9).await
}

#[tauri::command]
pub async fn pick_video(
    app: AppHandle,
    state: State<'_, AppState>,
    point_id: String,
    candidate: VideoCandidate,
) -> AppResult<String> {
    let store = {
        let cur = state.current_project.read().await;
        cur.clone().ok_or_else(|| AppError::InvalidInput("no project loaded".into()))?
    };
    let project = store.project().await;
    let project_dir = state.projects_root.join(&project.slug);
    let clips_dir = project_dir.join("clips");
    let raw_dir = project_dir.join("cache").join("downloads");

    store.update_broll_point(&point_id, |bp| {
        bp.status = BRollStatus::Downloading;
        bp.selected_video = Some(candidate.clone());
    }).await?;
    app.emit("project.updated", &store.project().await).ok();

    let dl = DownloadManager::new(state.bin_paths.ytdlp.clone());
    let pid = point_id.clone();
    let app_clone = app.clone();
    let raw_path = dl.download(&candidate.url, &raw_dir, move |p| {
        app_clone.emit("download.progress", serde_json::json!({
            "point_id": pid,
            "percent": p.percent,
            "eta_sec": p.eta_sec,
        })).ok();
    }).await?;

    let idx = project.broll_points.iter().position(|b| b.id == point_id).unwrap_or(0);
    let safe_kw = slug::slugify(&candidate.title);
    let final_name = format!("{:04}_{safe_kw}.mp4", idx + 1);
    let final_path = clips_dir.join(&final_name);

    let vp = VideoProcessor::with_app(&app, state.bin_paths.font.clone());
    vp.apply_copyright_overlay(&raw_path, &final_path, &candidate.channel).await?;

    let final_rel = format!("clips/{final_name}");
    store.update_broll_point(&point_id, |bp| {
        bp.status = BRollStatus::Done;
        bp.output_clip = Some(final_rel.clone());
    }).await?;
    app.emit("project.updated", &store.project().await).ok();
    app.emit("download.complete", serde_json::json!({"point_id": point_id, "output": final_rel})).ok();
    Ok(final_rel)
}

#[tauri::command]
pub async fn skip_point(
    app: AppHandle,
    state: State<'_, AppState>,
    point_id: String,
) -> AppResult<()> {
    let store = {
        let cur = state.current_project.read().await;
        cur.clone().ok_or_else(|| AppError::InvalidInput("no project loaded".into()))?
    };
    store.update_broll_point(&point_id, |bp| {
        bp.status = BRollStatus::Skipped;
    }).await?;
    app.emit("project.updated", &store.project().await).ok();
    Ok(())
}

#[tauri::command]
pub async fn open_project_folder(state: State<'_, AppState>) -> AppResult<()> {
    let store = {
        let cur = state.current_project.read().await;
        cur.clone().ok_or_else(|| AppError::InvalidInput("no project loaded".into()))?
    };
    let project = store.project().await;
    let dir = state.projects_root.join(&project.slug);
    #[cfg(target_os = "macos")]
    tokio::process::Command::new("open").arg(&dir).status().await
        .map_err(|e| AppError::Subprocess(e.to_string()))?;
    Ok(())
}

use crate::toolchain_manager;

#[tauri::command]
pub async fn toolchain_status() -> AppResult<toolchain_manager::ToolchainStatus> {
    Ok(toolchain_manager::detect_toolchain().await)
}

#[tauri::command]
pub async fn ai_cli_status() -> AppResult<toolchain_manager::AiCliStatus> {
    Ok(toolchain_manager::detect_ai_clis().await)
}

/// Aggregated state used by the frontend onboarding modal: whether settings
/// were ever persisted, which API keys are present in the keyring, and the
/// detection results for external CLIs and binaries.
#[derive(Debug, Serialize, Clone)]
pub struct FirstRunStatus {
    pub is_first_run: bool,
    pub has_anthropic_key: bool,
    pub has_openai_key: bool,
    pub has_groq_key: bool,
    pub toolchain: toolchain_manager::ToolchainStatus,
    pub ai_clis: toolchain_manager::AiCliStatus,
}

#[tauri::command]
pub async fn first_run_status() -> AppResult<FirstRunStatus> {
    let settings_path = settings_store::SettingsStore::settings_path();
    let is_first_run = !settings_path.exists();
    let has_anthropic_key = settings_store::SettingsStore::get_anthropic_key()?.is_some();
    let has_openai_key = settings_store::SettingsStore::get_openai_key()?.is_some();
    let has_groq_key = settings_store::SettingsStore::get_groq_key()?.is_some();
    let toolchain = toolchain_manager::detect_toolchain().await;
    let ai_clis = toolchain_manager::detect_ai_clis().await;
    Ok(FirstRunStatus {
        is_first_run,
        has_anthropic_key,
        has_openai_key,
        has_groq_key,
        toolchain,
        ai_clis,
    })
}

#[tauri::command]
pub async fn export_edl(state: State<'_, AppState>, output_path: String) -> AppResult<()> {
    let store = state
        .current_project
        .read()
        .await
        .clone()
        .ok_or_else(|| AppError::InvalidInput("no project loaded".into()))?;
    let project = store.project().await;
    let project_dir = state.projects_root.join(&project.slug);
    crate::export::export_edl(&project, std::path::Path::new(&output_path), &project_dir).await
}

#[tauri::command]
pub async fn export_fcpxml(state: State<'_, AppState>, output_path: String) -> AppResult<()> {
    let store = state
        .current_project
        .read()
        .await
        .clone()
        .ok_or_else(|| AppError::InvalidInput("no project loaded".into()))?;
    let project = store.project().await;
    let project_dir = state.projects_root.join(&project.slug);
    crate::export::export_fcpxml(&project, std::path::Path::new(&output_path), &project_dir).await
}

pub fn build_state() -> AppState {
    AppState {
        current_project: RwLock::new(None),
        projects_root: projects_root(),
        bin_paths: BinPaths {
            ytdlp: which::which("yt-dlp").map(|p| p.to_string_lossy().into_owned()).unwrap_or_else(|_| "yt-dlp".into()),
            font: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/fonts/Inter-Regular.ttf"),
        },
    }
}
