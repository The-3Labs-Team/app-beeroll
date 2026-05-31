import { Dialog, DialogContent } from "./ui/dialog";
import { BeeButton } from "./bee/BeeButton";
import { BeeMonoLabel } from "./bee/BeeMonoLabel";
import { openExternal } from "../lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS: { title: string; body: string; href?: string; cta?: string }[] = [
  {
    title: "Apri Google Cloud Console",
    body: "Serve un account Google qualunque. Creare il progetto è gratis.",
    href: "https://console.cloud.google.com/",
    cta: "console.cloud.google.com",
  },
  {
    title: "Crea un progetto",
    body: "In alto: 'Seleziona un progetto' → 'NUOVO PROGETTO'. Dagli un nome (es. \"BeeRoll\") e crealo.",
  },
  {
    title: "Abilita YouTube Data API v3",
    body: "Menu laterale → APIs & Services → Library. Cerca \"YouTube Data API v3\" e clicca Enable.",
    href: "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
    cta: "Apri direttamente l'API",
  },
  {
    title: "Crea una API key",
    body: "APIs & Services → Credentials → CREATE CREDENTIALS → API key. Copia la chiave (inizia con AIza…).",
    href: "https://console.cloud.google.com/apis/credentials",
    cta: "Apri Credentials",
  },
  {
    title: "Incolla la chiave qui",
    body: "Torna in BeeRoll, incollala nel campo qui sotto e premi 'Salva e testa'. La chiave resta nel keychain del tuo Mac.",
  },
];

/**
 * Step-by-step modal explaining how to get a YouTube Data API v3 key. The
 * user-facing tone is "I trust you, just follow these clicks" — no jargon
 * about quotas or scopes unless we have a concrete reason to call them out.
 */
export function YoutubeApiHowToDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] border-bee border-bee-ink shadow-bee-2 bg-white p-0 rounded-md overflow-hidden">
        <div className="px-6 pt-5 pb-3 border-b-bee border-bee-ink flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-bold tracking-[-0.4px] leading-tight m-0">
              Come ottenere la chiave YouTube
            </h2>
            <BeeMonoLabel
              as="div"
              className="normal-case tracking-normal text-[11px] mt-1 text-bee-ink/70"
            >
              5 passi · ~3 minuti · gratis (10k ricerche/giorno sul tier free)
            </BeeMonoLabel>
          </div>
          <span className="font-mono text-[10px] font-bold tracking-[0.5px] uppercase bg-[#FF0000] text-white px-2 py-1">
            YT API
          </span>
        </div>

        <ol className="m-0 p-0 list-none flex flex-col">
          {STEPS.map((s, i) => (
            <li
              key={i}
              className="px-6 py-4 border-b border-bee-ink/15 last:border-b-0 flex gap-4"
            >
              <span className="font-mono text-[14px] font-bold tracking-[0.4px] uppercase bg-bee-ink text-bee-yellow w-[28px] h-[28px] flex items-center justify-center flex-shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold tracking-[-0.2px] leading-tight">
                  {s.title}
                </div>
                <BeeMonoLabel
                  as="p"
                  className="normal-case tracking-normal text-[12px] mt-1 leading-[1.5] text-bee-ink/80"
                >
                  {s.body}
                </BeeMonoLabel>
                {s.href && (
                  <a
                    href={s.href}
                    onClick={(e) => {
                      e.preventDefault();
                      openExternal(s.href!);
                    }}
                    className="inline-block mt-2 font-mono text-[10.5px] font-bold tracking-[0.4px] uppercase border-2 border-bee-ink bg-white px-2 py-1 hover:bg-bee-yellow cursor-pointer"
                  >
                    {s.cta ?? "Apri"} ↗
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>

        <div className="px-6 py-3 border-t-bee border-bee-ink flex items-center justify-between gap-3 bg-bee-soft/30">
          <BeeMonoLabel
            as="p"
            className="normal-case tracking-normal text-[10.5px] text-bee-ink/65 leading-[1.5] flex-1"
          >
            Senza chiave BeeRoll usa <code className="bg-bee-ink text-bee-yellow px-1 py-0.5">yt-dlp</code>{" "}
            (più lento). Con chiave la ricerca è 5-10× più veloce.
          </BeeMonoLabel>
          <BeeButton variant="primary" onClick={() => onOpenChange(false)}>
            Ho capito
          </BeeButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
