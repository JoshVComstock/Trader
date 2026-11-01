"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePrivacy } from "@/hooks/use-privacy";

/** El ojito: oculta o muestra los montos en toda la app. */
export function PrivacyToggle({ variant = "icon" }: { variant?: "icon" | "row" }) {
  const { hidden, toggle } = usePrivacy();
  const label = hidden ? "Mostrar montos" : "Ocultar montos";
  const Icon = hidden ? EyeOffIcon : EyeIcon;

  if (variant === "row") {
    return (
      <button type="button" onClick={toggle} className="flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-muted/60">
        <Icon className="size-5 text-muted-foreground" />
        {label}
      </button>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label={label} aria-pressed={hidden}>
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
