import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ipc } from "../ipc";
import type {
  AiCliStatus,
  AppSettings,
  ProviderId,
  TranscriptionProviderId,
} from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = "idle" | "saving" | "testing" | "ok" | "error";

interface ProviderOption {
  id: ProviderId;
  label: string;
  kind: "api" | "ollama" | "cli";
  cliKey?: keyof AiCliStatus;
}

const PROVIDERS: ProviderOption[] = [
  { id: "anthropic_api", label: "Anthropic API", kind: "api" },
  { id: "openai_api", label: "OpenAI API", kind: "api" },
  { id: "ollama", label: "Ollama (local)", kind: "ollama", cliKey: "ollama" },
  { id: "claude_cli", label: "Claude CLI", kind: "cli", cliKey: "claude" },
  { id: "codex_cli", label: "Codex CLI", kind: "cli", cliKey: "codex" },
];

interface TranscriptionOption {
  id: TranscriptionProviderId;
  label: string;
}

const TRANSCRIPTION_PROVIDERS: TranscriptionOption[] = [
  { id: "groq_api", label: "Groq Whisper (default)" },
  { id: "openai_api", label: "OpenAI Whisper" },
];

export function SettingsPage() {
  const nav = useNavigate();

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [cliStatus, setCliStatus] = useState<AiCliStatus | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [s, c] = await Promise.all([ipc.settingsLoad(), ipc.aiCliStatus()]);
        if (cancelled) return;
        setSettings(s);
        setCliStatus(c);
      } catch (e) {
        setErr(String(e));
        setStatus("error");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!settings) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <p className="text-muted-foreground">Loading settings…</p>
      </div>
    );
  }

  const selected = settings.selected_provider;

  const updateProvider = (id: ProviderId) =>
    setSettings({ ...settings, selected_provider: id });
  const updateOllamaUrl = (v: string) =>
    setSettings({ ...settings, ollama_base_url: v.trim() === "" ? null : v });
  const updateTranscriptionProvider = (id: TranscriptionProviderId) =>
    setSettings({ ...settings, transcription_provider: id });

  const save = async () => {
    setStatus("saving");
    setErr("");
    try {
      // Persist any non-empty API keys before saving the settings & testing.
      if (anthropicKey.trim() !== "") {
        await ipc.settingsSetAnthropicKey(anthropicKey.trim());
      }
      if (openaiKey.trim() !== "") {
        await ipc.settingsSetOpenaiKey(openaiKey.trim());
      }
      if (groqKey.trim() !== "") {
        await ipc.settingsSetGroqKey(groqKey.trim());
      }
      await ipc.settingsSave(settings);

      setStatus("testing");
      const ok = await ipc.settingsTestProvider(selected);
      if (ok) {
        setStatus("ok");
      } else {
        setStatus("error");
        setErr("Settings saved, but provider test ping did not succeed.");
      }
    } catch (e) {
      setStatus("error");
      setErr(String(e));
    }
  };

  const renderCliBadge = (cliKey: keyof AiCliStatus) => {
    if (!cliStatus) {
      return (
        <span className="text-muted-foreground text-xs">Detecting…</span>
      );
    }
    const tool = cliStatus[cliKey];
    if (tool.found) {
      return (
        <span className="text-green-600 text-xs">
          Rilevato ✓ {tool.path ? `(${tool.path})` : ""}
        </span>
      );
    }
    return <span className="text-red-600 text-xs">Non installato ✗</span>;
  };

  const renderProviderConfig = (p: ProviderOption) => {
    if (selected !== p.id) return null;
    if (p.id === "anthropic_api") {
      return (
        <div className="mt-3 space-y-2">
          <label className="text-sm text-muted-foreground">Anthropic API key</label>
          <Input
            type="password"
            placeholder="sk-ant-... (leave blank to keep existing key)"
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
          />
        </div>
      );
    }
    if (p.id === "openai_api") {
      return (
        <div className="mt-3 space-y-2">
          <label className="text-sm text-muted-foreground">OpenAI API key</label>
          <Input
            type="password"
            placeholder="sk-... (leave blank to keep existing key)"
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
          />
        </div>
      );
    }
    if (p.id === "ollama") {
      return (
        <div className="mt-3 space-y-2">
          <label className="text-sm text-muted-foreground">
            Ollama base URL (default <code>http://localhost:11434</code>)
          </label>
          <Input
            type="text"
            placeholder="http://localhost:11434"
            value={settings.ollama_base_url ?? ""}
            onChange={(e) => updateOllamaUrl(e.target.value)}
          />
        </div>
      );
    }
    // CLI providers — nothing extra to configure beyond auto-detection.
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        The binary is resolved via your <code>PATH</code> automatically.
      </p>
    );
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <header className="mb-8">
        <Button variant="ghost" onClick={() => nav("/projects")}>← Back</Button>
        <h1 className="text-3xl font-bold mt-4">Settings</h1>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">AI provider</h2>
        <p className="text-muted-foreground text-sm">
          Choose how the app generates B-roll suggestions. API keys are stored in your
          system keychain; everything else lives in <code>~/.config/video-broll/settings.json</code>.
        </p>

        <div className="space-y-3">
          {PROVIDERS.map((p) => (
            <label
              key={p.id}
              className="block border border-input rounded-md p-4 cursor-pointer hover:bg-accent/40"
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="provider"
                  checked={selected === p.id}
                  onChange={() => updateProvider(p.id)}
                />
                <span className="font-medium flex-1">{p.label}</span>
                {p.cliKey && renderCliBadge(p.cliKey)}
              </div>
              {renderProviderConfig(p)}
            </label>
          ))}
        </div>

        <Button
          onClick={save}
          disabled={status === "saving" || status === "testing"}
        >
          {status === "saving"
            ? "Saving…"
            : status === "testing"
            ? "Testing…"
            : "Save & test"}
        </Button>
        {status === "ok" && (
          <p className="text-green-600 text-sm">Settings saved and provider verified ✓</p>
        )}
        {status === "error" && err && (
          <p className="text-red-600 text-sm">{err}</p>
        )}
      </section>

      <section className="space-y-4 mt-10">
        <h2 className="text-xl font-semibold">Transcription provider</h2>
        <p className="text-muted-foreground text-sm">
          Used when a project's voiceover is an audio file. Both providers
          share an OpenAI-compatible Whisper API.
        </p>

        <div className="space-y-3">
          {TRANSCRIPTION_PROVIDERS.map((p) => (
            <label
              key={p.id}
              className="block border border-input rounded-md p-4 cursor-pointer hover:bg-accent/40"
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="transcription_provider"
                  checked={settings.transcription_provider === p.id}
                  onChange={() => updateTranscriptionProvider(p.id)}
                />
                <span className="font-medium flex-1">{p.label}</span>
              </div>
              {settings.transcription_provider === p.id && p.id === "groq_api" && (
                <div className="mt-3 space-y-2">
                  <label className="text-sm text-muted-foreground">
                    Groq API key
                  </label>
                  <Input
                    type="password"
                    placeholder="gsk_... (leave blank to keep existing key)"
                    value={groqKey}
                    onChange={(e) => setGroqKey(e.target.value)}
                  />
                </div>
              )}
              {settings.transcription_provider === p.id &&
                p.id === "openai_api" && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Uses the OpenAI API key configured above for the AI
                    provider section.
                  </p>
                )}
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
