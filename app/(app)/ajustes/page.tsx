import type { Metadata } from "next";
import { PageHeader, PageMain, Panel } from "@/components/app/layout";
import { AccountsSection } from "@/components/settings/accounts-section";
import { PsychSection } from "@/components/settings/psych-section";
import { RefreshDataButton } from "@/components/settings/refresh-data-button";
import { RulesSection } from "@/components/settings/rules-section";
import { StrategiesSection } from "@/components/settings/strategies-section";
import { cloudinaryConfigured } from "@/lib/cloudinary";
import { getProfile, listAccounts, listStrategies, requireUser } from "@/lib/data";
import { pauseSeconds } from "@/lib/psych";

export const metadata: Metadata = { title: "Ajustes" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SECTIONS = [
  { id: "cuentas", label: "Cuentas" },
  { id: "reglas", label: "Reglas" },
  { id: "control-mental", label: "Control mental" },
  { id: "estrategias", label: "Estrategias" },
  { id: "capturas", label: "Capturas" },
  { id: "datos", label: "Datos" },
];

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const user = await requireUser();
  const [accounts, { rules, settings }, strategies] = await Promise.all([
    listAccounts(user.uid),
    getProfile(user.uid),
    listStrategies(user.uid),
  ]);
  const welcome = sp.bienvenida === "1" || accounts.length === 0;
  const newKind = sp.nueva === "backtest" ? "backtest" : sp.nueva === "real" ? "real" : null;

  return (
    <>

      <PageMain>
        <PageHeader title="Ajustes" description={user.email} />

        {welcome && (
          <div className="rounded-xl border border-brand/30 bg-brand/10 px-5 py-4 text-sm">
            <p className="font-medium">Bienvenido a Racha.</p>
            <p className="mt-1 text-muted-foreground">
              Crea tu cuenta de trading con el balance en dólares con el que empiezas. Tus reglas ya vienen con valores
              razonables: revísalas ahora, cuando estás tranquilo. Para practicar sin dinero real, crea también una cuenta
              de backtesting.
            </p>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10">
          {/* Índice de secciones, fijo al costado en escritorio */}
          <nav aria-label="Secciones de ajustes" className="hidden lg:block">
            <ul className="sticky top-24 space-y-1 text-sm">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="block rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted/60 hover:text-foreground">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0 space-y-10">
            <AccountsSection accounts={accounts} openNew={newKind ?? (accounts.length === 0 ? "real" : null)} />
            <RulesSection rules={rules} />
            <PsychSection settings={settings} pauseSeconds={pauseSeconds(rules)} />
            <StrategiesSection strategies={strategies} />

            <Panel id="capturas" title="Capturas" description="Dónde se guardan las imágenes de tus operaciones.">
              <p className="text-sm text-muted-foreground">
                {cloudinaryConfigured()
                  ? "Cloudinary está configurado. Las capturas se guardan como privadas y solo se ven con enlaces firmados que caducan en una hora."
                  : "Cloudinary no está configurado: no se pueden subir capturas. Añade CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET (ver README)."}
              </p>
            </Panel>

            <Panel id="datos" title="Datos" description="Tus datos viven en Firebase y la app guarda una copia en caché para abrir al instante.">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Cada cambio que haces en la app actualiza la caché solo. Si cargaste datos por fuera (migración, seed o la
                  consola de Firebase), vuelve a leerlos.
                </p>
                <RefreshDataButton />
              </div>
            </Panel>
          </div>
        </div>
      </PageMain>
    </>
  );
}
