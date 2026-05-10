import { BeeMonoLabel } from "./bee/BeeMonoLabel";
import { formatBytes, relativeTimeIt } from "../lib/utils";
import type { Project } from "../types";

interface Props {
  index: number;
  project: Project;
  sizeBytes?: number;
  onOpen: () => void;
  onOpenFolder: () => void;
  onDelete: () => void;
}

const padded = (n: number) => String(n).padStart(2, "0");

function statusInfo(
  p: Project,
): { label: string; tone: "draft" | "progress" | "done" | "loading" } {
  const total = p.broll_points.length;
  const done = p.broll_points.filter((b) => b.status === "done").length;
  const downloading = p.broll_points.filter(
    (b) => b.status === "downloading",
  ).length;
  // No points yet means the extraction phase hasn't completed (or never
  // started). Surface that as a distinct loading state so the user knows the
  // project is mid-pipeline and not just an empty draft.
  if (total === 0) return { label: "Caricamento…", tone: "loading" };
  // Active download takes precedence over generic in-progress: it gives the
  // user real signal that something is happening on disk right now.
  if (downloading > 0) {
    return { label: `Downloading ${done}/${total}`, tone: "loading" };
  }
  if (done === total) return { label: `${done}/${total} pronto`, tone: "done" };
  return { label: `${done}/${total}`, tone: "progress" };
}

/**
 * Brutalist "manila folder" card: a small yellow tab on top stamped with the
 * folder index, a body that's the actual button (full card click opens the
 * project), and two icon chips for reveal-in-Finder and delete that stop
 * propagation so they don't open the project.
 */
export function ProjectFolderCard({
  index,
  project,
  sizeBytes,
  onOpen,
  onOpenFolder,
  onDelete,
}: Props) {
  const { label: statusLabel, tone } = statusInfo(project);
  const toneClass =
    tone === "done"
      ? "bg-bee-ink text-bee-yellow"
      : tone === "progress"
        ? "bg-bee-yellow text-bee-ink border-2 border-bee-ink"
        : tone === "loading"
          ? "bg-bee-yellow text-bee-ink border-2 border-dashed border-bee-ink animate-pulse"
          : "bg-white text-bee-ink border-2 border-dashed border-bee-ink";

  return (
    <div className="relative group pt-[14px]">
      {/* Folder tab — looks glued onto the top edge of the card */}
      <div className="absolute top-0 left-4 h-[20px] flex items-center pl-2 pr-2.5 bg-bee-yellow border-bee border-bee-ink border-b-0 z-10">
        <span className="font-mono text-[11px] font-bold tracking-[0.6px] leading-none">
          {padded(index)}
        </span>
      </div>

      {/* Action chips — reveal & delete. stopPropagation so the body click
          (which opens the project) doesn't fire. */}
      <div className="absolute top-[18px] right-2 z-20 flex gap-1">
        <button
          type="button"
          aria-label={`Apri cartella di ${project.name}`}
          title="Apri cartella"
          onClick={(e) => {
            e.stopPropagation();
            onOpenFolder();
          }}
          className="w-[26px] h-[26px] flex items-center justify-center bg-white border-2 border-bee-ink text-bee-ink hover:bg-bee-yellow"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          >
            <path d="M2 4.5h4l1.5 1.5H14v6.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5Z" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={`Elimina ${project.name}`}
          title="Elimina"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="w-[26px] h-[26px] flex items-center justify-center bg-white border-2 border-bee-ink text-bee-ink hover:bg-red-600 hover:text-white"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>
      </div>

      {/* Body — the whole card is clickable */}
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left bg-white border-bee border-bee-ink shadow-bee-2 transition-[transform,box-shadow] duration-100 hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-bee-4 focus:outline-none focus-visible:shadow-bee-y-strong"
      >
        {/* Top inset row keeps the action chips from overlapping the title */}
        <div className="px-4 pt-4 pb-2 flex items-start gap-2 min-h-[48px]">
          <h3 className="text-[18px] font-bold tracking-[-0.4px] leading-tight m-0 flex-1 min-w-0 break-words line-clamp-2 pr-[64px]">
            {project.name}
          </h3>
        </div>

        {/* Divider */}
        <div className="border-t-2 border-dashed border-bee-ink/30 mx-4" />

        {/* Meta block */}
        <div className="px-4 py-3 flex flex-col gap-1.5">
          <BeeMonoLabel
            as="div"
            className="normal-case tracking-normal text-[11px] text-bee-ink/70"
          >
            {relativeTimeIt(project.created_at)}
            {sizeBytes != null && (
              <>
                <span className="mx-1.5 opacity-40">·</span>
                {formatBytes(sizeBytes)}
              </>
            )}
          </BeeMonoLabel>

          <div className="mt-1">
            <span
              className={`inline-flex items-center px-1.5 py-1 font-mono text-[10px] font-bold tracking-[0.4px] uppercase leading-none ${toneClass}`}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Open hint */}
        <div className="border-t-bee border-bee-ink px-4 h-[34px] flex items-center justify-between bg-white group-hover:bg-bee-yellow transition-colors duration-100">
          <span className="font-mono text-[10px] font-bold tracking-[0.6px] uppercase text-bee-ink/80">
            Apri
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <path d="M5 9h8M9 5l4 4-4 4" />
          </svg>
        </div>
      </button>
    </div>
  );
}
