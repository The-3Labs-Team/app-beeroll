use crate::error::*;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const KEYRING_SERVICE: &str = "video-broll";
const KEYRING_USER_ANTHROPIC: &str = "anthropic_api_key";
const KEYRING_USER_OPENAI: &str = "openai_api_key";

const DEFAULT_PROVIDER: &str = "anthropic_api";
const DEFAULT_ANTHROPIC_MODEL: &str = "claude-sonnet-4-6";

/// Persisted, non-secret application settings. Secrets live in the keyring.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct AppSettings {
    /// Identifier of the AI provider to use. One of `anthropic_api`,
    /// `openai_api`, `ollama`, `claude_cli`, `codex_cli`.
    pub selected_provider: String,
    /// Legacy field kept for backwards compatibility; the existing
    /// `AnthropicProvider` ignores it and uses its built-in default.
    pub anthropic_model: String,
    /// Optional override for the Ollama daemon base URL.
    pub ollama_base_url: Option<String>,
    /// Optional override for the path to the `claude` CLI binary. When unset
    /// the binary is resolved via PATH.
    pub claude_cli_path: Option<String>,
    /// Optional override for the path to the `codex` CLI binary. When unset
    /// the binary is resolved via PATH.
    pub codex_cli_path: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            selected_provider: DEFAULT_PROVIDER.into(),
            anthropic_model: DEFAULT_ANTHROPIC_MODEL.into(),
            ollama_base_url: None,
            claude_cli_path: None,
            codex_cli_path: None,
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

    // ---- AppSettings on-disk persistence ---------------------------------

    /// Default location of the JSON settings file.
    fn default_settings_path() -> PathBuf {
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
    fn save_and_load_settings_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join("settings.json");
        // Missing file returns default.
        let loaded = SettingsStore::load_settings_at(&path).unwrap();
        assert_eq!(loaded, AppSettings::default());

        let mut to_save = AppSettings::default();
        to_save.selected_provider = "openai_api".into();
        to_save.ollama_base_url = Some("http://otherhost:11434".into());
        SettingsStore::save_settings_at(&path, &to_save).unwrap();

        let reloaded = SettingsStore::load_settings_at(&path).unwrap();
        assert_eq!(reloaded.selected_provider, "openai_api");
        assert_eq!(
            reloaded.ollama_base_url.as_deref(),
            Some("http://otherhost:11434")
        );
    }
}
