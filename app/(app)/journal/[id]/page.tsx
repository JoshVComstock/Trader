import { ArrowLeftIcon, CheckIcon, MinusIcon, TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageMain, Panel } from "@/components/app/layout";
import { AttachmentsPanel } from "@/components/trade/attachments-panel";
import { NoteEditor } from "@/components/trade/note-editor";
import { TradeActions } from "@/components/trade/trade-actions";
import { cloudinaryConfigured, signedImageUrl } from "@/lib/cloudinary";
import { getProfile, getTradeDetail, listStrategies, requireUser } from "@/lib/data";
import { CHECKLIST_GROUPS } from "@/lib/domain/checklist";
import { instrumentLabel } from "@/lib/domain/instruments";
import { ACCOUNT_KIND_LABEL, DIRECTION_LABEL, MOOD_LABEL, OUTCOME_LABEL, modeForKind } from "@/lib/domain/types";
import { duration, inLaPaz, money, rValue, signedMoney } from "@/lib/format";
import { RULE_META, type RuleType } from "@/lib/rules";
import { cn } from "@/lib/utils";
import { Private } from "@/components/app/private";

export const metadata: Metadata = { title: "Operación" };

export default async function TradeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await getTradeDetail(id);
  if (!detail) notFound();

  const { uid } = await requireUser();
  const [strategies, { rules }] = await Promise.all([listStrategies(uid), getProfile(uid)]);
  const { trade, account, strategy, violations, attachments, session } = detail;
  const mode = modeForKind(account.kind);
  const back = `${mode === "backtest" ? "/backtesting" : "/journal"}?cuenta=${account.id}&mes=${trade.session_date.slice(0, 7)}`;
  const tone = trade.pnl > 0 ? "text-gain" : trade.pnl < 0 ? "text-loss" : "text-foreground";
  const shots = attachments.map((a) => ({ id: a.id, width: a.width, height: a.height, url: signedImageUrl(a.path) }));

  const metrics = [
    { label: "Stake", value: money(trade.stake, account.currency), secret: true },
    { label: "R", value: rValue(trade.r_multiple), className: tone, secret: false },
    { label: "Duración", value: duration(trade.opened_at, trade.closed_at), secret: false },
    { label: "Spike", value: trade.with_spike ? "A favor" : "Contra", className: trade.with_spike ? undefined : "text-warn", secret: false },
  ];

  return (
    <>

      <PageMain className="max-w-6xl">
        {/* Volver + acciones */}
        <div className="flex items-center justify-between gap-2">
          <Link href={back} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-4" />
            Volver a {mode === "backtest" ? "Backtesting" : "la bitácora"}
          </Link>
          <div className="flex items-center gap-1">
            <TradeActions trade={trade} mode={mode} strategies={strategies} rules={rules} currency={account.currency} backHref={back} />
          </div>
        </div>

        {/* Encabezado */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-muted-foreground">
              {account.label} · {ACCOUNT_KIND_LABEL[account.kind]} · {inLaPaz(trade.opened_at, "EEEE d 'de' MMMM, HH:mm")}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {instrumentLabel(trade.instrument)} <span className="text-muted-foreground">· {DIRECTION_LABEL[trade.direction]}</span>
            </h1>
          </div>
          <div className="text-right">
            <p className={cn("num text-4xl font-semibold tracking-tight sm:text-5xl", tone)}><Private>{signedMoney(trade.pnl, account.currency)}</Private></p>
            <p className={cn("text-sm", tone)}>{OUTCOME_LABEL[trade.outcome]}</p>
          </div>
        </header>

        {/* Métricas */}
        <section aria-label="Métricas" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className="bg-card px-4 py-4 sm:px-5">
              <p className="text-sm text-muted-foreground">{m.label}</p>
              <p className={cn("num mt-1 text-xl font-semibold", m.className)}>{m.secret ? <Private>{m.value}</Private> : m.value}</p>
            </div>
          ))}
        </section>

        {violations.length > 0 && (
          <Panel
            className="border-warn/30 bg-warn/5"
            title={
              <span className="flex items-center gap-2 text-warn">
                <TriangleAlertIcon className="size-4" />
                {violations.length === 1 ? "Rompió una regla" : `Rompió ${violations.length} reglas`}
              </span>
            }
          >
            <ul className="space-y-1.5 text-sm">
              {violations.map((v) => (
                <li key={v.id}>
                  <span className="text-muted-foreground">{RULE_META[v.rule_type as RuleType]?.title ?? v.rule_type}: </span>
                  {v.message}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          <div className="space-y-5">
            <Panel title="Ejecución">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                <Item label="Apertura" value={inLaPaz(trade.opened_at, "HH:mm:ss")} />
                <Item label="Cierre" value={trade.closed_at ? inLaPaz(trade.closed_at, "HH:mm:ss") : "—"} />
                <Item label="SL" value={money(trade.stake, account.currency)} secret />
                <Item label="TP" value={trade.tp === null ? "—" : money(trade.tp, account.currency)} secret />
                <Item label="Estrategia" value={strategy?.name ?? "—"} />
                <Item label="Estado mental" value={trade.mood ? MOOD_LABEL[trade.mood] : "—"} />
                <Item label="Plan" value={trade.in_plan ? "Dentro del plan" : "Fuera del plan"} />
                <Item
                  label="Sesión"
                  value={session.status === "blocked" ? "Bloqueada" : session.status === "closed" ? "Cerrada" : "Abierta"}
                />
              </dl>
            </Panel>

            <Panel title="Checklist" description="Lo que marcaste al registrar la operación.">
              <div className="grid gap-4 sm:grid-cols-3">
                {CHECKLIST_GROUPS.map((g) => (
                  <div key={g.title} className="rounded-lg bg-muted/30 p-3">
                    <p className="text-xs font-medium tracking-wide text-subtle uppercase">{g.title}</p>
                    <ul className="mt-2 space-y-2 text-sm">
                      {g.items.map((item) => {
                        const checked = trade.checklist[item.key];
                        // "Impulso" marcado es un error: se resalta en rojo.
                        const bad = item.key === "impulse" && checked;
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
            </Panel>

            <NoteEditor tradeId={trade.id} initial={trade.note} />
          </div>

          <div className="space-y-5">
            <AttachmentsPanel tradeId={trade.id} initial={shots} enabled={cloudinaryConfigured()} />
            {session.journal && (
              <Panel title="Reflexión de la sesión">
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{session.journal}</p>
              </Panel>
            )}
          </div>
        </div>
      </PageMain>
    </>
  );
}

function Item({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="num truncate text-[15px]">{secret ? <Private>{value}</Private> : value}</dd>
    </div>
  );
}
