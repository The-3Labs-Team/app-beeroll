//! EDL (CMX 3600) and FCPXML 1.10 export for the assembled B-Roll timeline.
//!
//! Both exporters consume the in-memory [`Project`] and emit a timeline that
//! references the per-point output clips written under
//! `<projects_root>/<slug>/clips/`. Only [`BRollPoint`]s with status
//! [`BRollStatus::Done`] and an `output_clip` set are included; everything
//! else is skipped silently so the resulting EDL/FCPXML reflects what is
//! actually on disk.
//!
//! Frame rate is configurable so callers can pick PAL (25) or NTSC (30); the
//! Tauri commands default to 25fps. We deliberately stay on simple
//! non-drop-frame timecode here — frame-accurate drop-frame math (29.97)
//! would require more bookkeeping than this MVP needs.
//!
//! Tests at the bottom of this file pin both the timecode arithmetic and the
//! shape of the emitted text, since malformed timecodes produce files that
//! editors silently misinterpret.
use crate::domain::{BRollPoint, BRollStatus, Project};
use crate::error::AppResult;
use std::path::Path;

/// Default frame rate for both exporters when the caller does not supply one.
/// PAL 25fps keeps the math integer-clean (1 frame = 0.04s) and is a safe
/// default for editors that accept both 25 and 30 (FCP, Resolve, Premiere).
pub const DEFAULT_FPS: f64 = 25.0;

/// Format `seconds` as a `HH:MM:SS:FF` non-drop-frame timecode for the given
/// frame rate. The frame count is rounded to the nearest frame so callers
/// don't need to pre-quantise their inputs.
fn format_timecode(seconds: f64, fps: f64) -> String {
    let total_frames = (seconds.max(0.0) * fps).round() as u64;
    let fps_int = fps.round() as u64;
    let frames_per_hour = fps_int * 3600;
    let frames_per_minute = fps_int * 60;
    let h = total_frames / frames_per_hour;
    let m = (total_frames % frames_per_hour) / frames_per_minute;
    let s = (total_frames % frames_per_minute) / fps_int;
    let f = total_frames % fps_int;
    format!("{:02}:{:02}:{:02}:{:02}", h, m, s, f)
}

/// Resolve the on-disk timeline duration of a single B-Roll point.
///
/// Preference order: explicit `t_end - t_start` (the slot the editor cut on
/// the voiceover timeline), then the YouTube clip duration as a fallback,
/// then a 5s default so we never emit a zero-length edit. Negative or
/// nonsense ranges are clamped away.
fn point_duration_seconds(point: &BRollPoint) -> f64 {
    if let (Some(start), Some(end)) = (point.t_start, point.t_end) {
        let dur = end - start;
        if dur > 0.0 {
            return dur;
        }
    }
    if let Some(video) = &point.selected_video {
        if video.duration_sec > 0 {
            return video.duration_sec as f64;
        }
    }
    5.0
}

/// Extract just the basename (e.g. `0001_clip.mp4`) of a project-relative
/// `output_clip` like `clips/0001_clip.mp4`. Used as the human-readable
/// CLIP NAME in EDL comments and as the FCPXML asset/clip `name`.
fn output_clip_basename(output_clip: &str) -> String {
    Path::new(output_clip)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| output_clip.to_string())
}

/// Strip the `.mp4` (or any) extension off the basename for FCPXML asset
/// `name` attributes; keeps the IDs short and readable in editors.
fn output_clip_stem(output_clip: &str) -> String {
    Path::new(output_clip)
        .file_stem()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| output_clip_basename(output_clip))
}

/// Return only the points eligible for the timeline: status Done with a
/// resolved `output_clip`. The original point order from the project is
/// preserved so consecutive points line up on the spine.
fn done_points(project: &Project) -> Vec<&BRollPoint> {
    project
        .broll_points
        .iter()
        .filter(|p| matches!(p.status, BRollStatus::Done) && p.output_clip.is_some())
        .collect()
}

/// Build a CMX 3600 EDL string for the project at the given frame rate.
///
/// Edit numbers are 3-digit (`001` … `999`). Each edit:
///   - reel `AX` (any source — ubiquitous when the source isn't a tape),
///   - track `V` (video only — the voiceover stays separate),
///   - transition `C` (cut),
///   - source IN `00:00:00:00` and source OUT = the clip's used duration,
///   - record IN/OUT positions on the voiceover timeline.
/// A `* FROM CLIP NAME: <basename>` comment line follows each edit so the
/// imported timeline keeps human-readable filenames in the editor's bins.
pub fn build_edl_with_fps(project: &Project, _project_dir: &Path, fps: f64) -> String {
    let mut out = String::new();
    out.push_str(&format!("TITLE: {}\n", project.name));
    out.push_str("FCM: NON-DROP FRAME\n\n");

    let mut record_cursor = 0.0_f64;
    for (i, point) in done_points(project).iter().enumerate() {
        let edit_num = i + 1;
        let dur = point_duration_seconds(point);
        // Prefer the editor-assigned t_start when available so the EDL
        // reflects the actual placement on the voiceover timeline; fall
        // back to a continuous lay-down otherwise.
        let record_in = point.t_start.unwrap_or(record_cursor);
        let record_out = record_in + dur;

        let src_in = format_timecode(0.0, fps);
        let src_out = format_timecode(dur, fps);
        let rec_in = format_timecode(record_in, fps);
        let rec_out = format_timecode(record_out, fps);

        out.push_str(&format!(
            "{:03}  AX       V     C        {}  {}  {}  {}\n",
            edit_num, src_in, src_out, rec_in, rec_out
        ));
        if let Some(clip) = &point.output_clip {
            out.push_str(&format!("* FROM CLIP NAME: {}\n", output_clip_basename(clip)));
        }
        out.push('\n');

        record_cursor = record_out;
    }

    out
}

/// Convenience wrapper: build an EDL with [`DEFAULT_FPS`].
pub fn build_edl(project: &Project, project_dir: &Path) -> String {
    build_edl_with_fps(project, project_dir, DEFAULT_FPS)
}

/// XML escape only what's strictly needed inside attribute values: `&`, `<`,
/// `"`. We never embed user input in element bodies, so `>` and `'` would be
/// safe to leave alone, but escaping them too keeps the function general and
/// resists accidental misuse.
fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

/// Render a duration in seconds as the `N/Ds` rational FCPXML expects, where
/// `D = fps * 100`. Example: 1s @25fps = `2500/2500s`. The `fps * 100`
/// denominator keeps every emitted fraction integer-friendly and matches
/// what Final Cut writes for `frameDuration="100/2500s"`.
fn fcpxml_time(seconds: f64, fps: f64) -> String {
    let denom = (fps * 100.0).round() as i64;
    let num = (seconds * denom as f64).round() as i64;
    if num == 0 {
        "0s".to_string()
    } else {
        format!("{}/{}s", num, denom)
    }
}

/// Build a `file://` URL for the project-relative `output_clip` rooted at
/// `project_dir`. Final Cut and Resolve both accept this form; the URL
/// contains a single leading slash on POSIX (`file:///abs/path`).
fn clip_file_url(project_dir: &Path, output_clip: &str) -> String {
    let abs = project_dir.join(output_clip);
    let abs_str = abs.to_string_lossy().to_string();
    let with_slash = if abs_str.starts_with('/') {
        abs_str
    } else {
        format!("/{}", abs_str)
    };
    format!("file://{}", with_slash)
}

/// Build an FCPXML 1.10 document for the project. The document contains a
/// single `<format>`, one `<asset>` per Done clip, and a sequential
/// `<spine>` that lays the assets back-to-back; each asset-clip's `offset`
/// is computed by accumulating the prior clips' durations.
pub fn build_fcpxml_with_fps(project: &Project, project_dir: &Path, fps: f64) -> String {
    let points = done_points(project);
    let fps_int = fps.round() as i64;
    let denom = fps_int * 100;
    // 1080p25 / 1080p30 are the only formats we name explicitly; anything
    // else falls back to a generic name so we don't claim format support
    // we haven't verified.
    let format_name = match fps_int {
        25 => "FFVideoFormat1080p25",
        30 => "FFVideoFormat1080p30",
        _ => "FFVideoFormat1080p",
    };

    // Total sequence duration is the sum of every clip duration in frames,
    // expressed as a rational at the chosen frame rate. We accumulate it
    // alongside the spine so the <sequence duration=…> matches the spine.
    let mut total_seconds = 0.0_f64;
    let mut spine_xml = String::new();
    let mut resources_xml = String::new();
    let mut offset_seconds = 0.0_f64;

    for (i, point) in points.iter().enumerate() {
        let id = i + 1;
        let dur = point_duration_seconds(point);
        let output_clip = point.output_clip.as_deref().unwrap_or("");
        let basename = output_clip_basename(output_clip);
        let stem = output_clip_stem(output_clip);
        let url = clip_file_url(project_dir, output_clip);
        let dur_attr = fcpxml_time(dur, fps);
        let off_attr = fcpxml_time(offset_seconds, fps);

        resources_xml.push_str(&format!(
            "    <asset id=\"a{id}\" name=\"{name}\" src=\"{src}\" hasVideo=\"1\" hasAudio=\"1\" duration=\"{dur}\" format=\"r1\"/>\n",
            id = id,
            name = xml_escape(&stem),
            src = xml_escape(&url),
            dur = dur_attr,
        ));
        // Comment carries the original full basename (including extension)
        // so the editor's bins still show the on-disk filename even if the
        // asset/clip `name` is the stem.
        spine_xml.push_str(&format!(
            "          <asset-clip ref=\"a{id}\" offset=\"{off}\" duration=\"{dur}\" name=\"{name}\"/>\n",
            id = id,
            off = off_attr,
            dur = dur_attr,
            name = xml_escape(&basename),
        ));

        offset_seconds += dur;
        total_seconds += dur;
    }

    let total_attr = fcpxml_time(total_seconds, fps);
    let escaped_name = xml_escape(&project.name);

    let mut out = String::new();
    out.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    out.push_str("<!DOCTYPE fcpxml>\n");
    out.push_str("<fcpxml version=\"1.10\">\n");
    out.push_str("  <resources>\n");
    out.push_str(&format!(
        "    <format id=\"r1\" name=\"{name}\" frameDuration=\"100/{denom}s\" width=\"1920\" height=\"1080\"/>\n",
        name = format_name,
        denom = denom,
    ));
    out.push_str(&resources_xml);
    out.push_str("  </resources>\n");
    out.push_str("  <library>\n");
    out.push_str(&format!("    <event name=\"{}\">\n", escaped_name));
    out.push_str(&format!("      <project name=\"{}\">\n", escaped_name));
    out.push_str(&format!(
        "        <sequence format=\"r1\" duration=\"{dur}\" tcStart=\"0s\" tcFormat=\"NDF\">\n",
        dur = total_attr,
    ));
    out.push_str("          <spine>\n");
    out.push_str(&spine_xml);
    out.push_str("          </spine>\n");
    out.push_str("        </sequence>\n");
    out.push_str("      </project>\n");
    out.push_str("    </event>\n");
    out.push_str("  </library>\n");
    out.push_str("</fcpxml>\n");

    out
}

/// Convenience wrapper: build FCPXML with [`DEFAULT_FPS`].
pub fn build_fcpxml(project: &Project, project_dir: &Path) -> String {
    build_fcpxml_with_fps(project, project_dir, DEFAULT_FPS)
}

/// Asynchronously write the EDL for `project` to `output`. `project_dir`
/// is currently unused for EDL (clip names are basenames) but is kept in
/// the signature for symmetry with [`export_fcpxml`] and to allow future
/// reel-name resolution.
pub async fn export_edl(project: &Project, output: &Path, project_dir: &Path) -> AppResult<()> {
    let edl = build_edl(project, project_dir);
    tokio::fs::write(output, edl).await?;
    Ok(())
}

/// Asynchronously write FCPXML for `project` to `output`. `project_dir`
/// is required so emitted asset URLs can resolve to absolute on-disk
/// paths (`file:///…`).
pub async fn export_fcpxml(project: &Project, output: &Path, project_dir: &Path) -> AppResult<()> {
    let xml = build_fcpxml(project, project_dir);
    tokio::fs::write(output, xml).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{
        BRollPoint, BRollStatus, Project, VideoCandidate, VideoSourceId, VoiceoverInput,
        VoiceoverKind,
    };
    use chrono::Utc;
    use tempfile::TempDir;

    fn sample_project() -> Project {
        Project {
            version: 1,
            slug: "test".into(),
            name: "Test Project".into(),
            created_at: Utc::now(),
            voiceover: VoiceoverInput {
                kind: VoiceoverKind::Text,
                path: "voiceover.txt".into(),
                duration_sec: None,
            },
            transcript: vec![],
            broll_points: vec![
                BRollPoint {
                    id: "bp_01".into(),
                    theme: "".into(),
                    phrase: "first".into(),
                    t_start: Some(0.0),
                    t_end: Some(5.0),
                    keywords: vec![],
                    active_keyword: "".into(),
                    status: BRollStatus::Done,
                    selected_video: Some(VideoCandidate {
                        source: VideoSourceId::Youtube,
                        video_id: "abc".into(),
                        title: "First Video".into(),
                        channel: "Ch1".into(),
                        duration_sec: 125,
                        thumb_url: "".into(),
                        url: "".into(),
                        stream_url: None,
                    }),
                    output_clip: Some("clips/0001_first.mp4".into()),
                },
                BRollPoint {
                    id: "bp_02".into(),
                    theme: "".into(),
                    phrase: "second".into(),
                    t_start: Some(5.0),
                    t_end: Some(8.0),
                    keywords: vec![],
                    active_keyword: "".into(),
                    status: BRollStatus::Skipped,
                    selected_video: None,
                    output_clip: None,
                },
            ],
        }
    }

    fn sample_project_two_done() -> Project {
        let mut p = sample_project();
        p.broll_points.push(BRollPoint {
            id: "bp_03".into(),
            theme: "".into(),
            phrase: "third".into(),
            t_start: Some(10.0),
            t_end: Some(13.0),
            keywords: vec![],
            active_keyword: "".into(),
            status: BRollStatus::Done,
            selected_video: Some(VideoCandidate {
                source: VideoSourceId::Youtube,
                video_id: "def".into(),
                title: "Third Video".into(),
                channel: "Ch2".into(),
                duration_sec: 60,
                thumb_url: "".into(),
                url: "".into(),
                stream_url: None,
            }),
            output_clip: Some("clips/0003_third.mp4".into()),
        });
        p
    }

    #[test]
    fn build_edl_includes_only_done_points() {
        let p = sample_project();
        let edl = build_edl(&p, std::path::Path::new("/tmp/test"));
        assert!(edl.contains("TITLE: Test Project"));
        assert!(edl.contains("0001_first.mp4"));
        assert!(!edl.contains("bp_02"));
        assert!(edl.contains("001  AX"));
        // Only one Done edit: there must not be an edit numbered 002
        assert!(!edl.contains("002  AX"));
    }

    #[test]
    fn build_edl_emits_fcm_header() {
        let p = sample_project();
        let edl = build_edl(&p, std::path::Path::new("/tmp/test"));
        assert!(edl.contains("FCM: NON-DROP FRAME"));
    }

    #[test]
    fn build_edl_record_timecodes_use_t_start() {
        let p = sample_project_two_done();
        let edl = build_edl(&p, std::path::Path::new("/tmp/test"));
        // First point: 0..5s -> 00:00:00:00..00:00:05:00 record
        assert!(edl.contains("00:00:00:00  00:00:05:00  00:00:00:00  00:00:05:00"));
        // Second point: 10..13s -> source 0..3, record 10..13
        assert!(edl.contains("00:00:00:00  00:00:03:00  00:00:10:00  00:00:13:00"));
    }

    #[test]
    fn build_fcpxml_has_well_formed_structure() {
        let p = sample_project();
        let xml = build_fcpxml(&p, std::path::Path::new("/tmp/test"));
        assert!(xml.starts_with("<?xml"));
        assert!(xml.contains("<fcpxml version="));
        assert!(xml.contains("file:///tmp/test/clips/0001_first.mp4"));
        assert!(xml.contains("<event name=\"Test Project\""));
        assert!(xml.contains("<asset id=\"a1\""));
        assert!(xml.contains("frameDuration=\"100/2500s\""));
    }

    #[test]
    fn build_fcpxml_offsets_accumulate() {
        let p = sample_project_two_done();
        let xml = build_fcpxml(&p, std::path::Path::new("/tmp/test"));
        // First clip at offset 0, 5s long => 12500/2500s
        assert!(xml.contains("offset=\"0s\""));
        assert!(xml.contains("duration=\"12500/2500s\""));
        // Second clip at offset 5s => 12500/2500s, duration 3s => 7500/2500s
        assert!(xml.contains("offset=\"12500/2500s\""));
        assert!(xml.contains("duration=\"7500/2500s\""));
        // Sequence duration = 8s = 20000/2500s
        assert!(xml.contains("duration=\"20000/2500s\""));
    }

    #[test]
    fn build_fcpxml_escapes_project_name() {
        let mut p = sample_project();
        p.name = "Q&A <Ep 1>".into();
        let xml = build_fcpxml(&p, std::path::Path::new("/tmp/test"));
        assert!(xml.contains("Q&amp;A &lt;Ep 1&gt;"));
        assert!(!xml.contains("Q&A <Ep 1>"));
    }

    #[tokio::test]
    async fn export_edl_writes_file() {
        let tmp = TempDir::new().unwrap();
        let output = tmp.path().join("out.edl");
        let p = sample_project();
        export_edl(&p, &output, &tmp.path()).await.unwrap();
        assert!(output.exists());
        let content = std::fs::read_to_string(&output).unwrap();
        assert!(content.contains("TITLE"));
    }

    #[tokio::test]
    async fn export_fcpxml_writes_file() {
        let tmp = TempDir::new().unwrap();
        let output = tmp.path().join("out.fcpxml");
        let p = sample_project();
        export_fcpxml(&p, &output, &tmp.path()).await.unwrap();
        assert!(output.exists());
        let content = std::fs::read_to_string(&output).unwrap();
        assert!(content.contains("<fcpxml"));
    }

    #[test]
    fn format_timecode_25fps() {
        assert_eq!(format_timecode(0.0, 25.0), "00:00:00:00");
        assert_eq!(format_timecode(1.0, 25.0), "00:00:01:00");
        assert_eq!(format_timecode(60.0, 25.0), "00:01:00:00");
        assert_eq!(format_timecode(0.04, 25.0), "00:00:00:01");
        // 25 frames in -> 1 second
        assert_eq!(format_timecode(0.04 * 25.0, 25.0), "00:00:01:00");
        // Hour rollover
        assert_eq!(format_timecode(3600.0, 25.0), "01:00:00:00");
        // Frame-accurate sub-second math: 12 frames @ 25fps = 0.48s
        assert_eq!(format_timecode(0.48, 25.0), "00:00:00:12");
    }

    #[test]
    fn format_timecode_30fps() {
        assert_eq!(format_timecode(0.0, 30.0), "00:00:00:00");
        assert_eq!(format_timecode(1.0, 30.0), "00:00:01:00");
        assert_eq!(format_timecode(1.0 / 30.0, 30.0), "00:00:00:01");
    }

    #[test]
    fn fcpxml_time_zero_is_short() {
        // FCPXML accepts a bare "0s" for zero offsets and Final Cut
        // canonicalises to that form on round-trip.
        assert_eq!(fcpxml_time(0.0, 25.0), "0s");
    }

    #[test]
    fn fcpxml_time_one_second_at_25fps() {
        assert_eq!(fcpxml_time(1.0, 25.0), "2500/2500s");
    }

    #[test]
    fn point_duration_prefers_t_range() {
        let mut p = sample_project().broll_points.into_iter().next().unwrap();
        p.t_start = Some(2.0);
        p.t_end = Some(7.5);
        assert!((point_duration_seconds(&p) - 5.5).abs() < 1e-9);
    }

    #[test]
    fn point_duration_falls_back_to_video_duration() {
        let mut p = sample_project().broll_points.into_iter().next().unwrap();
        p.t_start = None;
        p.t_end = None;
        // selected_video.duration_sec = 125
        assert!((point_duration_seconds(&p) - 125.0).abs() < 1e-9);
    }

    #[test]
    fn point_duration_default_when_nothing_known() {
        let mut p = sample_project().broll_points.into_iter().next().unwrap();
        p.t_start = None;
        p.t_end = None;
        p.selected_video = None;
        assert!((point_duration_seconds(&p) - 5.0).abs() < 1e-9);
    }

    #[test]
    fn output_clip_basename_strips_directory() {
        assert_eq!(output_clip_basename("clips/0001_x.mp4"), "0001_x.mp4");
        assert_eq!(output_clip_basename("0002_y.mp4"), "0002_y.mp4");
    }
}
