use crate::domain::*;
use crate::error::*;
use chrono::Utc;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct ProjectStore {
    root: PathBuf,
    project: Arc<RwLock<Project>>,
}

impl ProjectStore {
    pub async fn create(root: &Path, name: &str, voiceover: VoiceoverInput) -> AppResult<Self> {
        let slug = slug::slugify(name);
        let project_dir = root.join(&slug);
        if project_dir.exists() {
            return Err(AppError::InvalidInput(format!("project '{slug}' already exists")));
        }
        tokio::fs::create_dir_all(project_dir.join("audio")).await?;
        tokio::fs::create_dir_all(project_dir.join("clips")).await?;
        tokio::fs::create_dir_all(project_dir.join("cache")).await?;

        let project = Project {
            version: Project::CURRENT_VERSION,
            slug: slug.clone(),
            name: name.to_string(),
            created_at: Utc::now(),
            voiceover,
            transcript: Vec::new(),
            broll_points: Vec::new(),
        };

        let store = Self {
            root: project_dir,
            project: Arc::new(RwLock::new(project)),
        };
        store.save().await?;
        Ok(store)
    }

    pub async fn load(project_dir: &Path) -> AppResult<Self> {
        let path = project_dir.join("project.json");
        let bytes = tokio::fs::read(&path).await?;
        let project: Project = serde_json::from_slice(&bytes)?;
        Ok(Self {
            root: project_dir.to_path_buf(),
            project: Arc::new(RwLock::new(project)),
        })
    }

    pub async fn save(&self) -> AppResult<()> {
        let project = self.project.read().await;
        let path = self.root.join("project.json");
        let json = serde_json::to_string_pretty(&*project)?;
        tokio::fs::write(&path, json).await?;
        Ok(())
    }

    pub async fn project(&self) -> Project {
        self.project.read().await.clone()
    }

    pub async fn add_broll_point(&self, point: BRollPoint) -> AppResult<()> {
        {
            let mut project = self.project.write().await;
            project.broll_points.push(point);
        }
        self.save().await
    }

    pub async fn set_transcript(&self, segments: Vec<TranscriptSegment>) -> AppResult<()> {
        {
            let mut project = self.project.write().await;
            project.transcript = segments;
        }
        self.save().await
    }

    pub async fn update_broll_point<F>(&self, id: &str, updater: F) -> AppResult<()>
    where
        F: FnOnce(&mut BRollPoint),
    {
        {
            let mut project = self.project.write().await;
            let bp = project
                .broll_points
                .iter_mut()
                .find(|b| b.id == id)
                .ok_or_else(|| AppError::InvalidInput(format!("broll point {id} not found")))?;
            updater(bp);
        }
        self.save().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn dummy_voiceover() -> VoiceoverInput {
        VoiceoverInput {
            kind: VoiceoverKind::Text,
            path: "n/a".into(),
            duration_sec: None,
        }
    }

    #[tokio::test]
    async fn create_persists_project_json() {
        let tmp = TempDir::new().unwrap();
        let _store = ProjectStore::create(tmp.path(), "Test Episode", dummy_voiceover())
            .await
            .unwrap();
        let pj_path = tmp.path().join("test-episode").join("project.json");
        assert!(pj_path.exists(), "project.json should exist");
        let saved: Project = serde_json::from_str(&std::fs::read_to_string(pj_path).unwrap()).unwrap();
        assert_eq!(saved.name, "Test Episode");
        assert_eq!(saved.slug, "test-episode");
        assert_eq!(saved.version, 1);
    }

    #[tokio::test]
    async fn load_restores_project() {
        let tmp = TempDir::new().unwrap();
        {
            let store = ProjectStore::create(tmp.path(), "Restore Me", dummy_voiceover())
                .await
                .unwrap();
            store.save().await.unwrap();
        }
        let store = ProjectStore::load(&tmp.path().join("restore-me")).await.unwrap();
        assert_eq!(store.project().await.name, "Restore Me");
    }

    #[tokio::test]
    async fn set_transcript_persists() {
        let tmp = TempDir::new().unwrap();
        let store = ProjectStore::create(tmp.path(), "TS Test", dummy_voiceover())
            .await
            .unwrap();
        let segments = vec![
            TranscriptSegment { start: 0.0, end: 1.5, text: "hello".into() },
            TranscriptSegment { start: 1.5, end: 3.0, text: "world".into() },
        ];
        store.set_transcript(segments).await.unwrap();

        let reloaded = ProjectStore::load(&tmp.path().join("ts-test")).await.unwrap();
        let project = reloaded.project().await;
        assert_eq!(project.transcript.len(), 2);
        assert_eq!(project.transcript[0].text, "hello");
        assert_eq!(project.transcript[1].end, 3.0);
    }

    #[tokio::test]
    async fn add_broll_point_persists() {
        let tmp = TempDir::new().unwrap();
        let store = ProjectStore::create(tmp.path(), "BR Test", dummy_voiceover())
            .await
            .unwrap();
        let bp = BRollPoint {
            id: "bp_01".into(),
            theme: "".into(),
            phrase: "trail running".into(),
            t_start: None,
            t_end: None,
            keywords: vec!["trail".into()],
            active_keyword: "trail".into(),
            status: BRollStatus::Pending,
            selected_video: None,
            output_clip: None,
        };
        store.add_broll_point(bp.clone()).await.unwrap();

        let reloaded = ProjectStore::load(&tmp.path().join("br-test")).await.unwrap();
        assert_eq!(reloaded.project().await.broll_points.len(), 1);
        assert_eq!(reloaded.project().await.broll_points[0].id, "bp_01");
    }
}
