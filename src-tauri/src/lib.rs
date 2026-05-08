pub mod error;
pub mod domain;
pub mod project_store;
pub mod settings_store;
pub mod ai;
pub mod transcription;
pub mod extractor;
pub mod youtube_search;
pub mod video_processor;
pub mod download_manager;
pub mod toolchain_manager;
pub mod export;
pub mod commands;

use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .try_init();

    use crate::commands::*;

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(build_state())
        .setup(|app| {
            // Bootstrap yt-dlp in the background so the UI loads immediately.
            // The result is stored on AppState and broadcast via events; the
            // frontend ProjectsPage shows a spinner until the ready event
            // arrives (or `toolchain_bootstrap` returns true on first poll).
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match crate::toolchain_manager::ensure_ytdlp(&app_handle).await {
                    Ok(install) => {
                        tracing::info!(
                            "yt-dlp ready at {:?} (version {:?})",
                            install.path,
                            install.version
                        );
                        if let Some(state) =
                            app_handle.try_state::<crate::commands::AppState>()
                        {
                            let mut bin_paths = state.bin_paths.write().await;
                            bin_paths.ytdlp =
                                install.path.to_string_lossy().into_owned();
                        }
                        let _ = app_handle.emit(
                            "toolchain.ytdlp.ready",
                            serde_json::json!({
                                "path": install.path.to_string_lossy(),
                                "version": install.version,
                            }),
                        );
                    }
                    Err(e) => {
                        tracing::error!("yt-dlp install failed: {e}");
                        let _ = app_handle
                            .emit("toolchain.ytdlp.error", e.to_string());
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            project_create,
            project_load,
            project_list,
            settings_set_anthropic_key,
            settings_set_openai_key,
            settings_set_groq_key,
            settings_test_anthropic,
            settings_test_provider,
            settings_load,
            settings_save,
            extraction_run,
            transcription_run,
            search_run,
            pick_video,
            skip_point,
            open_project_folder,
            toolchain_status,
            toolchain_bootstrap,
            ai_cli_status,
            first_run_status,
            export_edl,
            export_fcpxml,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
