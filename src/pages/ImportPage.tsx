import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ipc } from "../ipc";
import { useStore } from "../store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ImportPage() {
  const nav = useNavigate();
  const setProject = useStore((s) => s.setProject);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!name.trim() || !text.trim()) {
      setErr("Name and voiceover are required.");
      return;
    }
    setBusy(true); setErr("");
    try {
      const project = await ipc.projectCreate(name.trim(), text.trim());
      setProject(project);
      nav("/review");
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  };

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
          <label className="block text-sm font-medium mb-2">Voiceover transcript</label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your voiceover transcript here…"
            rows={16}
            className="font-mono text-sm"
          />
        </div>
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <Button onClick={submit} disabled={busy}>
          {busy ? "Creating…" : "Create & extract B-Roll points"}
        </Button>
      </div>
    </div>
  );
}
