"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";

/** Botón de opción con estado presionado. Grande para el pulgar, sin animaciones. */     
export function Choice({
  selected,
  tone = "brand",
  className,
  children,
  ...props
}: Omit<ComponentProps<"button">, "type"> & {
  selected: boolean;
  tone?: "brand" | "gain" | "loss" | "neutral";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors outline-none select-none",
        "focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        selected
          ? {
              brand: "border-brand/60 bg-brand/15 text-foreground",
              gain: "border-gain/60 bg-gain/15 text-gain",
              loss: "border-loss/60 bg-loss/15 text-loss",
              neutral: "border-foreground/30 bg-foreground/10 text-foreground",
            }[tone]
          : "border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</span>
      {hint && <span className="text-xs text-subtle">{hint}</span>}
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-loss">
      {message}
    </p>
  );
}
