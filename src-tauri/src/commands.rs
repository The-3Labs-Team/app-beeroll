use crate::ai::anthropic::AnthropicProvider;
use crate::ai::AIProvider;
use crate::domain::*;
use crate::download_manager::DownloadManager;
use crate::error::{AppError, AppResult};
use crate::extractor::BRollExtractor;
use crate::project_store::ProjectStore;
use crate::settings_store::SettingsStore;
use crate::video_processor::VideoProcessor;
use crate::youtube_search::YouTubeSearch;
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
    pub ffmpeg: String,
    pub font: PathBuf,
}

fn projects_root() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")).join("B-Roll Projects")
}

#[tauri::command]
pub async fn project_create(
    state: State<'_, AppState>,
    name: String,
    text_voiceover: String,
) -> AppResult<Project> {
    if name.trim().is_empty() {
        return Err(AppError::InvalidInput("name is empty".into()));
    }
    let voiceover = VoiceoverInput {
        kind: VoiceoverKind::Text,
        path: "voiceover.txt".into(),
        duration_sec: None,
    };
    tokio::fs::create_dir_all(&state.projects_root).await?;
    let store = ProjectStore::create(&state.projects_root, &name, voiceover).await?;
    let project_dir = state.projects_root.join(slug::slugify(&name));
    tokio::fs::write(project_dir.join("voiceover.txt"), &text_voiceover).await?;
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

#[tauri::command]
pub async fn settings_set_anthropic_key(key: String) -> AppResult<()> {
    SettingsStore::set_anthropic_key(&key)
}

#[tauri::command]
pub async fn settings_test_anthropic() -> AppResult<bool> {
    let key = SettingsStore::get_anthropic_key()?
        .ok_or_else(|| AppError::InvalidInput("no anthropic key set".into()))?;
    let provider = AnthropicProvider::new(key);
    let result = provider.complete("Reply with just OK", "ping").await?;
    Ok(result.to_lowercase().contains("ok"))
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
    let voiceover_path = state.projects_root.join(&project.slug).join(&project.voiceover.path);
    let transcript = tokio::fs::read_to_string(&voiceover_path).await?;

    let key = SettingsStore::get_anthropic_key()?
        .ok_or_else(|| AppError::InvalidInput("anthropic api key not set".into()))?;
    let provider: Arc<dyn AIProvider> = Arc::new(AnthropicProvider::new(key));
    let extractor = BRollExtractor::new(provider);
    app.emit("extraction.progress", serde_json::json!({"step":"calling_ai","message":"Calling Anthropic API"})).ok();
    let points = extractor.extract(&transcript).await?;

    for p in &points {
        store.add_broll_point(p.clone()).await?;
    }
    let project_after = store.project().await;
    app.emit("project.updated", &project_after).ok();
    Ok(points)
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

    let vp = VideoProcessor::new(state.bin_paths.ffmpeg.clone(), state.bin_paths.font.clone());
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

pub fn build_state() -> AppState {
    AppState {
        current_project: RwLock::new(None),
        projects_root: projects_root(),
        bin_paths: BinPaths {
            ytdlp: which::which("yt-dlp").map(|p| p.to_string_lossy().into_owned()).unwrap_or_else(|_| "yt-dlp".into()),
            ffmpeg: which::which("ffmpeg").map(|p| p.to_string_lossy().into_owned()).unwrap_or_else(|_| "ffmpeg".into()),
            font: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/fonts/Inter-Regular.ttf"),
        },
    }
}
