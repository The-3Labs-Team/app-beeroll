import { useEffect, useState } from "react";
import { ipc } from "../ipc";
import type { FirstRunStatus, ProviderId, TranscriptionProviderId } from "../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Step = "welcome" | "toolchain" | "provider" | "key" | "transcription";

interface Props {
  onClose: () => void;
}

interface ProviderOption {
  id: ProviderId;
  label: string;
  desc: string;
  available: boolean;
}

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

export function OnboardingModal({ onClose }: Props) {
  const [status, setStatus] = useState<FirstRunStatus | null>(null);
  const [step, setStep] = useState<Step>("welcome");
  const [provider, setProvider] = useState<ProviderId>("anthropic_api");
  const [apiKey, setApiKey] = useState("");
  const [transcriptionProvider, setTranscriptionProvider] =
    useState<TranscriptionProviderId>("groq_api");
  const [groqKey, setGroqKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    ipc
      .firstRunStatus()
      .then(setStatus)
      .catch((e) => setErr(String(e)));
  }, []);

  if (!status) return null;

  const toolsMissing =
    !status.toolchain.ytdlp.found || !status.toolchain.ffmpeg.found;

  const providerOptions: ProviderOption[] = [
    {
      id: "anthropic_api",
      label: "Anthropic API",
      desc: "Best quality. Pay-per-use (~$0.05/video).",
      available: true,
    },
    {
      id: "openai_api",
      label: "OpenAI API",
      desc: "Good quality. Pay-per-use.",
      available: true,
    },
    {
      id: "claude_cli",
      label: "Claude CLI",
      desc: status.ai_clis.claude.found
        ? "Detected — uses your existing Claude Code subscription."
        : "Not installed",
      available: status.ai_clis.claude.found,
    },
    {
      id: "codex_cli",
      label: "Codex CLI",
      desc: status.ai_clis.codex.found ? "Detected" : "Not installed",
      available: status.ai_clis.codex.found,
    },
    {
      id: "ollama",
      label: "Ollama (local)",
      desc: status.ai_clis.ollama.found
        ? "Detected — runs locally, free, private."
        : "Not installed",
      available: status.ai_clis.ollama.found,
    },
  ];

  const transcriptionOptions: { id: TranscriptionProviderId; label: string; desc: string }[] = [
    {
      id: "groq_api",
      label: "Groq Whisper API",
      desc: "Recommended — fast, ~$0.04/hour, generous free tier.",
    },
    {
      id: "openai_api",
      label: "OpenAI Whisper API",
      desc: "Reuses your OpenAI key.",
    },
  ];

  const requiresApiKey =
    provider === "anthropic_api" || provider === "openai_api";

  const persistSettings = async () => {
    await ipc.settingsSave({
      selected_provider: provider,
      anthropic_model: DEFAULT_ANTHROPIC_MODEL,
      ollama_base_url: provider === "ollama" ? "http://localhost:11434" : null,
      claude_cli_path: null,
      codex_cli_path: null,
      transcription_provider: transcriptionProvider,
    });
  };

  const skip = async () => {
    setBusy(true);
    setErr("");
    try {
      // Persist a minimal settings file so first-run detection won't trigger
      // again on next launch.
      await persistSettings();
    } catch (e) {
      // Ignore so the user is never trapped in the modal.
      console.warn("onboarding skip: settings_save failed", e);
    } finally {
      setBusy(false);
      onClose();
    }
  };

  const finish = async () => {
    setBusy(true);
    setErr("");
    try {
      if (provider === "anthropic_api" && apiKey) {
        await ipc.settingsSetAnthropicKey(apiKey);
      } else if (provider === "openai_api" && apiKey) {
        await ipc.settingsSetOpenaiKey(apiKey);
      }
      if (transcriptionProvider === "groq_api" && groqKey) {
        await ipc.settingsSetGroqKey(groqKey);
      }
      await persistSettings();
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent className="max-w-lg">
        {step === "welcome" && (
          <>
            <DialogHeader>
              <DialogTitle>Welcome to Video B-Roll</DialogTitle>
              <DialogDescription>
                Let's get you set up in 2 minutes. We'll check your tools, pick
                an AI provider, and you're done.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={skip} disabled={busy}>
                Skip
              </Button>
              <Button onClick={() => setStep("toolchain")}>Get started</Button>
            </DialogFooter>
          </>
        )}

        {step === "toolchain" && (
          <>
            <DialogHeader>
              <DialogTitle>Step 1: Tools</DialogTitle>
              <DialogDescription>
                We need yt-dlp and ffmpeg to download and process videos.
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-2 my-4 text-sm">
              <li>
                <span aria-hidden className="mr-2">
                  {status.toolchain.ytdlp.found ? "[ok]" : "[missing]"}
                </span>
                yt-dlp
              </li>
              <li>
                <span aria-hidden className="mr-2">
                  {status.toolchain.ffmpeg.found ? "[ok]" : "[missing]"}
                </span>
                ffmpeg
              </li>
            </ul>
            {toolsMissing && (
              <p className="text-sm bg-yellow-50 text-yellow-900 p-3 rounded">
                Open Terminal and run:{" "}
                <code className="font-mono">brew install yt-dlp ffmpeg</code>
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("welcome")}>
                Back
              </Button>
              <Button onClick={() => setStep("provider")}>
                {toolsMissing ? "Continue anyway" : "Next"}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "provider" && (
          <>
            <DialogHeader>
              <DialogTitle>Step 2: AI Provider</DialogTitle>
              <DialogDescription>
                How would you like the AI to find B-Roll points?
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 my-4">
              {providerOptions.map((opt) => (
                <label
                  key={opt.id}
                  className={`flex items-start gap-3 p-3 border rounded cursor-pointer ${
                    provider === opt.id
                      ? "border-primary bg-muted"
                      : "border-border"
                  } ${!opt.available ? "opacity-50" : ""}`}
                >
                  <input
                    type="radio"
                    name="provider"
                    value={opt.id}
                    checked={provider === opt.id}
                    onChange={() => setProvider(opt.id)}
                    disabled={!opt.available}
                  />
                  <div>
                    <p className="font-medium text-sm">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("toolchain")}>
                Back
              </Button>
              <Button
                onClick={() =>
                  setStep(requiresApiKey ? "key" : "transcription")
                }
              >
                Next
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "key" && (
          <>
            <DialogHeader>
              <DialogTitle>Step 3: API Key</DialogTitle>
              <DialogDescription>
                {provider === "anthropic_api"
                  ? "Get one at console.anthropic.com"
                  : "Get one at platform.openai.com/api-keys"}
              </DialogDescription>
            </DialogHeader>
            <Input
              type="password"
              placeholder={
                provider === "anthropic_api" ? "sk-ant-..." : "sk-..."
              }
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="my-4"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("provider")}>
                Back
              </Button>
              <Button
                onClick={() => setStep("transcription")}
                disabled={!apiKey}
              >
                Next
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "transcription" && (
          <>
            <DialogHeader>
              <DialogTitle>Step 4: Audio transcription (optional)</DialogTitle>
              <DialogDescription>
                If you'll upload audio voiceovers, we need a Whisper provider.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 my-4">
              {transcriptionOptions.map((opt) => (
                <label
                  key={opt.id}
                  className={`flex items-start gap-3 p-3 border rounded cursor-pointer ${
                    transcriptionProvider === opt.id
                      ? "border-primary bg-muted"
                      : "border-border"
                  }`}
                >
                  <input
                    type="radio"
                    name="trans"
                    value={opt.id}
                    checked={transcriptionProvider === opt.id}
                    onChange={() => setTranscriptionProvider(opt.id)}
                  />
                  <div>
                    <p className="font-medium text-sm">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                </label>
              ))}
              {transcriptionProvider === "groq_api" && (
                <Input
                  type="password"
                  placeholder="gsk_... (get one at console.groq.com)"
                  value={groqKey}
                  onChange={(e) => setGroqKey(e.target.value)}
                  className="mt-3"
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              You can skip this if you'll only use text transcripts.
            </p>
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() =>
                  setStep(requiresApiKey ? "key" : "provider")
                }
              >
                Back
              </Button>
              <Button variant="ghost" onClick={skip} disabled={busy}>
                Skip
              </Button>
              <Button onClick={finish} disabled={busy}>
                {busy ? "Saving..." : "Finish"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
