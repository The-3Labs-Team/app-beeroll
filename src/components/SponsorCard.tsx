import { BeeMonoLabel } from "./bee/BeeMonoLabel";

/**
 * Sponsor card surfaced in the right column of the settings page. Static
 * branding for The3LabsTeam — clicking the card opens 3labs.it. Uses an
 * anchor with `target="_blank"` so Tauri routes it through the OS browser via
 * the opener plugin.
 */
export function SponsorCard() {
  return (
    <aside className="w-full max-w-[260px] flex flex-col gap-3">
      <BeeMonoLabel as="div" className="text-[10.5px] tracking-[0.6px]">
        Sponsor
      </BeeMonoLabel>
      <a
        href="https://3labs.it"
        target="_blank"
        rel="noreferrer noopener"
        className="block border-bee border-bee-ink bg-bee-yellow shadow-bee-3 transition-[transform,box-shadow] duration-100 hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-bee-5"
      >
        <div className="border-b-bee border-bee-ink px-4 py-2.5 bg-bee-ink text-bee-yellow flex items-center justify-between">
          <span className="font-mono text-[10px] font-bold tracking-[0.6px] uppercase">
            Powered by
          </span>
          <span className="font-mono text-[10px] font-bold tracking-[0.4px] uppercase">
            ↗
          </span>
        </div>
        <div className="px-4 py-5">
          <div className="text-[20px] font-bold tracking-[-0.4px] leading-[1.05]">
            The3LabsTeam
          </div>
          <BeeMonoLabel
            as="div"
            className="mt-2 normal-case tracking-normal text-[11px] leading-[1.45] text-bee-ink/75"
          >
            Officina software italiana · sviluppo SaaS, web app e tooling AI
            su misura.
          </BeeMonoLabel>
        </div>
        <div className="border-t-bee border-bee-ink px-4 py-2 bg-white flex items-center justify-between">
          <span className="font-mono text-[10.5px] font-bold tracking-[0.5px] text-bee-ink">
            3labs.it
          </span>
          <span className="font-mono text-[10px] font-bold tracking-[0.6px] uppercase text-bee-ink/70">
            Visita →
          </span>
        </div>
      </a>
      <BeeMonoLabel
        as="p"
        className="normal-case tracking-normal text-[10.5px] text-bee-ink/55 leading-[1.5]"
      >
        BeeRoll è sviluppato e mantenuto dal team. Lo spazio in questa colonna
        è loro come piccolo grazie.
      </BeeMonoLabel>
    </aside>
  );
}
