use crate::error::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

const KEYRING_SERVICE: &str = "video-broll";
const KEYRING_USER_ANTHROPIC: &str = "anthropic_api_key";
const KEYRING_USER_OPENAI: &str = "openai_api_key";
const KEYRING_USER_GROQ: &str = "groq_api_key";
const KEYRING_USER_PIXABAY: &str = "pixabay_api_key";
const KEYRING_USER_PEXELS: &str = "pexels_api_key";
const KEYRING_USER_YOUTUBE: &str = "youtube_api_key";

const DEFAULT_PROVIDER: &str = "anthropic_api";
const DEFAULT_ANTHROPIC_MODEL: &str = "claude-sonnet-4-6";
const DEFAULT_TRANSCRIPTION_PROVIDER: &str = "groq_api";
const DEFAULT_MODEL_PRESET: &str = "balanced";

/// Map a (preset, provider) tuple to a concrete model id. Returns `None` for
/// providers that don't have a meaningful model dial (CLI providers ride the
/// CLI's own default; preset is a no-op there).
///
/// Anthropic models follow the 4.x family; OpenAI follows the 4o family;
/// Ollama uses sizes that are reasonable on a developer laptop. Tweak by
/// editing here — the UI dropdowns derive from `available_models_for`.
pub fn preset_model_for(preset: &str, provider_id: &str) -> Option<&'static str> {
    match (preset, provider_id) {
        ("fast", "anthropic_api") => Some("claude-haiku-4-5"),
        ("balanced", "anthropic_api") => Some("claude-sonnet-4-6"),
        ("accurate", "anthropic_api") => Some("claude-opus-4-7"),

        ("fast", "openai_api") => Some("gpt-4o-mini"),
        ("balanced", "openai_api") => Some("gpt-4o"),
        ("accurate", "openai_api") => Some("gpt-4o"),

        ("fast", "ollama") => Some("llama3.2:3b"),
        ("balanced", "ollama") => Some("llama3.1:8b"),
        ("accurate", "ollama") => Some("llama3.1:70b"),

        // CLI providers ignore the preset.
        _ => None,
    }
}

/// All known models for the given provider — used to populate the advanced
/// dropdown. The first entry is treated as the default. Order is
/// fast→balanced→accurate so it matches the slider on screen.
pub fn available_models_for(provider_id: &str) -> &'static [&'static str] {
    match provider_id {
        "anthropic_api" => &["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-7"],
        "openai_api" => &["gpt-4o-mini", "gpt-4o", "o1-mini"],
        "ollama" => &[
            "llama3.2:3b",
            "llama3.1:8b",
            "llama3.1:70b",
            "qwen2.5:14b",
            "mistral",
        ],
        _ => &[],
    }
}

/// Persisted, non-secret application settings. Secrets live in the keyring.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct AppSettings {
    /// Identifier of the AI provider to use. One of `anthropic_api`,
    /// `openai_api`, `ollama`, `claude_cli`, `codex_cli`.
    pub selected_provider: String,
    /// Legacy field kept for backwards compatibility with older config files.
    /// New code reads `model_preset` + `model_overrides` instead.
    #[serde(default = "default_anthropic_model")]
    pub anthropic_model: String,
    /// Optional override for the Ollama daemon base URL.
    pub ollama_base_url: Option<String>,
    /// Optional override for the path to the `claude` CLI binary. When unset
    /// the binary is resolved via PATH.
    pub claude_cli_path: Option<String>,
    /// Optional override for the path to the `codex` CLI binary. When unset
    /// the binary is resolved via PATH.
    pub codex_cli_path: Option<String>,
    /// Identifier of the audio transcription provider. One of `groq_api`,
    /// `openai_api`. Defaults to `groq_api`.
    #[serde(default = "default_transcription_provider")]
    pub transcription_provider: String,
    /// Preset selector for the AI model: `fast`, `balanced`, `accurate`, or
    /// `custom`. When set to `custom`, the per-provider entry from
    /// `model_overrides` is used directly.
    #[serde(default = "default_model_preset")]
    pub model_preset: String,
    /// Per-provider model id used when `model_preset == "custom"`. Keyed by
    /// provider id. Missing entries fall back to the provider's default.
    #[serde(default)]
    pub model_overrides: HashMap<String, String>,
}

fn default_transcription_provider() -> String {
    DEFAULT_TRANSCRIPTION_PROVIDER.into()
}

fn default_anthropic_model() -> String {
    DEFAULT_ANTHROPIC_MODEL.into()
}

fn default_model_preset() -> String {
    DEFAULT_MODEL_PRESET.into()
}

impl AppSettings {
    /// Resolve the concrete model id to use for `provider_id` given the
    /// current preset and overrides. Returns `None` for providers without a
    /// configurable model (e.g. CLI providers).
    pub fn resolved_model(&self, provider_id: &str) -> Option<String> {
        if self.model_preset == "custom" {
            return self.model_overrides.get(provider_id).cloned();
        }
        preset_model_for(&self.model_preset, provider_id).map(|s| s.to_string())
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            selected_provider: DEFAULT_PROVIDER.into(),
            anthropic_model: DEFAULT_ANTHROPIC_MODEL.into(),
            ollama_base_url: None,
            claude_cli_path: None,
            codex_cli_path: None,
            transcription_provider: DEFAULT_TRANSCRIPTION_PROVIDER.into(),
            model_preset: DEFAULT_MODEL_PRESET.into(),
            model_overrides: HashMap::new(),
        }
    }
}

pub struct SettingsStore;

impl SettingsStore {
    // ---- Anthropic API key (legacy) ---------------------------------------

    pub fn set_anthropic_key(key: &str) -> AppResult<()> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_ANTHROPIC)?;
        entry.set_password(key)?;
        Ok(())
    }

    pub fn get_anthropic_key() -> AppResult<Option<String>> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_ANTHROPIC)?;
        match entry.get_password() {
            Ok(k) => Ok(Some(k)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn delete_anthropic_key() -> AppResult<()> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_ANTHROPIC)?;
        match entry.delete_credential() {
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.into()),
        }
    }

    // ---- OpenAI API key ---------------------------------------------------

    pub fn set_openai_key(key: &str) -> AppResult<()> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_OPENAI)?;
        entry.set_password(key)?;
        Ok(())
    }

    pub fn get_openai_key() -> AppResult<Option<String>> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_OPENAI)?;
        match entry.get_password() {
            Ok(k) => Ok(Some(k)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn delete_openai_key() -> AppResult<()> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_OPENAI)?;
        match entry.delete_credential() {
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.into()),
        }
    }

    // ---- Groq API key (transcription) ------------------------------------

    pub fn set_groq_key(key: &str) -> AppResult<()> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_GROQ)?;
        entry.set_password(key)?;
        Ok(())
    }

    pub fn get_groq_key() -> AppResult<Option<String>> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_GROQ)?;
        match entry.get_password() {
            Ok(k) => Ok(Some(k)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn delete_groq_key() -> AppResult<()> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_GROQ)?;
        match entry.delete_credential() {
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.into()),
        }
    }

    // ---- Pixabay API key (video search) ----------------------------------

    pub fn set_pixabay_key(key: &str) -> AppResult<()> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_PIXABAY)?;
        entry.set_password(key)?;
        Ok(())
    }

    pub fn get_pixabay_key() -> AppResult<Option<String>> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_PIXABAY)?;
        match entry.get_password() {
            Ok(k) => Ok(Some(k)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn delete_pixabay_key() -> AppResult<()> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_PIXABAY)?;
        match entry.delete_credential() {
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.into()),
        }
    }

    // ---- Pexels API key (video search) -----------------------------------

    pub fn set_pexels_key(key: &str) -> AppResult<()> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_PEXELS)?;
        entry.set_password(key)?;
        Ok(())
    }

    pub fn get_pexels_key() -> AppResult<Option<String>> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_PEXELS)?;
        match entry.get_password() {
            Ok(k) => Ok(Some(k)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn delete_pexels_key() -> AppResult<()> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_PEXELS)?;
        match entry.delete_credential() {
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.into()),
        }
    }

    // ---- YouTube Data API v3 key -----------------------------------------

    pub fn set_youtube_key(key: &str) -> AppResult<()> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_YOUTUBE)?;
        entry.set_password(key)?;
        Ok(())
    }

    pub fn get_youtube_key() -> AppResult<Option<String>> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_YOUTUBE)?;
        match entry.get_password() {
            Ok(k) => Ok(Some(k)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn delete_youtube_key() -> AppResult<()> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_YOUTUBE)?;
        match entry.delete_credential() {
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.into()),
        }
    }

    // ---- AppSettings on-disk persistence ---------------------------------

    /// Default location of the JSON settings file.
    fn default_settings_path() -> PathBuf {
        Self::settings_path()
    }

    /// Public accessor for the JSON settings file location. Used by callers
    /// that need to know whether the file already exists (e.g. first-run
    /// detection) without performing a full load.
    pub fn settings_path() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("video-broll")
            .join("settings.json")
    }

    /// Load settings from `path`, returning [`AppSettings::default`] when the
    /// file does not exist. Any deserialization error is propagated.
    pub fn load_settings_at(path: &std::path::Path) -> AppResult<AppSettings> {
        if !path.exists() {
            return Ok(AppSettings::default());
        }
        let bytes = std::fs::read(path)?;
        let parsed: AppSettings = serde_json::from_slice(&bytes)?;
        Ok(parsed)
    }

    /// Save `settings` to `path`, creating parent directories as needed.
    pub fn save_settings_at(path: &std::path::Path, settings: &AppSettings) -> AppResult<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_vec_pretty(settings)?;
        std::fs::write(path, json)?;
        Ok(())
    }

    /// Convenience wrapper using the default OS config path.
    pub fn load_settings() -> AppResult<AppSettings> {
        Self::load_settings_at(&Self::default_settings_path())
    }

    /// Convenience wrapper using the default OS config path.
    pub fn save_settings(settings: &AppSettings) -> AppResult<()> {
        Self::save_settings_at(&Self::default_settings_path(), settings)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_get_delete_anthropic_key_roundtrip() {
        let _ = SettingsStore::delete_anthropic_key();
        assert_eq!(SettingsStore::get_anthropic_key().unwrap(), None);

        SettingsStore::set_anthropic_key("sk-ant-test-12345").unwrap();
        assert_eq!(
            SettingsStore::get_anthropic_key().unwrap(),
            Some("sk-ant-test-12345".to_string())
        );

        SettingsStore::delete_anthropic_key().unwrap();
        assert_eq!(SettingsStore::get_anthropic_key().unwrap(), None);
    }

    #[test]
    fn set_get_delete_openai_key_roundtrip() {
        let _ = SettingsStore::delete_openai_key();
        assert_eq!(SettingsStore::get_openai_key().unwrap(), None);

        SettingsStore::set_openai_key("sk-openai-test-12345").unwrap();
        assert_eq!(
            SettingsStore::get_openai_key().unwrap(),
            Some("sk-openai-test-12345".to_string())
        );

        SettingsStore::delete_openai_key().unwrap();
        assert_eq!(SettingsStore::get_openai_key().unwrap(), None);
    }

    #[test]
    fn set_get_delete_groq_key_roundtrip() {
        let _ = SettingsStore::delete_groq_key();
        assert_eq!(SettingsStore::get_groq_key().unwrap(), None);

        SettingsStore::set_groq_key("gsk-test-12345").unwrap();
        assert_eq!(
            SettingsStore::get_groq_key().unwrap(),
            Some("gsk-test-12345".to_string())
        );

        SettingsStore::delete_groq_key().unwrap();
        assert_eq!(SettingsStore::get_groq_key().unwrap(), None);
    }

    #[test]
    fn set_get_delete_pixabay_key_roundtrip() {
        let _ = SettingsStore::delete_pixabay_key();
        assert_eq!(SettingsStore::get_pixabay_key().unwrap(), None);
        SettingsStore::set_pixabay_key("px-test-12345").unwrap();
        assert_eq!(
            SettingsStore::get_pixabay_key().unwrap(),
            Some("px-test-12345".to_string())
        );
        SettingsStore::delete_pixabay_key().unwrap();
        assert_eq!(SettingsStore::get_pixabay_key().unwrap(), None);
    }

    #[test]
    fn set_get_delete_pexels_key_roundtrip() {
        let _ = SettingsStore::delete_pexels_key();
        assert_eq!(SettingsStore::get_pexels_key().unwrap(), None);
        SettingsStore::set_pexels_key("pe-test-12345").unwrap();
        assert_eq!(
            SettingsStore::get_pexels_key().unwrap(),
            Some("pe-test-12345".to_string())
        );
        SettingsStore::delete_pexels_key().unwrap();
        assert_eq!(SettingsStore::get_pexels_key().unwrap(), None);
    }

    #[test]
    fn save_and_load_settings_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join("settings.json");
        // Missing file returns default.
        let loaded = SettingsStore::load_settings_at(&path).unwrap();
        assert_eq!(loaded, AppSettings::default());
        assert_eq!(loaded.transcription_provider, "groq_api");

        let mut to_save = AppSettings::default();
        to_save.selected_provider = "openai_api".into();
        to_save.ollama_base_url = Some("http://otherhost:11434".into());
        to_save.transcription_provider = "openai_api".into();
        SettingsStore::save_settings_at(&path, &to_save).unwrap();

        let reloaded = SettingsStore::load_settings_at(&path).unwrap();
        assert_eq!(reloaded.selected_provider, "openai_api");
        assert_eq!(
            reloaded.ollama_base_url.as_deref(),
            Some("http://otherhost:11434")
        );
        assert_eq!(reloaded.transcription_provider, "openai_api");
    }

    #[test]
    fn legacy_settings_without_transcription_provider_default_to_groq() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        // Write a legacy settings file lacking the new transcription_provider
        // key — load_settings_at must default to "groq_api".
        let legacy = r#"{
            "selected_provider": "anthropic_api",
            "anthropic_model": "claude-sonnet-4-6",
            "ollama_base_url": null,
            "claude_cli_path": null,
            "codex_cli_path": null
        }"#;
        std::fs::write(&path, legacy).unwrap();
        let loaded = SettingsStore::load_settings_at(&path).unwrap();
        assert_eq!(loaded.transcription_provider, "groq_api");
    }

    #[test]
    fn preset_model_for_maps_known_provider_presets() {
        assert_eq!(
            preset_model_for("fast", "anthropic_api"),
            Some("claude-haiku-4-5")
        );
        assert_eq!(preset_model_for("balanced", "openai_api"), Some("gpt-4o"));
        assert_eq!(preset_model_for("accurate", "ollama"), Some("llama3.1:70b"));
        assert_eq!(preset_model_for("balanced", "claude_cli"), None);
        assert_eq!(preset_model_for("unknown", "anthropic_api"), None);
    }

    #[test]
    fn resolved_model_prefers_custom_override() {
        let mut settings = AppSettings::default();
        settings.model_preset = "custom".into();
        settings
            .model_overrides
            .insert("anthropic_api".into(), "claude-opus-4-7".into());

        assert_eq!(
            settings.resolved_model("anthropic_api"),
            Some("claude-opus-4-7".to_string())
        );
        assert_eq!(settings.resolved_model("openai_api"), None);
    }

    #[test]
    fn legacy_settings_default_model_fields_are_populated() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let legacy = r#"{
            "selected_provider": "anthropic_api",
            "anthropic_model": "claude-sonnet-4-6",
            "ollama_base_url": null,
            "claude_cli_path": null,
            "codex_cli_path": null
        }"#;
        std::fs::write(&path, legacy).unwrap();
        let loaded = SettingsStore::load_settings_at(&path).unwrap();
        assert_eq!(loaded.model_preset, "balanced");
        assert!(loaded.model_overrides.is_empty());
        assert_eq!(
            loaded.resolved_model("anthropic_api"),
            Some("claude-sonnet-4-6".to_string())
        );
    }
}
