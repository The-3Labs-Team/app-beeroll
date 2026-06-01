use crate::domain::*;
use crate::error::*;
use chrono::Utc;
use std::collections::HashSet;
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

    /// Reset points stuck in a transient in-flight state to `Error`.
    ///
    /// `Downloading`, `Processing`, `Searching` and `Picking` are driven by a
    /// live task that does not survive an app restart (or a crash mid-overlay).
    /// Their persisted status would otherwise pin the point — and the project —
    /// in a spinner forever. Flipping them to `Error` on load lets the user
    /// retry or pick a different video. Returns the number of points reset.
    ///
    /// `active` holds the ids of points with a live task in *this* session
    /// (e.g. a download/overlay running right now). Those are genuinely
    /// in-flight, not orphaned, so they are skipped — otherwise a `project_load`
    /// triggered mid-download would wrongly flag the active point as failed.
    pub async fn reset_orphaned_inflight(&self, active: &HashSet<String>) -> AppResult<usize> {
        let mut changed = 0;
        {
            let mut project = self.project.write().await;
            for bp in project.broll_points.iter_mut() {
                if active.contains(&bp.id) {
                    continue;
                }
                if matches!(
                    bp.status,
                    BRollStatus::Downloading
                        | BRollStatus::Processing
                        | BRollStatus::Searching
                        | BRollStatus::Picking
                ) {
                    bp.status = BRollStatus::Error;
                    changed += 1;
                }
            }
        }
        if changed > 0 {
            self.save().await?;
        }
        Ok(changed)
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
            cached_results: Vec::new(),
            cached_keyword: None,
        };
        store.add_broll_point(bp.clone()).await.unwrap();

        let reloaded = ProjectStore::load(&tmp.path().join("br-test")).await.unwrap();
        assert_eq!(reloaded.project().await.broll_points.len(), 1);
        assert_eq!(reloaded.project().await.broll_points[0].id, "bp_01");
    }

    #[tokio::test]
    async fn reset_orphaned_inflight_flips_live_states_to_error() {
        let tmp = TempDir::new().unwrap();
        let store = ProjectStore::create(tmp.path(), "Orphan Test", dummy_voiceover())
            .await
            .unwrap();
        let make = |id: &str, status: BRollStatus| BRollPoint {
            id: id.into(),
            theme: "".into(),
            phrase: "p".into(),
            t_start: None,
            t_end: None,
            keywords: vec!["k".into()],
            active_keyword: "k".into(),
            status,
            selected_video: None,
            output_clip: None,
            cached_results: Vec::new(),
            cached_keyword: None,
        };
        store.add_broll_point(make("bp_dl", BRollStatus::Downloading)).await.unwrap();
        store.add_broll_point(make("bp_proc", BRollStatus::Processing)).await.unwrap();
        store.add_broll_point(make("bp_done", BRollStatus::Done)).await.unwrap();
        store.add_broll_point(make("bp_pending", BRollStatus::Pending)).await.unwrap();

        let n = store.reset_orphaned_inflight(&HashSet::new()).await.unwrap();
        assert_eq!(n, 2);

        // Reload from disk to confirm the reset was persisted.
        let reloaded = ProjectStore::load(&tmp.path().join("orphan-test")).await.unwrap();
        let project = reloaded.project().await;
        let status_of = |id: &str| -> BRollStatus {
            project.broll_points.iter().find(|b| b.id == id).unwrap().status.clone()
        };
        assert!(matches!(status_of("bp_dl"), BRollStatus::Error));
        assert!(matches!(status_of("bp_proc"), BRollStatus::Error));
        assert!(matches!(status_of("bp_done"), BRollStatus::Done));
        assert!(matches!(status_of("bp_pending"), BRollStatus::Pending));

        // Idempotent: a second pass with nothing live resets nothing.
        assert_eq!(store.reset_orphaned_inflight(&HashSet::new()).await.unwrap(), 0);
    }

    #[tokio::test]
    async fn reset_orphaned_inflight_skips_active_points() {
        let tmp = TempDir::new().unwrap();
        let store = ProjectStore::create(tmp.path(), "Active Test", dummy_voiceover())
            .await
            .unwrap();
        let make = |id: &str, status: BRollStatus| BRollPoint {
            id: id.into(),
            theme: "".into(),
            phrase: "p".into(),
            t_start: None,
            t_end: None,
            keywords: vec!["k".into()],
            active_keyword: "k".into(),
            status,
            selected_video: None,
            output_clip: None,
            cached_results: Vec::new(),
            cached_keyword: None,
        };
        store.add_broll_point(make("bp_live", BRollStatus::Downloading)).await.unwrap();
        store.add_broll_point(make("bp_orphan", BRollStatus::Processing)).await.unwrap();

        // bp_live has a live task in this session — it must NOT be reset.
        let active: HashSet<String> = ["bp_live".to_string()].into_iter().collect();
        let n = store.reset_orphaned_inflight(&active).await.unwrap();
        assert_eq!(n, 1);

        let project = store.project().await;
        let status_of = |id: &str| -> BRollStatus {
            project.broll_points.iter().find(|b| b.id == id).unwrap().status.clone()
        };
        assert!(matches!(status_of("bp_live"), BRollStatus::Downloading));
        assert!(matches!(status_of("bp_orphan"), BRollStatus::Error));
    }
}
