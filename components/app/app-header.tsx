"use client";

import { CalendarCheckIcon, DownloadIcon, FlaskConicalIcon, LogOutIcon, MenuIcon, MoonIcon, NotebookPenIcon, SettingsIcon, SunIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/hooks/use-theme";
import { useState, type ReactNode } from "react";
import { signOut } from "@/app/actions/auth";
import { Container } from "@/components/app/layout";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/journal", label: "Bitácora", hint: "Real y demo", icon: NotebookPenIcon },
  { href: "/backtesting", label: "Backtesting", hint: "Sin dinero real", icon: FlaskConicalIcon },
  { href: "/revision", label: "Revisión", hint: "Tu semana, los domingos", icon: CalendarCheckIcon },
  { href: "/ajustes", label: "Ajustes", hint: "Cuentas, reglas, estrategias", icon: SettingsIcon },
] as const;

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Cabecera de la app.
 * - Escritorio: navegación completa a la vista, con exportar, tema y salir.
 * - Móvil: logo + hamburguesa que abre un panel lateral con todo.
 * `toolbar` es una segunda fila opcional (en el journal: cuenta, mes, temporizador, registrar).
 */
export function AppHeader({ accountId, toolbar }: { accountId?: string | null; toolbar?: ReactNode }) {
  const isActive = useActive();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <Container className="flex h-14 items-center gap-4">
        <Link href="/journal" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight" aria-label="Racha, inicio">
          <Logo className="size-6" />
          <span className="text-base">Racha</span>
        </Link>

        {/* Navegación completa en escritorio */}
        <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
                isActive(item.href) ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-1 md:flex">
          {accountId && (
            <Button variant="ghost" size="sm" asChild>
              <a href={`/api/export?cuenta=${accountId}`} download>
                <DownloadIcon />
                Exportar CSV
              </a>
            </Button>
          )}
          <ThemeToggle />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label="Salir">
                <LogOutIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Salir</TooltipContent>
          </Tooltip>
        </div>

        {/* Hamburguesa solo en móvil */}
        <Button variant="ghost" size="icon" className="ml-auto md:hidden" onClick={() => setOpen(true)} aria-label="Abrir menú">
          <MenuIcon />
        </Button>
      </Container>

      {toolbar && (
        <div className="border-t">
          <Container className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">{toolbar}</Container>
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-xs gap-0 p-0 data-[side=left]:h-dvh">
          <SheetHeader className="border-b px-4 py-4">
            <SheetTitle className="flex items-center gap-2">
              <Logo className="size-5" />
              Racha
            </SheetTitle>
            <SheetDescription>Bitácora de Boom y Crash</SheetDescription>
          </SheetHeader>
          <nav aria-label="Principal" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-3",
                  isActive(item.href) ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                <item.icon className="size-5" />
                <span className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.hint}</span>
                </span>
              </Link>
            ))}
          </nav>
          <div className="flex flex-col gap-1 border-t p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {accountId && (
              <a href={`/api/export?cuenta=${accountId}`} download className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-muted/60">
                <DownloadIcon className="size-5 text-muted-foreground" />
                Exportar CSV
              </a>
            )}
            <ThemeToggle variant="row" />
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-muted/60"
            >
              <LogOutIcon className="size-5 text-muted-foreground" />
              Salir
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}

function ThemeToggle({ variant = "icon" }: { variant?: "icon" | "row" }) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const label = dark ? "Tema claro" : "Tema oscuro";
  const Icon = dark ? SunIcon : MoonIcon;

  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={() => setTheme(dark ? "light" : "dark")}
        className="flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-muted/60"
      >
        <Icon className="size-5 text-muted-foreground" />
        {label}
      </button>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={label}>
          <Icon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
