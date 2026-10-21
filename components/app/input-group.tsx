import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Input con prefijo o sufijo dentro del borde ($, %, min, s, ×). */
export function InputGroup({
  prefix,
  suffix,
  className,
  inputClassName,
  ...props
}: ComponentProps<"input"> & { prefix?: ReactNode; suffix?: ReactNode; inputClassName?: string }) {
  return (
    <div
      className={cn(
        "flex h-10 items-center rounded-lg border border-input bg-transparent transition-colors dark:bg-input/30",
        "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        "has-[[aria-invalid=true]]:border-loss",
        className,
      )}
    >
      {prefix && <span className="pl-3 text-sm text-muted-foreground">{prefix}</span>}
      <input
        className={cn(
          "num h-full w-full min-w-0 bg-transparent px-3 text-base outline-none placeholder:text-subtle sm:text-sm",
          prefix ? "pl-1.5" : undefined,
          suffix ? "pr-1.5" : undefined,
          inputClassName,
        )}
        {...props}
      />
      {suffix && <span className="pr-3 text-sm whitespace-nowrap text-muted-foreground">{suffix}</span>}
    </div>
  );
}

/** Control segmentado: dos o tres opciones excluyentes en una sola pieza. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  options: readonly { value: T; label: ReactNode; tone?: "brand" | "loss" }[];
  onChange: (value: T) => void;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("inline-flex rounded-lg border bg-muted/40 p-0.5", className)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-8 flex-1 rounded-md px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              selected
                ? o.tone === "loss"
                  ? "bg-loss/15 text-loss shadow-sm"
                  : "bg-background text-foreground shadow-sm dark:bg-card"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
