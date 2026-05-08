import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ipc } from "../ipc";
import { useStore } from "../store";
import { BeeWindow } from "../components/BeeWindow";
import { BeeButton } from "../components/bee/BeeButton";
import { BeeHL } from "../components/bee/BeeHL";
import { BeeMonoLabel } from "../components/bee/BeeMonoLabel";

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
      setErr("Inserisci un nome progetto.");
      return;
    }
    if (mode === "text" && !text.trim()) {
      setErr("Incolla la trascrizione.");
      return;
    }
    if (mode === "audio" && !audioPath.trim()) {
      setErr("Scegli un file audio.");
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
    <BeeWindow title="BeeRoll · Nuovo progetto" className="w-[880px] max-w-full h-[660px]">
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

        <h1 className="text-[50px] font-bold tracking-[-1.4px] leading-none mt-[18px] mb-1">
          <BeeHL>Nuovo progetto</BeeHL>
        </h1>
        <BeeMonoLabel as="div" className="mt-[14px] mb-7 text-[12px]">
          Trasforma una voce in punti B-Roll.
        </BeeMonoLabel>

        {/* Field 01: project name */}
        <div className="mb-6">
          <label className="block font-mono text-[11px] font-bold tracking-[0.8px] uppercase mb-2">
            <span className="bg-bee-ink text-bee-yellow px-1.5 py-px mr-2">01</span>
            Nome progetto
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Episodio 12"
            className="w-full h-[54px] border-bee border-bee-ink bg-white px-4 font-sans text-[18px] font-medium text-bee-ink outline-none transition-shadow duration-75 focus:shadow-[5px_5px_0_#FFD60A] placeholder:text-bee-mute placeholder:font-normal"
          />
        </div>

        {/* Field 02: voiceover source */}
        <div className="mb-6">
          <label className="block font-mono text-[11px] font-bold tracking-[0.8px] uppercase mb-2">
            <span className="bg-bee-ink text-bee-yellow px-1.5 py-px mr-2">02</span>
            Sorgente voce
          </label>

          <div className="flex gap-4 items-center mb-3.5">
            <div className="inline-flex border-bee border-bee-ink bg-white" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "audio"}
                onClick={() => setMode("audio")}
                className={`px-[22px] h-[46px] font-sans text-[14px] font-semibold border-r-bee border-bee-ink last:border-r-0 transition-colors duration-100 ${
                  mode === "audio"
                    ? "bg-bee-ink text-bee-yellow"
                    : "bg-transparent text-bee-ink hover:bg-bee-yellow"
                }`}
              >
                File audio
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "text"}
                onClick={() => setMode("text")}
                className={`px-[22px] h-[46px] font-sans text-[14px] font-semibold transition-colors duration-100 ${
                  mode === "text"
                    ? "bg-bee-ink text-bee-yellow"
                    : "bg-transparent text-bee-ink hover:bg-bee-yellow"
                }`}
              >
                Trascrizione
              </button>
            </div>
          </div>

          {mode === "audio" ? (
            <div
              className="border-bee border-dashed border-bee-ink p-[22px] flex items-center gap-[18px] bg-white transition-[transform,box-shadow,background] duration-75 hover:bg-bee-yellow hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-bee-3 cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={pickAudio}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  pickAudio();
                }
              }}
            >
              <div className="w-[54px] h-[54px] flex-shrink-0 border-bee border-bee-ink bg-bee-yellow flex items-center justify-center">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 22 22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M11 2v12M11 2l-3 3M11 2l3 3M3 14v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[16px] font-semibold tracking-[-0.2px]">
                  {audioPath
                    ? "File selezionato"
                    : "Trascina o scegli un file audio"}
                </div>
                {audioPath ? (
                  <BeeMonoLabel as="div" className="mt-1 break-all normal-case tracking-normal">
                    {audioFilename}
                  </BeeMonoLabel>
                ) : (
                  <BeeMonoLabel as="div" className="mt-1">
                    mp3 · wav · m4a · ogg · flac · webm
                  </BeeMonoLabel>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  pickAudio();
                }}
                className="h-[38px] px-[14px] border-bee border-bee-ink bg-white font-sans text-[13px] font-semibold cursor-pointer flex-shrink-0 hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-bee-1 transition-[transform,box-shadow] duration-75"
              >
                {audioPath ? "Cambia…" : "Sfoglia…"}
              </button>
            </div>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Incolla qui la trascrizione del tuo episodio…"
              className="w-full min-h-[160px] border-bee border-bee-ink bg-white px-4 py-3.5 font-sans text-[15px] font-medium leading-[1.45] text-bee-ink outline-none resize-y transition-shadow duration-75 focus:shadow-[5px_5px_0_#FFD60A] placeholder:text-bee-mute"
            />
          )}
        </div>

        {err && (
          <p className="font-mono text-[12px] font-bold uppercase tracking-[0.4px] text-red-700 mb-4">
            ! {err}
          </p>
        )}

        {/* Footer / CTA */}
        <div className="mt-8 border-t-bee border-bee-ink pt-6 flex items-center justify-between gap-4 flex-wrap">
          <BeeMonoLabel as="div" className="max-w-[340px] leading-[1.5] normal-case tracking-[0.4px] text-[11px]">
            L'audio viene copiato nel progetto e trascritto con Whisper prima
            dell'estrazione dei punti B-Roll.
          </BeeMonoLabel>
          <BeeButton variant="cta-large" onClick={submit} disabled={busy}>
            {busy ? "Creazione…" : "Crea ed estrai"}
            {!busy && (
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              >
                <path d="M4 9h10M9 4l5 5-5 5" />
              </svg>
            )}
          </BeeButton>
        </div>
      </div>
    </BeeWindow>
  );
}
