//! Test-only helper: prints all argv to stdout (used instead of .cmd on Windows).

fn main() {
    let line = std::env::args().skip(1).collect::<Vec<_>>().join(" ");
    print!("{line}");
}
