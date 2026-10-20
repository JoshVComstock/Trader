import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppMenu } from "@/components/app/app-menu";
import { AccountsSection } from "@/components/settings/accounts-section";
import { RulesSection } from "@/components/settings/rules-section";
import { StrategiesSection } from "@/components/settings/strategies-section";
import { listAccounts, listRules, listStrategies, requireUser } from "@/lib/data";
import { cloudinaryConfigured } from "@/lib/cloudinary";

export const metadata: Metadata = { title: "Ajustes" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const [accounts, rules, strategies] = await Promise.all([
    listAccounts(supabase),
    listRules(supabase),
    listStrategies(supabase),
  ]);
  const welcome = sp.bienvenida === "1" || accounts.length === 0;
  const newKind = sp.nueva === "backtest" ? "backtest" : sp.nueva === "real" ? "real" : null;

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-2.5">
          <Link href="/journal" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-4" />
            Bitácora
          </Link>
          <AppMenu />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-10 px-4 pt-6 pb-16">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
          <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
        </div>

        {welcome && (
          <div className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm">
            <p className="font-medium">Bienvenido a Racha.</p>
            <p className="mt-1 text-muted-foreground">
              Crea tu cuenta de trading con el balance con el que empiezas. Tus reglas ya vienen con valores razonables:
              revísalas ahora, cuando estás tranquilo. Para practicar sin dinero real, crea también una cuenta de backtesting.
            </p>
          </div>
        )}

        <AccountsSection accounts={accounts} openNew={newKind ?? (accounts.length === 0 ? "real" : null)} />
        <RulesSection rules={rules} />
        <StrategiesSection strategies={strategies} />

        <section className="space-y-2 text-sm">
          <h2 className="text-lg font-semibold">Capturas</h2>
          <p className="text-muted-foreground">
            {cloudinaryConfigured()
              ? "Cloudinary está configurado. Las capturas se guardan como privadas y solo se ven con enlaces firmados que caducan en una hora."
              : "Cloudinary no está configurado: no se pueden subir capturas. Añade CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET (ver README)."}
          </p>
        </section>
      </main>
    </>
  );
}
