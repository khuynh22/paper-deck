import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "ghost" | "outline";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:opacity-50 disabled:pointer-events-none";
const sizes = "h-10 px-5";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-primary-foreground font-semibold hover:brightness-110",
  outline: "border border-line bg-transparent text-ink hover:border-accent",
  ghost: "text-muted-foreground hover:bg-tint hover:text-ink",
};

export function buttonClass(variant: Variant = "primary", extra = ""): string {
  return `${base} ${sizes} ${variants[variant]} ${extra}`;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: { variant?: Variant } & ComponentProps<"button">) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  className = "",
  ...props
}: { variant?: Variant } & ComponentProps<typeof Link>) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-card text-card-foreground ${className}`}>
      {children}
    </div>
  );
}

export function Badge({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-md bg-tint px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
    >
      {children}
    </span>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line px-2 py-0.5 font-mono text-xs text-muted-foreground">
      {children}
    </span>
  );
}

/** Mono uppercase kicker line ("CONTINUE READING", "ABSTRACT", …). */
export function Kicker({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={`font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground ${className}`}
    >
      {children}
    </h2>
  );
}
