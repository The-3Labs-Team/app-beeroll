import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ipc } from "../ipc";
import type {
  AiCliStatus,
  AppSettings,
  ProviderId,
  TranscriptionProviderId,
} from "../types";
import { BeeWindow } from "../components/BeeWindow";
import { BeeButton } from "../components/bee/BeeButton";
import { BeeHL } from "../components/bee/BeeHL";
import { BeeMonoLabel } from "../components/bee/BeeMonoLabel";

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
];

interface TranscriptionOption {
  id: TranscriptionProviderId;
  label: string;
}

const TRANSCRIPTION_PROVIDERS: TranscriptionOption[] = [
  { id: "groq_api", label: "Groq Whisper (default)" },
  { id: "openai_api", label: "OpenAI Whisper" },
];

const beeInputClass =
  "w-full h-[46px] border-bee border-bee-ink bg-white px-3.5 font-mono text-[13px] font-medium text-bee-ink outline-none transition-shadow duration-75 focus:shadow-[5px_5px_0_#FFD60A] placeholder:text-bee-mute placeholder:font-normal";

export function SettingsPage() {
  const nav = useNavigate();

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [cliStatus, setCliStatus] = useState<AiCliStatus | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [err, setErr] = useState<string>("");

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

        <section className="mt-8 flex flex-col gap-4">
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

        {/* Sorgenti video */}
        <section className="mt-12 flex flex-col gap-4">
          <h2 className="font-mono text-[12px] font-bold tracking-[0.6px] uppercase m-0 bg-bee-ink text-bee-yellow px-2.5 py-1.5 self-start">
            Sorgenti video
          </h2>
          <BeeMonoLabel as="p" className="normal-case tracking-[0.3px] text-[12px] leading-[1.6]">
            YouTube è sempre attivo. Aggiungi Pixabay/Pexels per stock footage.
          </BeeMonoLabel>

          {/* Pixabay */}
          <div className="border-bee border-bee-ink p-4 bg-white">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-[15px]">Pixabay</h3>
              <a
                href="https://pixabay.com/api/docs/"
                target="_blank"
                rel="noreferrer noopener"
                className="font-mono text-[11px] text-bee-mute hover:text-bee-ink underline"
              >
                pixabay.com/api/
              </a>
            </div>
            <div className="flex gap-2">
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
                target="_blank"
                rel="noreferrer noopener"
                className="font-mono text-[11px] text-bee-mute hover:text-bee-ink underline"
              >
                pexels.com/api/
              </a>
            </div>
            <div className="flex gap-2">
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
    </BeeWindow>
  );
}
