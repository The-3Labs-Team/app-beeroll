import { useState, useEffect } from "react";

interface Props {
  keyword: string;
  theme?: string;
  phrase?: string;
  current: number;
  total: number;
  onPrev: () => void;
  onSkip: () => void;
  /** Optional "finish" action — opens the summary page after confirmation. */
  onFinish?: () => void;
  /** Optional filter trigger — opens a modal with source + duration filters. */
  onFilter?: () => void;
  /** When true, decorate the filter trigger with a yellow dot to signal that
   * filters are currently narrowing the result grid. */
  filterActive?: boolean;
  onChange: (next: string) => void;
  onHome?: () => void;
  /**
   * Locks editing affordances (✎ and Finish) when a download is in flight or
   * paused. Navigation back (←) intentionally stays enabled.
   */
  disabled?: boolean;
  /**
   * When true the right-side action becomes a plain "advance to next"
   * (label: "Avanti"), enabled regardless of `disabled`. Used while a
   * download is in progress so the user can move on without cancelling
   * the in-flight work.
   */
  advanceOnly?: boolean;
}

const padded = (n: number) => String(n).padStart(2, "0");

export function KeywordHeader({
  keyword,
  theme,
  phrase,
  current,
  total,
  onPrev,
  onSkip,
  onFinish,
  onFilter,
  filterActive,
  onChange,
  onHome,
  disabled,
  advanceOnly,
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
            aria-label="Torna ai progetti"
            className="w-[34px] h-[34px] border-2 border-bee-ink bg-white inline-flex items-center justify-center cursor-pointer p-0 text-bee-ink hover:bg-bee-yellow transition-colors duration-100"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 7.5 8 2l6 5.5V14a.5.5 0 0 1-.5.5H10v-4H6v4H2.5a.5.5 0 0 1-.5-.5V7.5Z" />
            </svg>
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
            className={`text-[30px] font-bold tracking-[-0.8px] leading-none m-0 truncate ${
              disabled ? "cursor-not-allowed opacity-80" : "cursor-pointer"
            }`}
            title={disabled ? undefined : "Clicca per modificare la keyword"}
            onClick={() => {
              if (!disabled) setEditing(true);
            }}
          >
            <span className="bee-hl-sm">{keyword || "—"}</span>
          </h1>
        )}
        <div className="flex-1" />
        {onFilter && (
          <button
            type="button"
            onClick={onFilter}
            title="Filtra risultati"
            aria-label="Filtra risultati"
            className="relative w-[34px] h-[34px] border-2 border-bee-ink bg-white inline-flex items-center justify-center cursor-pointer p-0 hover:bg-bee-yellow transition-colors duration-100"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 2h12L8.5 7.5v4.5L5.5 13.5V7.5L1 2Z" />
            </svg>
            {filterActive && (
              <span className="absolute -top-1 -right-1 w-[10px] h-[10px] bg-bee-yellow border-2 border-bee-ink rounded-full" />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={onSkip}
          disabled={disabled && !advanceOnly}
          title={advanceOnly ? "Avanti (→)" : "Salta (→)"}
          className="h-[34px] px-4 bg-white text-bee-ink border-2 border-bee-ink font-sans text-[13px] font-semibold cursor-pointer hover:bg-bee-ink hover:text-bee-yellow transition-colors duration-100 disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-bee-ink disabled:cursor-not-allowed"
        >
          {advanceOnly ? "Avanti →" : "Salta →"}
        </button>
        {onFinish && (
          <button
            type="button"
            onClick={onFinish}
            disabled={disabled}
            title="Termina progetto"
            className="h-[34px] px-4 bg-bee-yellow text-bee-ink border-2 border-bee-ink font-sans text-[13px] font-semibold cursor-pointer hover:bg-bee-ink hover:text-bee-yellow transition-colors duration-100 disabled:opacity-50 disabled:hover:bg-bee-yellow disabled:hover:text-bee-ink disabled:cursor-not-allowed"
          >
            Fine ✓
          </button>
        )}
      </div>
      {theme && (
        <div className="flex items-center gap-2">
          <span className="inline-block w-1 h-3 bg-bee-yellow" />
          <span className="font-mono text-[10px] font-bold tracking-[0.6px] uppercase text-bee-mute">
            {theme}
          </span>
        </div>
      )}
      {phrase && <div className="bee-quote line-clamp-2">{phrase}</div>}
    </header>
  );
}
