import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  keyword: string;
  phrase?: string;
  current: number;
  total: number;
  onPrev: () => void;
  onSkip: () => void;
  onChange: (next: string) => void;
  /**
   * Locks the editing affordances (✎ and Skip) when a download is in flight or
   * paused for the current point. Navigation back (←) intentionally stays
   * enabled so the user can inspect other points without aborting.
   */
  disabled?: boolean;
}

export function KeywordHeader({ keyword, phrase, current, total, onPrev, onSkip, onChange, disabled }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(keyword);

  useEffect(() => { setDraft(keyword); }, [keyword]);

  const commit = () => {
    if (draft.trim() && draft.trim() !== keyword) onChange(draft.trim());
    setEditing(false);
  };

  return (
    <header className="px-6 py-4 border-b border-border">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onPrev}>←</Button>
        <span className="text-xs text-muted-foreground">{current + 1}/{total}</span>
        {editing && !disabled ? (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(keyword); setEditing(false); } }}
            className="text-2xl font-bold flex-1"
          />
        ) : (
          <h1 className="text-2xl font-bold flex-1 truncate" onDoubleClick={() => { if (!disabled) setEditing(true); }}>{keyword}</h1>
        )}
        <Button variant="outline" size="sm" onClick={() => setEditing(true)} title="Edit keyword (e)" disabled={disabled}>✎</Button>
        <Button variant="outline" size="sm" onClick={onSkip} title="Skip (→)" disabled={disabled}>Skip</Button>
      </div>
      {phrase && (
        <p className="mt-2 ml-[60px] text-sm text-muted-foreground italic line-clamp-2">
          “{phrase}”
        </p>
      )}
    </header>
  );
}
