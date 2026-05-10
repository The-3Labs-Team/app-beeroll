import { Dialog, DialogContent } from "./ui/dialog";
import { BeeButton } from "./bee/BeeButton";
import { BeeMonoLabel } from "./bee/BeeMonoLabel";
import type { VideoSourceId } from "../types";

export type DurationBucket = "any" | "short" | "medium" | "long";

export interface PickerFilters {
  /** Which sources to include in the result grid. */
  sources: Record<VideoSourceId, boolean>;
  /** Duration bucket: short = <60s, medium = 1-5min, long = >5min. */
  duration: DurationBucket;
}

export const DEFAULT_FILTERS: PickerFilters = {
  sources: { youtube: true, pixabay: true, pexels: true },
  duration: "any",
};

/** True when any filter is set away from "include everything". Drives the
 * indicator dot on the toolbar trigger. */
export function isFilterActive(f: PickerFilters): boolean {
  if (f.duration !== "any") return true;
  return !(f.sources.youtube && f.sources.pixabay && f.sources.pexels);
}

const SOURCES: { id: VideoSourceId; label: string; chipBg: string }[] = [
  { id: "youtube", label: "YouTube", chipBg: "bg-[#FF0000] text-white" },
  { id: "pixabay", label: "Pixabay", chipBg: "bg-[#2EC56C] text-white" },
  { id: "pexels", label: "Pexels", chipBg: "bg-bee-ink text-white" },
];

const DURATION_OPTIONS: {
  id: DurationBucket;
  label: string;
  hint: string;
}[] = [
  { id: "any", label: "Tutto", hint: "Nessun limite" },
  { id: "short", label: "Brevi", hint: "Meno di 1 min" },
  { id: "medium", label: "Medi", hint: "1 – 5 min" },
  { id: "long", label: "Lunghi", hint: "Più di 5 min" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: PickerFilters;
  onChange: (next: PickerFilters) => void;
}

export function FilterDialog({ open, onOpenChange, filters, onChange }: Props) {
  const toggleSource = (id: VideoSourceId) => {
    onChange({
      ...filters,
      sources: { ...filters.sources, [id]: !filters.sources[id] },
    });
  };
  const setDuration = (d: DurationBucket) => {
    onChange({ ...filters, duration: d });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] border-bee border-bee-ink shadow-bee-2 bg-white p-0 rounded-md overflow-hidden">
        <div className="px-6 pt-5 pb-3 border-b-bee border-bee-ink flex items-center justify-between">
          <h2 className="text-[20px] font-bold tracking-[-0.4px] leading-none m-0">
            Filtra risultati
          </h2>
          {isFilterActive(filters) && (
            <button
              type="button"
              onClick={() => onChange(DEFAULT_FILTERS)}
              className="font-mono text-[10.5px] font-bold tracking-[0.5px] uppercase border-2 border-bee-ink bg-white px-2 py-1 hover:bg-bee-yellow"
            >
              Reset
            </button>
          )}
        </div>

        <div className="px-6 py-5 flex flex-col gap-6">
          {/* Sources */}
          <section className="flex flex-col gap-2.5">
            <BeeMonoLabel
              as="div"
              className="text-[11px] tracking-[0.5px]"
            >
              Sorgenti
            </BeeMonoLabel>
            <div className="flex flex-wrap gap-2">
              {SOURCES.map((s) => {
                const on = filters.sources[s.id];
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSource(s.id)}
                    className={`inline-flex items-center gap-2 px-3 py-2 border-2 border-bee-ink font-sans text-[13px] font-semibold transition-[transform,box-shadow] duration-75 ${
                      on
                        ? "bg-bee-yellow text-bee-ink shadow-bee-1"
                        : "bg-white text-bee-ink/55 line-through"
                    } hover:-translate-x-[1px] hover:-translate-y-[1px]`}
                    aria-pressed={on}
                  >
                    <span
                      className={`font-mono text-[10px] font-bold px-1.5 py-0.5 tracking-[0.3px] ${s.chipBg}`}
                    >
                      {s.id === "youtube"
                        ? "YT"
                        : s.id === "pixabay"
                          ? "PX"
                          : "PE"}
                    </span>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Duration */}
          <section className="flex flex-col gap-2.5">
            <BeeMonoLabel
              as="div"
              className="text-[11px] tracking-[0.5px]"
            >
              Durata
            </BeeMonoLabel>
            <div
              className="inline-flex border-bee border-bee-ink bg-white w-full"
              role="tablist"
            >
              {DURATION_OPTIONS.map((d, i, arr) => {
                const active = filters.duration === d.id;
                const isLast = i === arr.length - 1;
                return (
                  <button
                    key={d.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setDuration(d.id)}
                    title={d.hint}
                    className={`flex-1 px-2 h-[42px] font-sans text-[12.5px] font-semibold transition-colors duration-100 ${
                      isLast ? "" : "border-r-bee border-bee-ink"
                    } ${
                      active
                        ? "bg-bee-ink text-bee-yellow"
                        : "bg-transparent text-bee-ink hover:bg-bee-yellow"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <BeeMonoLabel
              as="p"
              className="normal-case tracking-normal text-[11px] text-bee-ink/65"
            >
              {DURATION_OPTIONS.find((d) => d.id === filters.duration)?.hint}
            </BeeMonoLabel>
          </section>
        </div>

        <div className="px-6 pb-5 pt-2 flex justify-end">
          <BeeButton variant="primary" onClick={() => onOpenChange(false)}>
            Applica
          </BeeButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Apply the active filters to a candidate list. Returns a new array — does
 * not mutate the input. Generic over any element shape that has the two
 * fields we care about, so VideoGrid's `VideoCandidate` plugs in directly.
 */
export function applyFilters<
  T extends { source: VideoSourceId; duration_sec: number },
>(results: T[], filters: PickerFilters): T[] {
  return results.filter((r) => {
    if (!filters.sources[r.source]) return false;
    const d = r.duration_sec;
    if (filters.duration === "short" && d >= 60) return false;
    if (filters.duration === "medium" && (d < 60 || d > 300)) return false;
    if (filters.duration === "long" && d <= 300) return false;
    return true;
  });
}
