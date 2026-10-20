"use client";

import { DownloadIcon, FlaskConicalIcon, LogOutIcon, MenuIcon, MoonIcon, NotebookPenIcon, SettingsIcon, SunIcon } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { JournalMode } from "@/lib/domain/types";

export function AppMenu({ mode, accountId }: { mode?: JournalMode; accountId?: string | null }) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Menú">
          <MenuIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {accountId && (
          <DropdownMenuItem asChild>
            <a href={`/api/export?cuenta=${accountId}`} download>
              <DownloadIcon />
              Exportar CSV
            </a>
          </DropdownMenuItem>
        )}
        {mode !== "live" && (
          <DropdownMenuItem asChild>
            <Link href="/journal">
              <NotebookPenIcon />
              Bitácora (real y demo)
            </Link>
          </DropdownMenuItem>
        )}
        {mode !== "backtest" && (
          <DropdownMenuItem asChild>
            <Link href="/backtesting">
              <FlaskConicalIcon />
              Backtesting
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/ajustes">
            <SettingsIcon />
            Ajustes
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme(dark ? "light" : "dark")}>
          {dark ? <SunIcon /> : <MoonIcon />}
          {dark ? "Tema claro" : "Tema oscuro"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOutIcon />
          Salir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
