//! Cross-platform helpers for spawned subprocesses.
//!
//! On Windows a GUI parent process (our Tauri app) doesn't have a console
//! attached; when it spawns a console executable like `yt-dlp` or `ffmpeg`,
//! Windows briefly pops up a black console window. The `CREATE_NO_WINDOW`
//! flag tells the OS to spawn the child without one. On macOS / Linux the
//! helper is a no-op.

/// `CREATE_NO_WINDOW` from <https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags>.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub trait SilentCommand {
    /// Apply the platform's "no console window" flag, returning `&mut Self`
    /// for chaining. No-op on non-Windows targets.
    fn no_console(&mut self) -> &mut Self;
}

impl SilentCommand for tokio::process::Command {
    #[cfg(windows)]
    fn no_console(&mut self) -> &mut Self {
        self.creation_flags(CREATE_NO_WINDOW)
    }

    #[cfg(not(windows))]
    fn no_console(&mut self) -> &mut Self {
        self
    }
}

/// Resolve the path to the bundled ffmpeg sidecar that Tauri places next
/// to the main executable. Works in both `tauri dev` (binary in
/// `target/<profile>/`) and the production bundle (sibling of the main
/// `.app` / `.exe`).
pub fn ffmpeg_path() -> std::io::Result<std::path::PathBuf> {
    let exe = std::env::current_exe()?;
    let dir = exe.parent().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "current_exe has no parent directory",
        )
    })?;
    let name = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    Ok(dir.join(name))
}
