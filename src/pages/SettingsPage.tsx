import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ipc } from "../ipc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SettingsPage() {
  const nav = useNavigate();
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<"idle"|"saving"|"testing"|"ok"|"error">("idle");
  const [err, setErr] = useState<string>("");

  const save = async () => {
    if (!key.startsWith("sk-ant-")) {
      setStatus("error"); setErr("API key should start with sk-ant-");
      return;
    }
    setStatus("saving");
    try {
      await ipc.settingsSetAnthropicKey(key);
      setStatus("testing");
      const ok = await ipc.settingsTestAnthropic();
      if (ok) { setStatus("ok"); setErr(""); }
      else { setStatus("error"); setErr("API key set but test ping did not succeed."); }
    } catch (e) {
      setStatus("error"); setErr(String(e));
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <header className="mb-8">
        <Button variant="ghost" onClick={() => nav("/projects")}>← Back</Button>
        <h1 className="text-3xl font-bold mt-4">Settings</h1>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Anthropic API key</h2>
        <p className="text-muted-foreground text-sm">
          Get one at <span className="underline">console.anthropic.com</span>. Stored in your system keychain, never on disk.
        </p>
        <Input
          type="password"
          placeholder="sk-ant-..."
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <Button onClick={save} disabled={status === "saving" || status === "testing"}>
          {status === "saving" ? "Saving…" : status === "testing" ? "Testing…" : "Save & test"}
        </Button>
        {status === "ok" && <p className="text-green-600 text-sm">Key saved and verified ✓</p>}
        {status === "error" && <p className="text-red-600 text-sm">{err}</p>}
      </section>
    </div>
  );
}
