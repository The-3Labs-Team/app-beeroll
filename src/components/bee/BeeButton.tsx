import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant =
  | "primary"
  | "default"
  | "dark"
  | "icon"
  | "ghost"
  | "back"
  | "skip"
  | "cta-large"
  | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children?: ReactNode;
}

const base =
  "inline-flex items-center font-sans cursor-pointer transition-[transform,box-shadow,background] duration-75 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-none focus:outline-none";

const variants: Record<Variant, string> = {
  // Yellow CTA — the dominant call-to-action
  primary:
    "h-[46px] px-[22px] gap-2 bg-bee-yellow text-bee-ink border-bee border-bee-ink shadow-bee-2 text-[15px] font-bold leading-none hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-bee-4",
  // Standard white bordered button
  default:
    "h-[46px] px-[18px] gap-2 bg-white text-bee-ink border-bee border-bee-ink text-[14px] font-semibold leading-none hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-bee-1",
  // Dark CTA (Picker download button) — black bg, yellow text, yellow shadow
  dark:
    "h-[50px] px-5 gap-2 bg-bee-ink text-bee-yellow border-bee border-bee-ink shadow-bee-y-cta text-[14px] font-bold leading-none hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-bee-y",
  // Square white icon button (in titlebar header rows)
  icon:
    "w-[46px] h-[46px] justify-center bg-white text-bee-ink border-bee border-bee-ink hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-bee-1",
  // Borderless ghost (rare — mostly for inline links)
  ghost:
    "h-9 px-3 gap-1 bg-transparent text-bee-ink text-[13px] font-semibold leading-none hover:bg-bee-yellow",
  // Back chip (mono uppercase, 2px border)
  back:
    "h-auto px-[10px] py-[6px] gap-1.5 font-mono text-[12px] font-bold uppercase tracking-[0.6px] bg-white text-bee-ink border-2 border-bee-ink leading-none hover:-translate-x-[1px] hover:-translate-y-[1px] hover:bg-bee-yellow hover:shadow-bee-1",
  // Skip / small action button (project header)
  skip:
    "h-[34px] px-4 gap-2 bg-white text-bee-ink border-2 border-bee-ink text-[13px] font-semibold leading-none hover:bg-bee-ink hover:text-bee-yellow",
  // Large CTA (Import page submit)
  "cta-large":
    "h-[58px] px-[26px] gap-2.5 bg-bee-yellow text-bee-ink border-bee border-bee-ink shadow-bee-4 text-[16px] font-bold tracking-[-0.2px] leading-none hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-bee-5",
  // Destructive action (delete confirmations) — red bg, white text, ink border
  danger:
    "h-[46px] px-[18px] gap-2 bg-red-600 text-white border-bee border-bee-ink shadow-bee-2 text-[14px] font-bold leading-none hover:bg-red-700 hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-bee-4",
};

export function BeeButton({
  variant = "default",
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
