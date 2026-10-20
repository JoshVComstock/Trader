import { cn } from "@/lib/utils";
import { ArrowLeftIcon, CheckIcon, MinusIcon, TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppMenu } from "@/components/app/app-menu";
import { AttachmentsPanel } from "@/components/trade/attachments-panel";
import { NoteEditor } from "@/components/trade/note-editor";
import { TradeActions } from "@/components/trade/trade-actions";
import { cloudinaryConfigured, signedImageUrl } from "@/lib/cloudinary";
import { getTradeDetail, listRules, listStrategies, requireUser } from "@/lib/data";
import { CHECKLIST_GROUPS } from "@/lib/domain/checklist";
import { instrumentLabel } from "@/lib/domain/instruments";
import { ACCOUNT_KIND_LABEL, DIRECTION_LABEL, MOOD_LABEL, OUTCOME_LABEL, modeForKind } from "@/lib/domain/types";
import { duration, inLaPaz, money, rValue, signedMoney } from "@/lib/format";
import { RULE_META, type RuleType } from "@/lib/rules";

export const metadata: Metadata = { title: "Operación" };

export default async function TradeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await getTradeDetail(id);
  if (!detail) notFound();

  const { supabase } = await requireUser();
  const [strategies, rules] = await Promise.all([listStrategies(supabase), listRules(supabase)]);
  const { trade, account, strategy, violations, attachments, session } = detail;
  const mode = modeForKind(account.kind);
  const back = `${mode === "backtest" ? "/backtesting" : "/journal"}?cuenta=${account.id}&mes=${trade.session_date.slice(0, 7)}`;
  const tone = trade.pnl > 0 ? "text-gain" : trade.pnl < 0 ? "text-loss" : "text-foreground";

  const shots = attachments.map((a) => ({ id: a.id, width: a.width, height: a.height, url: signedImageUrl(a.path) }));

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-2.5">
          <Link href={back} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-4" />
            {mode === "backtest" ? "Backtesting" : "Bitácora"}
          </Link>
          <div className="flex items-center gap-1">
            <TradeActions
              trade={trade}
              mode={mode}
              strategies={strategies}
              rules={rules}
              currency={account.currency}
              backHref={back}
            />
            <AppMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 pt-5 pb-16">
        {/* Encabezado */}
        <section className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {account.label} · {ACCOUNT_KIND_LABEL[account.kind]} · {inLaPaz(trade.opened_at, "EEEE d 'de' MMMM, HH:mm")}
          </p>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {instrumentLabel(trade.instrument)} <span className="text-muted-foreground">· {DIRECTION_LABEL[trade.direction]}</span>
            </h1>
            <div className="text-right">
              <p className={cn("num text-4xl font-semibold tracking-tight", tone)}>{signedMoney(trade.pnl, account.currency)}</p>
              <p className={cn("text-sm", tone)}>{OUTCOME_LABEL[trade.outcome]}</p>
            </div>
          </div>
        </section>

        {/* Métricas */}
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
          {[
            { label: "Stake", value: money(trade.stake, account.currency) },
            { label: "R", value: rValue(trade.r_multiple), className: tone },
            { label: "Duración", value: duration(trade.opened_at, trade.closed_at) },
            {
              label: "Spike",
              value: trade.with_spike ? "A favor" : "Contra",
              className: trade.with_spike ? undefined : "text-warn",
            },
          ].map((m) => (
            <div key={m.label} className="bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className={cn("num mt-1 text-lg font-medium", m.className)}>{m.value}</p>
            </div>
          ))}
        </section>

        {/* Violaciones */}
        {violations.length > 0 && (
          <section className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-warn">
              <TriangleAlertIcon className="size-4" />
              {violations.length === 1 ? "Rompió una regla" : `Rompió ${violations.length} reglas`}
            </h2>
            <ul className="mt-2 space-y-1.5 text-sm">
              {violations.map((v) => (
                <li key={v.id}>
                  <span className="text-muted-foreground">{RULE_META[v.rule_type as RuleType]?.title ?? v.rule_type}: </span>
                  {v.message}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Ejecución */}
        <section className="rounded-xl border bg-card px-4 py-3">
          <h2 className="text-sm font-medium">Ejecución</h2>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <Item label="Apertura" value={inLaPaz(trade.opened_at, "HH:mm:ss")} />
            <Item label="Cierre" value={trade.closed_at ? inLaPaz(trade.closed_at, "HH:mm:ss") : "—"} />
            <Item label="SL" value={money(trade.stake, account.currency)} />
            <Item label="TP" value={trade.tp === null ? "—" : money(trade.tp, account.currency)} />
            <Item label="Estrategia" value={strategy?.name ?? "—"} />
            <Item label="Estado mental" value={trade.mood ? MOOD_LABEL[trade.mood] : "—"} />
            <Item label="Plan" value={trade.in_plan ? "Dentro del plan" : "Fuera del plan"} />
            <Item label="Sesión" value={session.status === "blocked" ? "Bloqueada" : session.status === "closed" ? "Cerrada" : "Abierta"} />
          </dl>
        </section>

        {/* Checklist */}
        <section className="rounded-xl border bg-card px-4 py-3">
          <h2 className="text-sm font-medium">Checklist</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            {CHECKLIST_GROUPS.map((g) => (
              <div key={g.title}>
                <p className="text-xs text-subtle">{g.title}</p>
                <ul className="mt-1.5 space-y-1.5 text-sm">
                  {g.items.map((item) => {
                    const checked = trade.checklist[item.key];
                    // "Impulso" marcado es un error: se resalta en rojo.
                    const bad = item.key === "impulse" ? checked : false;
                    return (
                      <li key={item.key} className={cn("flex items-start gap-2", checked ? "text-foreground" : "text-subtle")}>
                        {checked ? (
                          <CheckIcon className={cn("mt-0.5 size-4 shrink-0", bad ? "text-loss" : "text-brand")} />
                        ) : (
                          <MinusIcon className="mt-0.5 size-4 shrink-0" />
                        )}
                        <span className={bad ? "text-loss" : undefined}>
                          {item.label}
                          {checked && item.hint && <span className="block text-xs text-muted-foreground">{item.hint}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Nota */}
        <NoteEditor tradeId={trade.id} initial={trade.note} />

        {/* Capturas */}
        <AttachmentsPanel tradeId={trade.id} initial={shots} enabled={cloudinaryConfigured()} />

        {session.journal && (
          <section className="rounded-xl border bg-card px-4 py-3">
            <h2 className="text-sm font-medium">Reflexión de la sesión</h2>
            <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">{session.journal}</p>
          </section>
        )}
      </main>
    </>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="num truncate">{value}</dd>
    </div>
  );
}
