import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ipc } from "../ipc";
import type {
  AiCliStatus,
  AppSettings,
  ModelPreset,
  ProviderId,
  ToolchainStatus,
  TranscriptionProviderId,
} from "../types";
import { BeeWindow } from "../components/BeeWindow";
import { BeeButton } from "../components/bee/BeeButton";
import { BeeHL } from "../components/bee/BeeHL";
import { BeeMonoLabel } from "../components/bee/BeeMonoLabel";
import { SponsorCard } from "../components/SponsorCard";
import { YoutubeApiHowToDialog } from "../components/YoutubeApiHowToDialog";
import { openExternal } from "../lib/utils";
import logoUrl from "../assets/logo.png";

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
  { id: "ollama", label: "Ollama (locale)", kind: "ollama", cliKey: "ollama" },
  { id: "claude_cli", label: "Claude CLI", kind: "cli", cliKey: "claude" },
  { id: "codex_cli", label: "Codex CLI", kind: "cli", cliKey: "codex" },
  { id: "antigravity_cli", label: "Antigravity CLI", kind: "cli", cliKey: "antigravity" },
];

interface TranscriptionOption {
  id: TranscriptionProviderId;
  label: string;
}

const TRANSCRIPTION_PROVIDERS: TranscriptionOption[] = [
  { id: "groq_api", label: "Groq Whisper (default)" },
  { id: "openai_api", label: "OpenAI Whisper" },
];

/**
 * Mirrors `settings_store::preset_model_for` — keep in sync. The slider maps
 * (preset, provider) → concrete model id. CLI providers don't appear here:
 * they ride the CLI's own default and the preset is a no-op.
 */
const PRESET_MODEL_MAP: Record<
  Exclude<ModelPreset, "custom">,
  Partial<Record<ProviderId, string>>
> = {
  fast: {
    anthropic_api: "claude-haiku-4-5",
    openai_api: "gpt-4o-mini",
    ollama: "llama3.2:3b",
  },
  balanced: {
    anthropic_api: "claude-sonnet-4-6",
    openai_api: "gpt-4o",
    ollama: "llama3.1:8b",
  },
  accurate: {
    anthropic_api: "claude-opus-4-7",
    openai_api: "gpt-4o",
    ollama: "llama3.1:70b",
  },
};

/** Mirrors `settings_store::available_models_for`. */
const AVAILABLE_MODELS: Partial<Record<ProviderId, string[]>> = {
  anthropic_api: [
    "claude-haiku-4-5",
    "claude-sonnet-4-6",
    "claude-opus-4-7",
  ],
  openai_api: ["gpt-4o-mini", "gpt-4o", "o1-mini"],
  ollama: ["llama3.2:3b", "llama3.1:8b", "llama3.1:70b", "qwen2.5:14b", "mistral"],
};

const PRESET_LABEL: Record<Exclude<ModelPreset, "custom">, string> = {
  fast: "Veloce",
  balanced: "Bilanciato",
  accurate: "Preciso",
};

const PRESET_DESCRIPTION: Record<Exclude<ModelPreset, "custom">, string> = {
  fast: "Modelli più piccoli, risposta in pochi secondi. Adatto per audio brevi.",
  balanced: "Compromesso tra velocità e qualità. Default consigliato.",
  accurate: "Modelli più capaci, suggerimenti migliori ma più lenti e costosi.",
};

function resolveModelClient(
  settings: AppSettings,
  providerId: ProviderId,
): string | null {
  if (settings.model_preset === "custom") {
    return settings.model_overrides[providerId] ?? null;
  }
  return PRESET_MODEL_MAP[settings.model_preset]?.[providerId] ?? null;
}

const beeInputClass =
  "w-full h-[46px] border-bee border-bee-ink bg-white px-3.5 font-mono text-[13px] font-medium text-bee-ink outline-none transition-shadow duration-75 focus:shadow-[5px_5px_0_#FFD60A] placeholder:text-bee-mute placeholder:font-normal";

function withAutodetectedBinPaths(
  settings: AppSettings,
  cliStatus: AiCliStatus,
  toolchainStatus: ToolchainStatus,
): AppSettings {
  return {
    ...settings,
    yt_dlp_path:
      settings.yt_dlp_path ?? (toolchainStatus.ytdlp.found ? toolchainStatus.ytdlp.path : null),
    claude_cli_path:
      settings.claude_cli_path ??
      (cliStatus.claude.found ? cliStatus.claude.path : null),
    codex_cli_path:
      settings.codex_cli_path ?? (cliStatus.codex.found ? cliStatus.codex.path : null),
    antigravity_cli_path:
      settings.antigravity_cli_path ??
      (cliStatus.antigravity.found ? cliStatus.antigravity.path : null),
  };
}

export function SettingsPage() {
  const nav = useNavigate();

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [cliStatus, setCliStatus] = useState<AiCliStatus | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [err, setErr] = useState<string>("");

  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [pixabayKey, setPixabayKey] = useState("");
  const [pixabayBusy, setPixabayBusy] = useState<null | "saving" | "testing">(null);
  const [pixabayMsg, setPixabayMsg] = useState<{ kind: "idle" | "ok" | "err"; text: string }>({
    kind: "idle",
    text: "",
  });
  const [pexelsKey, setPexelsKey] = useState("");
  const [pexelsBusy, setPexelsBusy] = useState<null | "saving" | "testing">(null);
  const [pexelsMsg, setPexelsMsg] = useState<{ kind: "idle" | "ok" | "err"; text: string }>({
    kind: "idle",
    text: "",
  });
  const [youtubeKey, setYoutubeKey] = useState("");
  const [youtubeBusy, setYoutubeBusy] = useState<null | "saving" | "testing">(null);
  const [youtubeMsg, setYoutubeMsg] = useState<{ kind: "idle" | "ok" | "err"; text: string }>({
    kind: "idle",
    text: "",
  });
  const [youtubeHowToOpen, setYoutubeHowToOpen] = useState(false);

  const savePixabay = async () => {
    if (!pixabayKey.trim()) {
      setPixabayMsg({ kind: "err", text: "Inserisci la chiave" });
      return;
    }
    setPixabayBusy("saving");
    try {
      await ipc.settingsSetPixabayKey(pixabayKey.trim());
      setPixabayBusy("testing");
      const ok = await ipc.settingsTestPixabay();
      setPixabayBusy(null);
      setPixabayMsg(
        ok
          ? { kind: "ok", text: "Chiave salvata e verificata" }
          : { kind: "err", text: "Test fallito (nessun risultato)" },
      );
    } catch (e) {
      setPixabayBusy(null);
      setPixabayMsg({ kind: "err", text: String(e) });
    }
  };

  const saveYoutube = async () => {
    if (!youtubeKey.trim()) {
      setYoutubeMsg({ kind: "err", text: "Inserisci la chiave" });
      return;
    }
    setYoutubeBusy("saving");
    try {
      await ipc.settingsSetYoutubeKey(youtubeKey.trim());
      setYoutubeBusy("testing");
      const ok = await ipc.settingsTestYoutube();
      setYoutubeBusy(null);
      setYoutubeMsg(
        ok
          ? { kind: "ok", text: "Chiave salvata e verificata" }
          : { kind: "err", text: "Test fallito (nessun risultato)" },
      );
    } catch (e) {
      setYoutubeBusy(null);
      setYoutubeMsg({ kind: "err", text: String(e) });
    }
  };

  const savePexels = async () => {
    if (!pexelsKey.trim()) {
      setPexelsMsg({ kind: "err", text: "Inserisci la chiave" });
      return;
    }
    setPexelsBusy("saving");
    try {
      await ipc.settingsSetPexelsKey(pexelsKey.trim());
      setPexelsBusy("testing");
      const ok = await ipc.settingsTestPexels();
      setPexelsBusy(null);
      setPexelsMsg(
        ok
          ? { kind: "ok", text: "Chiave salvata e verificata" }
          : { kind: "err", text: "Test fallito (nessun risultato)" },
      );
    } catch (e) {
      setPexelsBusy(null);
      setPexelsMsg({ kind: "err", text: String(e) });
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [s, c, t] = await Promise.all([
          ipc.settingsLoad(),
          ipc.aiCliStatus(),
          ipc.toolchainStatus(),
        ]);
        if (cancelled) return;
        setSettings(withAutodetectedBinPaths(s, c, t));
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
      <BeeWindow title="BeeRoll · Impostazioni" className="w-[880px] max-w-full min-h-[660px] h-auto">
        <div className="p-9">
          <BeeMonoLabel as="div">Caricamento impostazioni…</BeeMonoLabel>
        </div>
      </BeeWindow>
    );
  }

  const selected = settings.selected_provider;

  const updateProvider = (id: ProviderId) =>
    setSettings({ ...settings, selected_provider: id });
  const updateOllamaUrl = (v: string) =>
    setSettings({ ...settings, ollama_base_url: v.trim() === "" ? null : v });
  const updateTranscriptionProvider = (id: TranscriptionProviderId) =>
    setSettings({ ...settings, transcription_provider: id });
  const updatePreset = (preset: ModelPreset) =>
    setSettings({ ...settings, model_preset: preset });
  const updateModelOverride = (providerId: ProviderId, model: string) =>
    setSettings({
      ...settings,
      model_overrides: { ...settings.model_overrides, [providerId]: model },
    });

  const pickProjectsDir = async () => {
    const picked = await openDialog({
      directory: true,
      multiple: false,
      defaultPath: settings.projects_dir ?? undefined,
      title: "Scegli la cartella per i progetti BeeRoll",
    });
    if (typeof picked === "string" && picked.trim() !== "") {
      setSettings({ ...settings, projects_dir: picked });
    }
  };
  const resetProjectsDir = () =>
    setSettings({ ...settings, projects_dir: null });

  const save = async () => {
    setStatus("saving");
    setErr("");
    try {
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
        setErr("Impostazioni salvate, ma il test del provider non è riuscito.");
      }
    } catch (e) {
      setStatus("error");
      setErr(String(e));
    }
  };

  const renderCliBadge = (cliKey: keyof AiCliStatus) => {
    if (!cliStatus) {
      return <BeeMonoLabel className="ml-2">Rilevamento…</BeeMonoLabel>;
    }
    const tool = cliStatus[cliKey];
    if (tool.found) {
      return (
        <span className="font-mono text-[11px] font-bold tracking-[0.4px] uppercase bg-bee-yellow text-bee-ink px-2 py-1 border-2 border-bee-ink">
          ✓ Rilevato
        </span>
      );
    }
    return (
      <span className="font-mono text-[11px] font-bold tracking-[0.4px] uppercase bg-white text-bee-mute px-2 py-1 border-2 border-bee-mute">
        ✕ Non installato
      </span>
    );
  };

  const renderProviderConfig = (p: ProviderOption) => {
    if (selected !== p.id) return null;
    if (p.id === "anthropic_api") {
      return (
        <div className="mt-3 flex flex-col gap-2">
          <BeeMonoLabel as="label">Anthropic API key</BeeMonoLabel>
          <input
            type="password"
            placeholder="sk-ant-... (lascia vuoto per mantenere)"
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
            className={beeInputClass}
          />
        </div>
      );
    }
    if (p.id === "openai_api") {
      return (
        <div className="mt-3 flex flex-col gap-2">
          <BeeMonoLabel as="label">OpenAI API key</BeeMonoLabel>
          <input
            type="password"
            placeholder="sk-... (lascia vuoto per mantenere)"
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            className={beeInputClass}
          />
        </div>
      );
    }
    if (p.id === "ollama") {
      return (
        <div className="mt-3 flex flex-col gap-2">
          <BeeMonoLabel as="label">
            Ollama base URL (default <code>http://localhost:11434</code>)
          </BeeMonoLabel>
          <input
            type="text"
            placeholder="http://localhost:11434"
            value={settings.ollama_base_url ?? ""}
            onChange={(e) => updateOllamaUrl(e.target.value)}
            className={beeInputClass}
          />
        </div>
      );
    }
    return (
      <BeeMonoLabel as="p" className="mt-3 normal-case tracking-normal text-[12px]">
        Il binario viene risolto automaticamente via <code>PATH</code>.
      </BeeMonoLabel>
    );
  };

  return (
    <BeeWindow
      title="BeeRoll · Impostazioni"
      className="w-[880px] max-w-full min-h-[660px] h-auto"
    >
      <div className="flex-1 overflow-y-auto bee-scroll px-9 pt-6 pb-9">
        <BeeButton variant="back" onClick={() => nav("/projects")}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <path d="M7 2L3 6l4 4M3 6h7" />
          </svg>
          Indietro
        </BeeButton>

        <h1 className="text-[28px] font-bold tracking-[-0.8px] leading-none mt-[18px] mb-1">
          <BeeHL>Impostazioni</BeeHL>
        </h1>

        <div className="flex gap-7 items-start mt-8 flex-wrap">
          <div className="flex-1 min-w-[320px] max-w-[560px] flex flex-col">
        <section className="flex flex-col gap-4">
          <h2 className="font-mono text-[12px] font-bold tracking-[0.6px] uppercase m-0 bg-bee-ink text-bee-yellow px-2.5 py-1.5 self-start">
            Provider AI
          </h2>
          <BeeMonoLabel as="p" className="normal-case tracking-[0.3px] text-[12px] leading-[1.6]">
            Scegli come l'app genera i suggerimenti B-Roll. Le API key sono salvate
            nel keychain di sistema; il resto vive in{" "}
            <code className="bg-bee-ink text-bee-yellow px-1.5 py-0.5">
              ~/.config/video-broll/settings.json
            </code>
            .
          </BeeMonoLabel>

          <div className="flex flex-col gap-3">
            {PROVIDERS.map((p) => (
              <label
                key={p.id}
                className={`block border-bee border-bee-ink p-4 cursor-pointer transition-[transform,box-shadow] duration-75 ${
                  selected === p.id
                    ? "bg-bee-yellow shadow-bee-2"
                    : "bg-white hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-bee-1"
                }`}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    type="radio"
                    name="provider"
                    checked={selected === p.id}
                    onChange={() => updateProvider(p.id)}
                    className="accent-bee-ink h-4 w-4"
                  />
                  <span className="font-bold flex-1 text-[15px]">{p.label}</span>
                  {p.cliKey && renderCliBadge(p.cliKey)}
                </div>
                {renderProviderConfig(p)}
              </label>
            ))}
          </div>

          {/* Model preset slider — always rendered. Disabled with a help
              line for CLI providers (they ignore the dial). */}
          {(() => {
            const supportsModel =
              selected === "anthropic_api" ||
              selected === "openai_api" ||
              selected === "ollama";
            const apiSelected = selected as ProviderId;
            return (
            <div className="mt-2 border-bee border-bee-ink bg-white p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="font-bold text-[14px] tracking-[-0.2px]">
                    Modello
                  </div>
                  <BeeMonoLabel
                    as="div"
                    className="normal-case tracking-normal text-[11px] mt-0.5 text-bee-ink/70"
                  >
                    Velocità ↔ precisione. Custom per scegliere a mano.
                  </BeeMonoLabel>
                </div>
                {supportsModel && settings.model_preset !== "custom" && (
                  <span className="font-mono text-[10.5px] font-bold tracking-[0.4px] uppercase bg-bee-ink text-bee-yellow px-2 py-1 whitespace-nowrap">
                    {resolveModelClient(settings, apiSelected) ?? "—"}
                  </span>
                )}
              </div>
              {!supportsModel && (
                <BeeMonoLabel
                  as="p"
                  className="normal-case tracking-normal text-[11px] mb-3 text-bee-ink/70 leading-[1.5]"
                >
                  Il provider <code className="bg-bee-ink text-bee-yellow px-1 py-0.5">{selected}</code>{" "}
                  usa il modello configurato direttamente nel CLI. Lo slider qui
                  sotto è quindi solo informativo.
                </BeeMonoLabel>
              )}

              <div
                className={`inline-flex border-bee border-bee-ink bg-white w-full ${
                  supportsModel ? "" : "opacity-60"
                }`}
                role="tablist"
                aria-label="Preset modello"
              >
                {(["fast", "balanced", "accurate"] as const).map((p, i, arr) => {
                  const isActive = settings.model_preset === p;
                  const isLast = i === arr.length - 1;
                  return (
                    <button
                      key={p}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      disabled={!supportsModel}
                      onClick={() => updatePreset(p)}
                      title={PRESET_DESCRIPTION[p]}
                      className={`flex-1 px-[18px] h-[42px] font-sans text-[13px] font-semibold transition-colors duration-100 ${
                        isLast ? "" : "border-r-bee border-bee-ink"
                      } ${
                        isActive
                          ? "bg-bee-ink text-bee-yellow"
                          : "bg-transparent text-bee-ink hover:bg-bee-yellow"
                      } disabled:cursor-not-allowed`}
                    >
                      {PRESET_LABEL[p]}
                    </button>
                  );
                })}
              </div>
              <BeeMonoLabel
                as="p"
                className="normal-case tracking-normal text-[11px] mt-2.5 text-bee-ink/70 leading-[1.5]"
              >
                {settings.model_preset === "custom"
                  ? "Modalità Custom: il modello è quello scelto qui sotto in Impostazioni avanzate."
                  : PRESET_DESCRIPTION[settings.model_preset as Exclude<ModelPreset, "custom">]}
              </BeeMonoLabel>

              {/* Advanced — collapsible custom model picker */}
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-[0.5px] uppercase text-bee-ink/80 hover:text-bee-ink"
              >
                <span
                  className="inline-block transition-transform duration-100"
                  style={{
                    transform: advancedOpen ? "rotate(90deg)" : "rotate(0deg)",
                  }}
                >
                  ▶
                </span>
                Impostazioni avanzate
              </button>

              {advancedOpen && supportsModel && (
                <div className="mt-3 border-t border-bee-ink/30 pt-3 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.model_preset === "custom"}
                        onChange={(e) =>
                          updatePreset(e.target.checked ? "custom" : "balanced")
                        }
                        className="accent-bee-ink h-4 w-4"
                      />
                      <span className="font-bold text-[13px]">
                        Scegli il modello manualmente
                      </span>
                    </label>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <BeeMonoLabel as="label">
                      Modello per {apiSelected.replace("_api", "")}
                    </BeeMonoLabel>
                    <select
                      value={
                        settings.model_preset === "custom"
                          ? settings.model_overrides[apiSelected] ??
                            (AVAILABLE_MODELS[apiSelected]?.[0] ?? "")
                          : (resolveModelClient(settings, apiSelected) ?? "")
                      }
                      onChange={(e) =>
                        updateModelOverride(apiSelected, e.target.value)
                      }
                      disabled={settings.model_preset !== "custom"}
                      className={`h-[42px] border-bee border-bee-ink bg-white px-3 font-mono text-[13px] font-medium text-bee-ink outline-none focus:shadow-[3px_3px_0_#FFD60A] transition-shadow duration-75 ${
                        settings.model_preset !== "custom"
                          ? "opacity-60 cursor-not-allowed"
                          : ""
                      }`}
                    >
                      {(AVAILABLE_MODELS[apiSelected] ?? []).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <BeeMonoLabel
                      as="p"
                      className="normal-case tracking-normal text-[10.5px] text-bee-ink/55 leading-[1.5]"
                    >
                      Lista non esaustiva. Per provider con modelli custom,
                      modifica direttamente{" "}
                      <code className="bg-bee-ink text-bee-yellow px-1 py-0.5">
                        settings.json
                      </code>
                      .
                    </BeeMonoLabel>
                  </div>
                </div>
              )}
            </div>
            );
          })()}

          <div className="flex items-center gap-3 flex-wrap mt-2">
            <BeeButton
              variant="primary"
              onClick={save}
              disabled={status === "saving" || status === "testing"}
            >
              {status === "saving"
                ? "Salvataggio…"
                : status === "testing"
                ? "Test in corso…"
                : "Salva e testa"}
            </BeeButton>
            {status === "ok" && (
              <BeeMonoLabel as="span" tone="strong">
                ✓ Impostazioni verificate
              </BeeMonoLabel>
            )}
            {status === "error" && err && (
              <span className="font-mono text-[11px] font-bold tracking-[0.4px] uppercase text-red-700">
                ! {err}
              </span>
            )}
          </div>
        </section>

        <section className="mt-12 flex flex-col gap-4">
          <h2 className="font-mono text-[12px] font-bold tracking-[0.6px] uppercase m-0 bg-bee-ink text-bee-yellow px-2.5 py-1.5 self-start">
            Trascrizione
          </h2>
          <BeeMonoLabel as="p" className="normal-case tracking-[0.3px] text-[12px] leading-[1.6]">
            Usato quando la voce di un progetto è un file audio. Entrambi i
            provider condividono la API Whisper compatibile OpenAI.
          </BeeMonoLabel>

          <div className="flex flex-col gap-3">
            {TRANSCRIPTION_PROVIDERS.map((p) => (
              <label
                key={p.id}
                className={`block border-bee border-bee-ink p-4 cursor-pointer transition-[transform,box-shadow] duration-75 ${
                  settings.transcription_provider === p.id
                    ? "bg-bee-yellow shadow-bee-2"
                    : "bg-white hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-bee-1"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="transcription_provider"
                    checked={settings.transcription_provider === p.id}
                    onChange={() => updateTranscriptionProvider(p.id)}
                    className="accent-bee-ink h-4 w-4"
                  />
                  <span className="font-bold flex-1 text-[15px]">{p.label}</span>
                </div>
                {settings.transcription_provider === p.id && p.id === "groq_api" && (
                  <div className="mt-3 flex flex-col gap-2">
                    <BeeMonoLabel as="label">Groq API key</BeeMonoLabel>
                    <input
                      type="password"
                      placeholder="gsk_... (lascia vuoto per mantenere)"
                      value={groqKey}
                      onChange={(e) => setGroqKey(e.target.value)}
                      className={beeInputClass}
                    />
                  </div>
                )}
                {settings.transcription_provider === p.id && p.id === "openai_api" && (
                  <BeeMonoLabel as="p" className="mt-3 normal-case tracking-normal text-[12px]">
                    Usa la API key OpenAI configurata sopra.
                  </BeeMonoLabel>
                )}
              </label>
            ))}
          </div>
        </section>

        <section className="mt-12 flex flex-col gap-4">
          <h2 className="font-mono text-[12px] font-bold tracking-[0.6px] uppercase m-0 bg-bee-ink text-bee-yellow px-2.5 py-1.5 self-start">
            Cartella progetti
          </h2>
          <BeeMonoLabel as="p" className="normal-case tracking-[0.3px] text-[12px] leading-[1.6]">
            Posizione su disco dove vengono creati i progetti (cartella con
            <code className="font-mono"> project.json</code>, voiceover, cache yt-dlp,
            clip finali). Il cambio vale per i progetti creati da qui in
            avanti — i progetti esistenti restano dove sono.
          </BeeMonoLabel>
          <div className="flex flex-col gap-2 border-bee border-bee-ink bg-white p-4 shadow-bee-1">
            <BeeMonoLabel as="label">Percorso attuale</BeeMonoLabel>
            <div className="flex items-center gap-2 flex-wrap">
              <code
                className="flex-1 min-w-[240px] font-mono text-[12px] bg-bee-soft border-2 border-bee-ink px-2.5 py-1.5 truncate"
                title={settings.projects_dir ?? "default (~/B-Roll Projects)"}
              >
                {settings.projects_dir ?? "(default) ~/B-Roll Projects"}
              </code>
              <BeeButton variant="default" onClick={pickProjectsDir}>
                Sfoglia…
              </BeeButton>
              {settings.projects_dir && (
                <BeeButton variant="default" onClick={resetProjectsDir}>
                  Ripristina default
                </BeeButton>
              )}
            </div>
          </div>
        </section>

        {/* Percorsi dei Binari */}
        <section className="mt-12 flex flex-col gap-4">
          <h2 className="font-mono text-[12px] font-bold tracking-[0.6px] uppercase m-0 bg-bee-ink text-bee-yellow px-2.5 py-1.5 self-start">
            Percorsi dei Binari (Eseguibili)
          </h2>
          <BeeMonoLabel as="p" className="normal-case tracking-[0.3px] text-[12px] leading-[1.6]">
            Configura percorsi personalizzati per gli eseguibili di sistema.
            Se lasciati vuoti, l'applicazione cercherà i binari nel sistema o utilizzerà i valori di default.
          </BeeMonoLabel>

          <div className="flex flex-col gap-4 border-bee border-bee-ink bg-white p-4 shadow-bee-1">
            {/* yt-dlp */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <BeeMonoLabel as="label" className="font-bold">Percorso yt-dlp</BeeMonoLabel>
                {settings.yt_dlp_path && (
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, yt_dlp_path: null })}
                    className="font-mono text-[10px] text-red-600 hover:underline"
                  >
                    Ripristina default
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Seleziona il percorso di yt-dlp..."
                  value={settings.yt_dlp_path ?? ""}
                  onChange={(e) => setSettings({ ...settings, yt_dlp_path: e.target.value.trim() === "" ? null : e.target.value })}
                  className={`flex-1 ${beeInputClass}`}
                />
                <BeeButton
                  variant="default"
                  onClick={async () => {
                    const picked = await openDialog({
                      directory: false,
                      multiple: false,
                      defaultPath: settings.yt_dlp_path ?? undefined,
                      title: "Scegli l'eseguibile yt-dlp",
                    });
                    if (typeof picked === "string" && picked.trim() !== "") {
                      setSettings({ ...settings, yt_dlp_path: picked });
                    }
                  }}
                >
                  Sfoglia…
                </BeeButton>
              </div>
            </div>

            {/* Claude CLI */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <BeeMonoLabel as="label" className="font-bold">Percorso Claude CLI</BeeMonoLabel>
                {settings.claude_cli_path && (
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, claude_cli_path: null })}
                    className="font-mono text-[10px] text-red-600 hover:underline"
                  >
                    Ripristina default
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Seleziona il percorso di Claude CLI..."
                  value={settings.claude_cli_path ?? ""}
                  onChange={(e) => setSettings({ ...settings, claude_cli_path: e.target.value.trim() === "" ? null : e.target.value })}
                  className={`flex-1 ${beeInputClass}`}
                />
                <BeeButton
                  variant="default"
                  onClick={async () => {
                    const picked = await openDialog({
                      directory: false,
                      multiple: false,
                      defaultPath: settings.claude_cli_path ?? undefined,
                      title: "Scegli l'eseguibile Claude CLI",
                    });
                    if (typeof picked === "string" && picked.trim() !== "") {
                      setSettings({ ...settings, claude_cli_path: picked });
                    }
                  }}
                >
                  Sfoglia…
                </BeeButton>
              </div>
            </div>

            {/* Codex CLI */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <BeeMonoLabel as="label" className="font-bold">Percorso Codex CLI</BeeMonoLabel>
                {settings.codex_cli_path && (
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, codex_cli_path: null })}
                    className="font-mono text-[10px] text-red-600 hover:underline"
                  >
                    Ripristina default
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Seleziona il percorso di Codex CLI..."
                  value={settings.codex_cli_path ?? ""}
                  onChange={(e) => setSettings({ ...settings, codex_cli_path: e.target.value.trim() === "" ? null : e.target.value })}
                  className={`flex-1 ${beeInputClass}`}
                />
                <BeeButton
                  variant="default"
                  onClick={async () => {
                    const picked = await openDialog({
                      directory: false,
                      multiple: false,
                      defaultPath: settings.codex_cli_path ?? undefined,
                      title: "Scegli l'eseguibile Codex CLI",
                    });
                    if (typeof picked === "string" && picked.trim() !== "") {
                      setSettings({ ...settings, codex_cli_path: picked });
                    }
                  }}
                >
                  Sfoglia…
                </BeeButton>
              </div>
            </div>

            {/* Antigravity CLI */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <BeeMonoLabel as="label" className="font-bold">Percorso Antigravity CLI</BeeMonoLabel>
                {settings.antigravity_cli_path && (
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, antigravity_cli_path: null })}
                    className="font-mono text-[10px] text-red-600 hover:underline"
                  >
                    Ripristina default
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Seleziona il percorso di Antigravity CLI..."
                  value={settings.antigravity_cli_path ?? ""}
                  onChange={(e) => setSettings({ ...settings, antigravity_cli_path: e.target.value.trim() === "" ? null : e.target.value })}
                  className={`flex-1 ${beeInputClass}`}
                />
                <BeeButton
                  variant="default"
                  onClick={async () => {
                    const picked = await openDialog({
                      directory: false,
                      multiple: false,
                      defaultPath: settings.antigravity_cli_path ?? undefined,
                      title: "Scegli l'eseguibile Antigravity CLI",
                    });
                    if (typeof picked === "string" && picked.trim() !== "") {
                      setSettings({ ...settings, antigravity_cli_path: picked });
                    }
                  }}
                >
                  Sfoglia…
                </BeeButton>
              </div>
            </div>
          </div>
        </section>

        {/* Sorgenti video */}
        <section className="mt-12 flex flex-col gap-4">
          <h2 className="font-mono text-[12px] font-bold tracking-[0.6px] uppercase m-0 bg-bee-ink text-bee-yellow px-2.5 py-1.5 self-start">
            Sorgenti video
          </h2>
          <BeeMonoLabel as="p" className="normal-case tracking-[0.3px] text-[12px] leading-[1.6]">
            YouTube è sempre attivo. Aggiungi una chiave YouTube per ricerche
            5-10× più veloci, e/o Pixabay/Pexels per stock footage.
          </BeeMonoLabel>

          {/* YouTube Data API v3 */}
          <div className="border-bee border-bee-ink p-4 bg-white">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold tracking-[0.4px] uppercase bg-[#FF0000] text-white px-2 py-1">
                  YT
                </span>
                <h3 className="font-bold text-[15px]">YouTube Data API v3</h3>
                <span className="font-mono text-[10px] font-bold tracking-[0.5px] uppercase border-2 border-bee-ink px-1.5 py-0.5 bg-bee-yellow text-bee-ink">
                  consigliato
                </span>
              </div>
              <button
                type="button"
                onClick={() => setYoutubeHowToOpen(true)}
                className="font-mono text-[10.5px] font-bold tracking-[0.5px] uppercase border-2 border-bee-ink bg-white px-2 py-1 hover:bg-bee-yellow"
              >
                Come ottenerla?
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="API key YouTube (AIza…)"
                value={youtubeKey}
                onChange={(e) => setYoutubeKey(e.target.value)}
                className={`flex-1 ${beeInputClass}`}
              />
              <BeeButton
                variant="primary"
                onClick={saveYoutube}
                disabled={youtubeBusy !== null}
              >
                {youtubeBusy === "saving"
                  ? "Salvo…"
                  : youtubeBusy === "testing"
                  ? "Testo…"
                  : "Salva e testa"}
              </BeeButton>
            </div>
            {youtubeMsg.kind === "ok" && (
              <p className="mt-2 font-mono text-[11px] font-bold tracking-[0.4px] uppercase text-green-700">
                ✓ {youtubeMsg.text}
              </p>
            )}
            {youtubeMsg.kind === "err" && (
              <p className="mt-2 font-mono text-[11px] font-bold tracking-[0.4px] uppercase text-red-700">
                ! {youtubeMsg.text}
              </p>
            )}
            <BeeMonoLabel
              as="p"
              className="normal-case tracking-normal text-[11px] mt-2 text-bee-ink/65 leading-[1.5]"
            >
              Senza chiave la ricerca usa <code className="bg-bee-ink text-bee-yellow px-1 py-0.5">yt-dlp</code>
              , che è più lento (1.5-15s vs 200ms con la API).
            </BeeMonoLabel>
          </div>

          {/* Pixabay */}
          <div className="border-bee border-bee-ink p-4 bg-white">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-[15px]">Pixabay</h3>
              <a
                href="https://pixabay.com/api/docs/"
                onClick={(e) => {
                  e.preventDefault();
                  openExternal("https://pixabay.com/api/docs/");
                }}
                className="font-mono text-[11px] text-bee-mute hover:text-bee-ink underline cursor-pointer"
              >
                pixabay.com/api/
              </a>
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="password"
                placeholder="API key Pixabay"
                value={pixabayKey}
                onChange={(e) => setPixabayKey(e.target.value)}
                className={`flex-1 ${beeInputClass}`}
              />
              <BeeButton
                variant="primary"
                onClick={savePixabay}
                disabled={pixabayBusy !== null}
              >
                {pixabayBusy === "saving"
                  ? "Salvo…"
                  : pixabayBusy === "testing"
                  ? "Testo…"
                  : "Salva e testa"}
              </BeeButton>
            </div>
            {pixabayMsg.kind === "ok" && (
              <p className="mt-2 font-mono text-[11px] font-bold tracking-[0.4px] uppercase text-green-700">
                ✓ {pixabayMsg.text}
              </p>
            )}
            {pixabayMsg.kind === "err" && (
              <p className="mt-2 font-mono text-[11px] font-bold tracking-[0.4px] uppercase text-red-700">
                ! {pixabayMsg.text}
              </p>
            )}
          </div>

          {/* Pexels */}
          <div className="border-bee border-bee-ink p-4 bg-white">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-[15px]">Pexels</h3>
              <a
                href="https://www.pexels.com/api/"
                onClick={(e) => {
                  e.preventDefault();
                  openExternal("https://www.pexels.com/api/");
                }}
                className="font-mono text-[11px] text-bee-mute hover:text-bee-ink underline cursor-pointer"
              >
                pexels.com/api/
              </a>
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="password"
                placeholder="API key Pexels"
                value={pexelsKey}
                onChange={(e) => setPexelsKey(e.target.value)}
                className={`flex-1 ${beeInputClass}`}
              />
              <BeeButton
                variant="primary"
                onClick={savePexels}
                disabled={pexelsBusy !== null}
              >
                {pexelsBusy === "saving"
                  ? "Salvo…"
                  : pexelsBusy === "testing"
                  ? "Testo…"
                  : "Salva e testa"}
              </BeeButton>
            </div>
            {pexelsMsg.kind === "ok" && (
              <p className="mt-2 font-mono text-[11px] font-bold tracking-[0.4px] uppercase text-green-700">
                ✓ {pexelsMsg.text}
              </p>
            )}
            {pexelsMsg.kind === "err" && (
              <p className="mt-2 font-mono text-[11px] font-bold tracking-[0.4px] uppercase text-red-700">
                ! {pexelsMsg.text}
              </p>
            )}
          </div>
        </section>
          </div>
          <div className="flex flex-col gap-5 items-stretch">
            <div className="w-full max-w-[260px] border-bee border-bee-ink bg-white shadow-bee-2 p-5 flex flex-col items-center gap-2">
              <img
                src={logoUrl}
                alt="BeeRoll"
                width={140}
                height={140}
                className="w-[140px] h-[140px] object-contain"
              />
              <BeeMonoLabel
                as="div"
                className="text-[10px] tracking-[0.6px]"
              >
                BeeRoll · v0.1.0
              </BeeMonoLabel>
            </div>
            <SponsorCard />
          </div>
        </div>
      </div>
      <YoutubeApiHowToDialog
        open={youtubeHowToOpen}
        onOpenChange={setYoutubeHowToOpen}
      />
    </BeeWindow>
  );
}
