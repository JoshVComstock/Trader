import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Un monto que se tapa con **** cuando el modo privado está prendido (el ojito de la cabecera).
 * Lo hace el CSS (`.privacy .money`), así sirve igual en componentes de servidor y de cliente.
 */
export function Private({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("money", className)}>{children}</span>;
}
