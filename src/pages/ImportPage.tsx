import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ipc } from "../ipc";
import { useStore } from "../store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type InputMode = "audio" | "text";

export function ImportPage() {
  const nav = useNavigate();
  const setProject = useStore((s) => s.setProject);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [audioPath, setAudioPath] = useState<string>("");
  const [mode, setMode] = useState<InputMode>("audio");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const pickAudio = async () => {
    setErr("");
    try {
      const file = await openDialog({
        multiple: false,
        filters: [
          {
            name: "Audio",
            extensions: ["mp3", "wav", "m4a", "ogg", "flac", "webm"],
          },
        ],
      });
      if (typeof file === "string" && file.trim() !== "") {
        setAudioPath(file);
      }
    } catch (e) {
      setErr(String(e));
    }
  };

  const submit = async () => {
    if (!name.trim()) {
      setErr("Project name is required.");
      return;
    }
    if (mode === "text" && !text.trim()) {
      setErr("Voiceover text is required.");
      return;
    }
    if (mode === "audio" && !audioPath.trim()) {
      setErr("Pick an audio file.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const project = await ipc.projectCreate(
        name.trim(),
        mode === "text" ? text.trim() : null,
        mode === "audio" ? audioPath.trim() : null,
      );
      setProject(project);
      nav("/review");
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  };

  const audioFilename = audioPath.split(/[\\/]/).pop() ?? "";

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <header className="mb-8">
        <Button variant="ghost" onClick={() => nav("/projects")}>← Back</Button>
        <h1 className="text-3xl font-bold mt-4">New project</h1>
      </header>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Project name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Episode 12" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Voiceover input</label>
          <div className="flex gap-2 mb-3" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "audio"}
              onClick={() => setMode("audio")}
              className={`px-3 py-1.5 rounded text-sm border ${
                mode === "audio"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent border-input"
              }`}
            >
              Audio file
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "text"}
              onClick={() => setMode("text")}
              className={`px-3 py-1.5 rounded text-sm border ${
                mode === "text"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent border-input"
              }`}
            >
              Text transcript
            </button>
          </div>

          {mode === "audio" ? (
            <div className="space-y-2">
              <Button type="button" variant="outline" onClick={pickAudio}>
                {audioPath ? "Change audio file…" : "Choose audio file…"}
              </Button>
              {audioPath && (
                <p className="text-sm text-muted-foreground break-all">
                  Selected: <code>{audioFilename}</code>
                  <span className="block text-xs mt-1">{audioPath}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Supported formats: mp3, wav, m4a, ogg, flac, webm. The audio is
                copied into the project and transcribed via Whisper before
                B-Roll extraction.
              </p>
            </div>
          ) : (
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste your voiceover transcript here…"
              rows={16}
              className="font-mono text-sm"
            />
          )}
        </div>

        {err && <p className="text-red-600 text-sm">{err}</p>}
        <Button onClick={submit} disabled={busy}>
          {busy ? "Creating…" : "Create & extract B-Roll points"}
        </Button>
      </div>
    </div>
  );
}
