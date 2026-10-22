"use client";

import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { migrateLegacyTheme } from "@/hooks/use-theme";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    migrateLegacyTheme();
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      {children}
      <Toaster position="top-center" />
    </TooltipProvider>
  );
}
