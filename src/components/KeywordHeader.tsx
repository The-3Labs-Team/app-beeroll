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
}

export function KeywordHeader({ keyword, phrase, current, total, onPrev, onSkip, onChange }: Props) {
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
        {editing ? (
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(keyword); setEditing(false); } }}
            className="text-2xl font-bold flex-1"
          />
        ) : (
          <h1 className="text-2xl font-bold flex-1 truncate" onDoubleClick={() => setEditing(true)}>{keyword}</h1>
        )}
        <Button variant="outline" size="sm" onClick={() => setEditing(true)} title="Edit keyword (e)">✎</Button>
        <Button variant="outline" size="sm" onClick={onSkip} title="Skip (→)">Skip</Button>
      </div>
      {phrase && (
        <p className="mt-2 ml-[60px] text-sm text-muted-foreground italic line-clamp-2">
          “{phrase}”
        </p>
      )}
    </header>
  );
}
