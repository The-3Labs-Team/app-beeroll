//! In-memory log buffer surfaced to the UI.
//!
//! A `tracing` [`Layer`] that captures every WARN/ERROR event into a bounded
//! ring buffer. The frontend reads it via the `logs_get` command and renders
//! it in the Cmd+L modal — useful when an operation fails (download, AI
//! call) and the user wants the *real* error message instead of the short
//! summary the toast carries.
//!
//! Lower-severity events (INFO/DEBUG/TRACE) are dropped here to keep the
//! buffer small. They still reach the fmt layer and stdout/stderr.

use serde::Serialize;
use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};
use tracing::{Event, Level, Subscriber};
use tracing_subscriber::layer::Context;
use tracing_subscriber::Layer;

const LOG_CAP: usize = 500;

#[derive(Debug, Clone, Serialize)]
pub struct LogEntry {
    /// RFC-3339 UTC timestamp.
    pub time: String,
    /// Level: `ERROR` | `WARN`.
    pub level: String,
    /// Module/target that emitted the event (e.g. `video_broll_lib::commands`).
    pub target: String,
    /// Rendered message + key=value field summary.
    pub message: String,
}

fn buffer() -> &'static Mutex<VecDeque<LogEntry>> {
    static LOG_BUFFER: OnceLock<Mutex<VecDeque<LogEntry>>> = OnceLock::new();
    LOG_BUFFER.get_or_init(|| Mutex::new(VecDeque::with_capacity(LOG_CAP)))
}

/// Return up to `limit` most-recent entries, newest first.
pub fn snapshot(limit: usize) -> Vec<LogEntry> {
    let buf = buffer().lock().unwrap_or_else(|p| p.into_inner());
    buf.iter().rev().take(limit).cloned().collect()
}

/// Drop everything currently in the buffer.
pub fn clear() {
    let mut buf = buffer().lock().unwrap_or_else(|p| p.into_inner());
    buf.clear();
}

/// Field visitor that pulls the `message` field plus a few key=value pairs
/// for context. The default tracing visitor only emits Display, but the
/// Debug variant catches structured fields like `error = %e` too.
#[derive(Default)]
struct MessageVisitor {
    message: String,
    extras: Vec<String>,
}

impl tracing::field::Visit for MessageVisitor {
    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        let name = field.name();
        if name == "message" {
            self.message = format!("{value:?}").trim_matches('"').to_string();
        } else {
            self.extras.push(format!("{name}={value:?}"));
        }
    }
    fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
        let name = field.name();
        if name == "message" {
            self.message = value.to_string();
        } else {
            self.extras.push(format!("{name}={value}"));
        }
    }
}

impl MessageVisitor {
    fn into_message(self) -> String {
        if self.extras.is_empty() {
            self.message
        } else if self.message.is_empty() {
            self.extras.join(" ")
        } else {
            format!("{} ({})", self.message, self.extras.join(" "))
        }
    }
}

pub struct CaptureLayer;

/// Whether `target` belongs to our own code (vs. a third-party crate). Used
/// to decide whether to capture INFO-level events: we always want our own
/// timings (yt-dlp download start/done, search source dispatch), but we
/// don't want a flood from dependencies.
fn is_own_target(target: &str) -> bool {
    target.starts_with("video_broll_lib") || target.starts_with("video_broll")
}

impl<S: Subscriber> Layer<S> for CaptureLayer {
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        let meta = event.metadata();
        let level = *meta.level();
        // tracing::Level orders TRACE > DEBUG > INFO > WARN > ERROR. We
        // always capture WARN/ERROR (any source). For INFO we keep only
        // events from our crate so the modal stays readable when the user
        // wants to inspect download timings.
        let take = level <= Level::WARN
            || (level == Level::INFO && is_own_target(meta.target()));
        if !take {
            return;
        }
        let mut v = MessageVisitor::default();
        event.record(&mut v);
        let entry = LogEntry {
            time: chrono::Utc::now().to_rfc3339(),
            level: level.to_string(),
            target: meta.target().to_string(),
            message: v.into_message(),
        };
        let mut buf = buffer().lock().unwrap_or_else(|p| p.into_inner());
        if buf.len() >= LOG_CAP {
            buf.pop_front();
        }
        buf.push_back(entry);
    }
}
