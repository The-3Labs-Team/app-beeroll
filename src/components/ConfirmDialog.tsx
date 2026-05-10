import { ReactNode } from "react";
import { Dialog, DialogContent } from "./ui/dialog";
import { BeeButton } from "./bee/BeeButton";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true the confirm button is rendered in a destructive style. */
  danger?: boolean;
  onConfirm: () => void;
  busy?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Conferma",
  cancelLabel = "Annulla",
  danger = false,
  onConfirm,
  busy = false,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px] border-bee border-bee-ink shadow-bee-2 bg-white p-0 rounded-md overflow-hidden">
        <div className="px-6 pt-6 pb-2">
          <h2 className="text-[22px] font-bold tracking-[-0.6px] leading-tight m-0">
            {title}
          </h2>
          {description ? (
            <div className="mt-3 text-[14px] leading-snug text-bee-ink/80">
              {description}
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2.5 px-6 pb-6 pt-2">
          <BeeButton
            variant="default"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {cancelLabel}
          </BeeButton>
          <BeeButton
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Attendi…" : confirmLabel}
          </BeeButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
