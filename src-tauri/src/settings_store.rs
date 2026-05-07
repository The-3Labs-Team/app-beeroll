use crate::error::*;
use serde::{Deserialize, Serialize};

const KEYRING_SERVICE: &str = "video-broll";
const KEYRING_USER_ANTHROPIC: &str = "anthropic_api_key";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub ai_provider: String,
    pub anthropic_model: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            ai_provider: "anthropic_api".into(),
            anthropic_model: "claude-sonnet-4-6".into(),
        }
    }
}

pub struct SettingsStore;

impl SettingsStore {
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
}
