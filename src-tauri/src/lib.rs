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
pub mod commands;

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
            ai_cli_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
