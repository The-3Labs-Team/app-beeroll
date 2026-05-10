use crate::domain::{VideoCandidate, VideoSourceId};
use crate::error::AppResult;
use async_trait::async_trait;
use std::sync::Arc;

pub mod pexels;
pub mod pixabay;
pub mod youtube;
pub mod youtube_api;

pub use pexels::PexelsSource;
pub use pixabay::PixabaySource;
pub use youtube::YouTubeSource;
pub use youtube_api::YouTubeApiSource;

#[async_trait]
pub trait VideoSource: Send + Sync {
    fn id(&self) -> VideoSourceId;
    async fn search(&self, keyword: &str, limit: u8) -> AppResult<Vec<VideoCandidate>>;
}

pub struct MultiSourceSearch {
    sources: Vec<Arc<dyn VideoSource>>,
}

impl MultiSourceSearch {
    pub fn new(sources: Vec<Arc<dyn VideoSource>>) -> Self {
        Self { sources }
    }

    pub async fn search(&self, keyword: &str, per_source: u8) -> Vec<VideoCandidate> {
        let kw = keyword.to_string();
        let futs: Vec<_> = self
            .sources
            .iter()
            .map(|s| {
                let s = s.clone();
                let kw = kw.clone();
                async move { (s.id(), s.search(&kw, per_source).await) }
            })
            .collect();
        let results = futures::future::join_all(futs).await;

        let mut per_source_lists: Vec<Vec<VideoCandidate>> = Vec::new();
        for (id, r) in results {
            match r {
                Ok(v) => per_source_lists.push(v),
                Err(e) => tracing::warn!(source = ?id, error = %e, "source search failed, skipped"),
            }
        }
        interleave(per_source_lists)
    }
}

fn interleave(mut lists: Vec<Vec<VideoCandidate>>) -> Vec<VideoCandidate> {
    let mut out = Vec::new();
    let max = lists.iter().map(|l| l.len()).max().unwrap_or(0);
    for i in 0..max {
        for list in lists.iter_mut() {
            if i < list.len() {
                out.push(list[i].clone());
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::VideoCandidate;

    fn cand(source: VideoSourceId, id: &str) -> VideoCandidate {
        VideoCandidate {
            source,
            video_id: id.into(),
            title: id.into(),
            channel: "ch".into(),
            duration_sec: 0,
            thumb_url: "".into(),
            url: "".into(),
            stream_url: None,
        }
    }

    struct StaticSource(VideoSourceId, Vec<VideoCandidate>, bool);

    #[async_trait]
    impl VideoSource for StaticSource {
        fn id(&self) -> VideoSourceId {
            self.0.clone()
        }
        async fn search(&self, _kw: &str, _l: u8) -> AppResult<Vec<VideoCandidate>> {
            if self.2 {
                Err(crate::error::AppError::AiProvider("forced".into()))
            } else {
                Ok(self.1.clone())
            }
        }
    }

    #[tokio::test]
    async fn interleave_round_robin_three_sources() {
        let yt = vec![
            cand(VideoSourceId::Youtube, "yt1"),
            cand(VideoSourceId::Youtube, "yt2"),
            cand(VideoSourceId::Youtube, "yt3"),
        ];
        let px = vec![
            cand(VideoSourceId::Pixabay, "px1"),
            cand(VideoSourceId::Pixabay, "px2"),
        ];
        let pe = vec![cand(VideoSourceId::Pexels, "pe1")];
        let agg = MultiSourceSearch::new(vec![
            Arc::new(StaticSource(VideoSourceId::Youtube, yt, false)),
            Arc::new(StaticSource(VideoSourceId::Pixabay, px, false)),
            Arc::new(StaticSource(VideoSourceId::Pexels, pe, false)),
        ]);
        let result = agg.search("k", 9).await;
        let ids: Vec<&str> = result.iter().map(|c| c.video_id.as_str()).collect();
        assert_eq!(ids, vec!["yt1", "px1", "pe1", "yt2", "px2", "yt3"]);
    }

    #[tokio::test]
    async fn skips_failed_source() {
        let yt = vec![cand(VideoSourceId::Youtube, "yt1")];
        let pe = vec![cand(VideoSourceId::Pexels, "pe1")];
        let agg = MultiSourceSearch::new(vec![
            Arc::new(StaticSource(VideoSourceId::Youtube, yt, false)),
            Arc::new(StaticSource(VideoSourceId::Pixabay, vec![], true)),
            Arc::new(StaticSource(VideoSourceId::Pexels, pe, false)),
        ]);
        let result = agg.search("k", 9).await;
        let ids: Vec<&str> = result.iter().map(|c| c.video_id.as_str()).collect();
        assert_eq!(ids, vec!["yt1", "pe1"]);
    }

    #[tokio::test]
    async fn passes_per_source_limit_to_each_source() {
        struct LimitSource(VideoSourceId);

        #[async_trait]
        impl VideoSource for LimitSource {
            fn id(&self) -> VideoSourceId {
                self.0.clone()
            }

            async fn search(&self, _kw: &str, limit: u8) -> AppResult<Vec<VideoCandidate>> {
                Ok(vec![cand(self.0.clone(), &format!("limit-{limit}"))])
            }
        }

        let agg = MultiSourceSearch::new(vec![
            Arc::new(LimitSource(VideoSourceId::Youtube)),
            Arc::new(LimitSource(VideoSourceId::Pexels)),
        ]);
        let result = agg.search("k", 4).await;
        let ids: Vec<&str> = result.iter().map(|c| c.video_id.as_str()).collect();
        assert_eq!(ids, vec!["limit-4", "limit-4"]);
    }
}
