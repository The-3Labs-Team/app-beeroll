import { useState, useEffect } from "react";

interface Props {
  keyword: string;
  phrase?: string;
  current: number;
  total: number;
  onPrev: () => void;
  onSkip: () => void;
  onChange: (next: string) => void;
  onHome?: () => void;
  /**
   * Locks editing affordances (✎ and Skip) when a download is in flight or
   * paused. Navigation back (←) intentionally stays enabled.
   */
  disabled?: boolean;
}

const padded = (n: number) => String(n).padStart(2, "0");

export function KeywordHeader({
  keyword,
  phrase,
  current,
  total,
  onPrev,
  onSkip,
  onChange,
  onHome,
  disabled,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(keyword);

  useEffect(() => {
    setDraft(keyword);
  }, [keyword]);

  const commit = () => {
    if (draft.trim() && draft.trim() !== keyword) onChange(draft.trim());
    setEditing(false);
  };

  return (
    <header className="flex-shrink-0 border-b-bee border-bee-ink px-[22px] py-[18px] pb-4 flex flex-col gap-2 bg-white">
      <div className="flex items-center gap-3.5 flex-wrap">
        {onHome && (
          <button
            type="button"
            onClick={onHome}
            title="Torna ai progetti"
            className="font-mono text-[11px] font-bold tracking-[0.6px] uppercase no-underline text-bee-ink px-2.5 py-1.5 border-2 border-bee-ink bg-white hover:bg-bee-yellow transition-colors duration-100"
          >
            ◇ Progetti
          </button>
        )}
        <button
          type="button"
          onClick={onPrev}
          title="Punto precedente"
          aria-label="Punto precedente"
          className="w-[34px] h-[34px] border-2 border-bee-ink bg-white inline-flex items-center justify-center cursor-pointer p-0 hover:bg-bee-yellow transition-colors duration-100"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <path d="M9 3L4 7l5 4" />
          </svg>
        </button>
        <div className="font-mono text-[13px] font-bold bg-bee-ink text-bee-yellow px-2.5 py-1 tracking-[0.5px] flex-shrink-0">
          {padded(current + 1)}/{padded(total)}
        </div>
        {editing && !disabled ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(keyword);
                setEditing(false);
              }
            }}
            className="text-[28px] font-bold flex-1 min-w-[200px] border-bee border-bee-ink bg-white px-3 py-1 outline-none font-sans tracking-[-0.6px] focus:shadow-[4px_4px_0_#FFD60A] transition-shadow duration-75"
          />
        ) : (
          <h1
            className="text-[30px] font-bold tracking-[-0.8px] leading-none m-0 truncate"
            onDoubleClick={() => {
              if (!disabled) setEditing(true);
            }}
          >
            <span className="bee-hl-sm">{keyword || "—"}</span>
          </h1>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={disabled}
          title="Modifica keyword (e)"
          aria-label="Modifica keyword"
          className="w-[34px] h-[34px] border-2 border-bee-ink bg-white inline-flex items-center justify-center cursor-pointer p-0 hover:bg-bee-yellow transition-colors duration-100 disabled:opacity-50 disabled:hover:bg-white disabled:cursor-not-allowed"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 6.5l-4.5 4.5a2.5 2.5 0 1 1-3.5-3.5l5-5a1.6 1.6 0 1 1 2.3 2.3L5.5 9.5a.8.8 0 1 1-1.1-1.1L8 5" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={disabled}
          title="Salta (→)"
          className="h-[34px] px-4 bg-white text-bee-ink border-2 border-bee-ink font-sans text-[13px] font-semibold cursor-pointer hover:bg-bee-ink hover:text-bee-yellow transition-colors duration-100 disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-bee-ink disabled:cursor-not-allowed"
        >
          Salta →
        </button>
      </div>
      {phrase && <div className="bee-quote line-clamp-2">{phrase}</div>}
    </header>
  );
}
