import { useEffect, useState } from "react";
import { ipc } from "../ipc";
import type { FirstRunStatus, ProviderId, TranscriptionProviderId } from "../types";
import { BeeButton } from "./bee/BeeButton";
import { BeeHL } from "./bee/BeeHL";
import { BeeMonoLabel } from "./bee/BeeMonoLabel";
import {
  Dialog,
  DialogContent,
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

const inputClass =
  "w-full h-[46px] border-bee border-bee-ink bg-white px-3.5 font-mono text-[13px] font-medium text-bee-ink outline-none transition-shadow duration-75 focus:shadow-[5px_5px_0_#FFD60A] placeholder:text-bee-mute placeholder:font-normal";

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

  const toolsMissing = false;

  const providerOptions: ProviderOption[] = [
    {
      id: "anthropic_api",
      label: "Anthropic API",
      desc: "Qualità migliore. Pay-per-use (~$0.05/video).",
      available: true,
    },
    {
      id: "openai_api",
      label: "OpenAI API",
      desc: "Buona qualità. Pay-per-use.",
      available: true,
    },
    {
      id: "claude_cli",
      label: "Claude CLI",
      desc: status.ai_clis.claude.found
        ? "Rilevato — usa il tuo abbonamento Claude Code."
        : "Non installato",
      available: status.ai_clis.claude.found,
    },
    {
      id: "codex_cli",
      label: "Codex CLI",
      desc: status.ai_clis.codex.found ? "Rilevato" : "Non installato",
      available: status.ai_clis.codex.found,
    },
    {
      id: "ollama",
      label: "Ollama (locale)",
      desc: status.ai_clis.ollama.found
        ? "Rilevato — locale, gratuito, privato."
        : "Non installato",
      available: status.ai_clis.ollama.found,
    },
    {
      id: "antigravity_cli",
      label: "Antigravity CLI",
      desc: status.ai_clis.antigravity.found
        ? "Rilevato — usa il tuo Antigravity."
        : "Non installato",
      available: status.ai_clis.antigravity.found,
    },
  ];

  const transcriptionOptions: { id: TranscriptionProviderId; label: string; desc: string }[] = [
    {
      id: "groq_api",
      label: "Groq Whisper API",
      desc: "Consigliato — veloce, ~$0.04/ora, free tier generoso.",
    },
    {
      id: "openai_api",
      label: "OpenAI Whisper API",
      desc: "Riusa la tua key OpenAI.",
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
      yt_dlp_path: null,
      antigravity_cli_path: null,
      transcription_provider: transcriptionProvider,
      model_preset: "balanced",
      model_overrides: {},
      projects_dir: null,
    });
  };

  const skip = async () => {
    setBusy(true);
    setErr("");
    try {
      await persistSettings();
    } catch (e) {
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
      <DialogContent className="max-w-[560px] border-bee border-bee-ink shadow-bee-2 bg-white p-0 rounded-md overflow-hidden">
        <div className="px-6 pt-6 pb-5 flex flex-col gap-3">
          {step === "welcome" && (
            <>
              <h2 className="text-[36px] font-bold tracking-[-1px] leading-none m-0">
                <BeeHL>Benvenuto</BeeHL>
              </h2>
              <BeeMonoLabel as="p" className="text-[12px]">
                Setup veloce in 2 minuti — strumenti, provider AI, fatto.
              </BeeMonoLabel>
              <div className="mt-4 flex justify-end gap-2">
                <BeeButton variant="default" onClick={skip} disabled={busy}>
                  Salta
                </BeeButton>
                <BeeButton variant="primary" onClick={() => setStep("toolchain")}>
                  Iniziamo
                </BeeButton>
              </div>
            </>
          )}

          {step === "toolchain" && (
            <>
              <h2 className="text-[28px] font-bold tracking-[-0.6px] leading-tight m-0">
                Step 1 · <BeeHL size="sm">Strumenti</BeeHL>
              </h2>
              <BeeMonoLabel as="p" className="text-[12px] mt-2">
                yt-dlp e ffmpeg sono richiesti — ce ne occupiamo noi.
              </BeeMonoLabel>
              <ul className="mt-3 flex flex-col gap-2 text-[13px] m-0 p-0 list-none">
                <li className="flex items-center gap-3 border-2 border-bee-ink p-2.5 bg-white">
                  <span className="font-mono text-[10px] font-bold uppercase bg-bee-ink text-bee-yellow px-1.5 py-0.5">
                    {status.toolchain.ytdlp.found ? "PRONTO" : "DOWNLOAD"}
                  </span>
                  <span className="font-bold">yt-dlp</span>
                  <BeeMonoLabel className="ml-auto normal-case tracking-normal">
                    {status.toolchain.ytdlp.found ? "installato" : "primo avvio (~12 MB)"}
                  </BeeMonoLabel>
                </li>
                <li className="flex items-center gap-3 border-2 border-bee-ink p-2.5 bg-white">
                  <span className="font-mono text-[10px] font-bold uppercase bg-bee-ink text-bee-yellow px-1.5 py-0.5">
                    PRONTO
                  </span>
                  <span className="font-bold">ffmpeg</span>
                  <BeeMonoLabel className="ml-auto normal-case tracking-normal">bundled</BeeMonoLabel>
                </li>
              </ul>
              <div className="mt-4 flex justify-end gap-2">
                <BeeButton variant="default" onClick={() => setStep("welcome")}>
                  Indietro
                </BeeButton>
                <BeeButton variant="primary" onClick={() => setStep("provider")}>
                  {toolsMissing ? "Continua" : "Avanti"}
                </BeeButton>
              </div>
            </>
          )}

          {step === "provider" && (
            <>
              <h2 className="text-[28px] font-bold tracking-[-0.6px] leading-tight m-0">
                Step 2 · <BeeHL size="sm">Provider AI</BeeHL>
              </h2>
              <BeeMonoLabel as="p" className="text-[12px] mt-2">
                Come vuoi che l'AI trovi i punti B-Roll?
              </BeeMonoLabel>
              <div className="flex flex-col gap-2 mt-3 max-h-[280px] overflow-y-auto bee-scroll pr-1">
                {providerOptions.map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex items-start gap-3 p-3 border-2 border-bee-ink cursor-pointer transition-[transform,box-shadow] duration-75 ${
                      provider === opt.id ? "bg-bee-yellow shadow-bee-1" : "bg-white"
                    } ${!opt.available ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <input
                      type="radio"
                      name="provider"
                      value={opt.id}
                      checked={provider === opt.id}
                      onChange={() => setProvider(opt.id)}
                      disabled={!opt.available}
                      className="accent-bee-ink h-4 w-4 mt-0.5"
                    />
                    <div>
                      <p className="font-bold text-[14px] m-0">{opt.label}</p>
                      <BeeMonoLabel as="p" className="mt-1 normal-case tracking-normal text-[11px]">
                        {opt.desc}
                      </BeeMonoLabel>
                    </div>
                  </label>
                ))}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <BeeButton variant="default" onClick={() => setStep("toolchain")}>
                  Indietro
                </BeeButton>
                <BeeButton
                  variant="primary"
                  onClick={() =>
                    setStep(requiresApiKey ? "key" : "transcription")
                  }
                >
                  Avanti
                </BeeButton>
              </div>
            </>
          )}

          {step === "key" && (
            <>
              <h2 className="text-[28px] font-bold tracking-[-0.6px] leading-tight m-0">
                Step 3 · <BeeHL size="sm">API Key</BeeHL>
              </h2>
              <BeeMonoLabel as="p" className="text-[12px] mt-2 normal-case tracking-normal">
                {provider === "anthropic_api"
                  ? "Ottienila su console.anthropic.com"
                  : "Ottienila su platform.openai.com/api-keys"}
              </BeeMonoLabel>
              <input
                type="password"
                placeholder={
                  provider === "anthropic_api" ? "sk-ant-..." : "sk-..."
                }
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className={`${inputClass} mt-3`}
              />
              <div className="mt-4 flex justify-end gap-2">
                <BeeButton variant="default" onClick={() => setStep("provider")}>
                  Indietro
                </BeeButton>
                <BeeButton
                  variant="primary"
                  onClick={() => setStep("transcription")}
                  disabled={!apiKey}
                >
                  Avanti
                </BeeButton>
              </div>
            </>
          )}

          {step === "transcription" && (
            <>
              <h2 className="text-[28px] font-bold tracking-[-0.6px] leading-tight m-0">
                Step 4 · <BeeHL size="sm">Trascrizione</BeeHL>
              </h2>
              <BeeMonoLabel as="p" className="text-[12px] mt-2">
                Per la voce in formato audio serve un provider Whisper.
              </BeeMonoLabel>
              <div className="flex flex-col gap-2 mt-3">
                {transcriptionOptions.map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex items-start gap-3 p-3 border-2 border-bee-ink cursor-pointer ${
                      transcriptionProvider === opt.id
                        ? "bg-bee-yellow shadow-bee-1"
                        : "bg-white"
                    }`}
                  >
                    <input
                      type="radio"
                      name="trans"
                      value={opt.id}
                      checked={transcriptionProvider === opt.id}
                      onChange={() => setTranscriptionProvider(opt.id)}
                      className="accent-bee-ink h-4 w-4 mt-0.5"
                    />
                    <div>
                      <p className="font-bold text-[14px] m-0">{opt.label}</p>
                      <BeeMonoLabel as="p" className="mt-1 normal-case tracking-normal text-[11px]">
                        {opt.desc}
                      </BeeMonoLabel>
                    </div>
                  </label>
                ))}
                {transcriptionProvider === "groq_api" && (
                  <input
                    type="password"
                    placeholder="gsk_... (console.groq.com)"
                    value={groqKey}
                    onChange={(e) => setGroqKey(e.target.value)}
                    className={`${inputClass} mt-1`}
                  />
                )}
              </div>
              <BeeMonoLabel as="p" className="text-[11px] mt-2 normal-case tracking-normal">
                Puoi saltare se userai solo trascrizioni testuali.
              </BeeMonoLabel>
              {err && (
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.4px] text-red-700 mt-2">
                  ! {err}
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2 flex-wrap">
                <BeeButton
                  variant="default"
                  onClick={() => setStep(requiresApiKey ? "key" : "provider")}
                >
                  Indietro
                </BeeButton>
                <BeeButton variant="default" onClick={skip} disabled={busy}>
                  Salta
                </BeeButton>
                <BeeButton variant="primary" onClick={finish} disabled={busy}>
                  {busy ? "Salvataggio…" : "Fine"}
                </BeeButton>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
