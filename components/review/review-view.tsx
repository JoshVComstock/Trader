"use client";

import { ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveWeeklyReview } from "@/app/actions/psych";
import { Choice } from "@/components/app/choice";
import { PageHeader, Panel } from "@/components/app/layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { round } from "@/lib/calc/trade";
import type { ReviewData, ReviewTrade } from "@/lib/data";
import { INSTRUMENTS, instrumentLabel } from "@/lib/domain/instruments";
import { DIRECTION_LABEL, MOOD_LABEL, MOODS, OUTCOME_LABEL, type Mood, type Outcome } from "@/lib/domain/types";
import { dateTimeShort, inLaPaz, percent, rValue, signedMoney } from "@/lib/format";
import { RULE_META, type RuleType } from "@/lib/rules";
import { addDays } from "@/lib/time-core";
import { cn } from "@/lib/utils";

type Spike = "all" | "with" | "against";

interface Filters {
  account: string;
  instrument: string;
  spike: Spike;
  strategy: string;
  mood: Mood | "all";
  outcome: Outcome | "all";
  plan: "all" | "in" | "out";
}

const ALL: Filters = { account: "all", instrument: "all", spike: "all", strategy: "all", mood: "all", outcome: "all", plan: "all" };

function dayTitle(date: string) {
  return inLaPaz(`${date}T16:00:00Z`, "d 'de' MMMM");
}

function applyFilters(trades: readonly ReviewTrade[], f: Filters) {
  return trades.filter(
    (t) =>
      (f.account === "all" || t.account_id === f.account) &&
      (f.instrument === "all" || t.instrument === f.instrument) &&
      (f.spike === "all" || (f.spike === "with" ? t.with_spike : !t.with_spike)) &&
      (f.strategy === "all" || (f.strategy === "none" ? t.strategy_id === null : t.strategy_id === f.strategy)) &&
      (f.mood === "all" || t.mood === f.mood) &&
      (f.outcome === "all" || t.outcome === f.outcome) &&
      (f.plan === "all" || (f.plan === "in" ? t.in_plan : !t.in_plan)),
  );
}

export function ReviewView({ data }: { data: ReviewData }) {
  const [filters, setFilters] = useState<Filters>(ALL);
  const trades = useMemo(() => applyFilters(data.trades, filters), [data.trades, filters]);
  const active = Object.entries(filters).filter(([k, v]) => v !== ALL[k as keyof Filters]).length;

  const summary = useMemo(() => {
    const wins = trades.filter((t) => t.outcome === "win").length;
    const losses = trades.filter((t) => t.outcome === "loss").length;
    const ruleCounts = new Map<string, number>();
    for (const t of trades) for (const r of t.violation_types) ruleCounts.set(r, (ruleCounts.get(r) ?? 0) + 1);
    const topRule = [...ruleCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
    const sortedByR = [...trades].sort((a, b) => b.r_multiple - a.r_multiple);
    return {
      n: trades.length,
      net: round(trades.reduce((a, t) => a + t.pnl, 0), 2),
      r: round(trades.reduce((a, t) => a + t.r_multiple, 0), 2),
      winRate: wins + losses ? wins / (wins + losses) : null,
      inPlan: trades.length ? trades.filter((t) => t.in_plan).length / trades.length : null,
      broken: trades.filter((t) => t.violation_types.length > 0).length,
      topRule,
      best: sortedByR[0] ?? null,
      worst: sortedByR.length > 1 ? sortedByR.at(-1)! : null,
    };
  }, [trades]);

  const prev = addDays(data.weekStart, -7);
  const next = addDays(data.weekStart, 7);
  const isFuture = next > data.today;
  const followed = data.sessions.filter((s) => s.followed_plan === true).length;
  const answered = data.sessions.filter((s) => s.followed_plan !== null).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revisión semanal"
        description={`Del ${dayTitle(data.weekStart)} al ${dayTitle(data.weekEnd)}. Diez minutos los domingos valen más que diez operaciones.`}
        actions={
          <div className="flex items-center rounded-lg border">
            <Button variant="ghost" size="icon-sm" asChild aria-label="Semana anterior">
              <Link href={`/revision?semana=${prev}`}>
                <ChevronLeftIcon />
              </Link>
            </Button>
            <span className="px-2 text-sm font-medium">Semana del {dayTitle(data.weekStart)}</span>
            {isFuture ? (
              <Button variant="ghost" size="icon-sm" disabled aria-label="Semana siguiente">
                <ChevronRightIcon />
              </Button>
            ) : (
              <Button variant="ghost" size="icon-sm" asChild aria-label="Semana siguiente">
                <Link href={`/revision?semana=${next}`}>
                  <ChevronRightIcon />
                </Link>
              </Button>
            )}
          </div>
        }
      />

      {/* Filtros por tipo de operativa */}
      <Panel
        title="Filtrar operativas"
        description="Mira solo un tipo: por índice, a favor o contra el spike, estrategia, estado mental o resultado."
        actions={
          active > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setFilters(ALL)}>
              Quitar filtros ({active})
            </Button>
          )
        }
        bodyClassName="space-y-3"
      >
        {data.accounts.length > 1 && (
          <FilterRow label="Cuenta">
            <Chip on={filters.account === "all"} onClick={() => setFilters({ ...filters, account: "all" })}>Todas</Chip>
            {data.accounts.map((a) => (
              <Chip key={a.id} on={filters.account === a.id} onClick={() => setFilters({ ...filters, account: a.id })}>
                {a.label}
              </Chip>
            ))}
          </FilterRow>
        )}
        <FilterRow label="Índice">
          <Chip on={filters.instrument === "all"} onClick={() => setFilters({ ...filters, instrument: "all" })}>Todos</Chip>
          {INSTRUMENTS.filter((i) => data.trades.some((t) => t.instrument === i.code)).map((i) => (
            <Chip key={i.code} on={filters.instrument === i.code} onClick={() => setFilters({ ...filters, instrument: i.code })}>
              {i.label}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Spike">
          {(["all", "with", "against"] as const).map((s) => (
            <Chip key={s} on={filters.spike === s} onClick={() => setFilters({ ...filters, spike: s })}>
              {s === "all" ? "Todas" : s === "with" ? "A favor" : "Contra"}
            </Chip>
          ))}
        </FilterRow>
        {data.strategies.length > 0 && (
          <FilterRow label="Estrategia">
            <Chip on={filters.strategy === "all"} onClick={() => setFilters({ ...filters, strategy: "all" })}>Todas</Chip>
            {data.strategies.map((s) => (
              <Chip key={s.id} on={filters.strategy === s.id} onClick={() => setFilters({ ...filters, strategy: s.id })}>
                {s.name}
              </Chip>
            ))}
            <Chip on={filters.strategy === "none"} onClick={() => setFilters({ ...filters, strategy: "none" })}>Sin estrategia</Chip>
          </FilterRow>
        )}
        <FilterRow label="Estado">
          <Chip on={filters.mood === "all"} onClick={() => setFilters({ ...filters, mood: "all" })}>Todos</Chip>
          {MOODS.map((m) => (
            <Chip key={m} on={filters.mood === m} onClick={() => setFilters({ ...filters, mood: m })}>
              {MOOD_LABEL[m]}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Resultado">
          {(["all", "win", "loss", "tie"] as const).map((o) => (
            <Chip key={o} on={filters.outcome === o} onClick={() => setFilters({ ...filters, outcome: o })}>
              {o === "all" ? "Todos" : OUTCOME_LABEL[o]}
            </Chip>
          ))}
        </FilterRow>
        <FilterRow label="Plan">
          {(["all", "in", "out"] as const).map((p) => (
            <Chip key={p} on={filters.plan === p} onClick={() => setFilters({ ...filters, plan: p })}>
              {p === "all" ? "Todas" : p === "in" ? "Dentro del plan" : "Fuera del plan"}
            </Chip>
          ))}
        </FilterRow>
      </Panel>

      {/* Números de la semana (con filtros) */}
      <section aria-label="Resumen de la semana" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-5">
        <Stat label="Operaciones" value={String(summary.n)} sub={active ? "con los filtros" : "en la semana"} />
        <Stat label="Neto" value={summary.n ? signedMoney(summary.net) : "—"} tone={summary.net} />
        <Stat label="R acumulada" value={summary.n ? rValue(summary.r) : "—"} tone={summary.r} sub={`Win rate ${percent(summary.winRate)}`} />
        <Stat label="Dentro del plan" value={percent(summary.inPlan)} sub={`${summary.broken} rompieron reglas`} />
        <Stat
          label="Seguiste tu plan"
          value={answered ? `${followed}/${answered}` : "—"}
          sub="días, según tu cierre de sesión"
          className="col-span-2 lg:col-span-1"
        />
      </section>

      {summary.n === 0 ? (
        <Panel>
          <p className="text-sm text-muted-foreground">
            {data.trades.length === 0 ? "No registraste operaciones en esta semana." : "Ninguna operación cumple estos filtros."}
          </p>
        </Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <TradeHighlight title="Tu mejor operación" trade={summary.best} icon="up" />
          <TradeHighlight title="Tu peor operación" trade={summary.worst} icon="down" />
          <Panel title="La regla que más rompiste">
            {summary.topRule ? (
              <div className="flex items-start gap-3">
                <TriangleAlertIcon className="mt-0.5 size-5 shrink-0 text-warn" />
                <div>
                  <p className="font-medium">{RULE_META[summary.topRule[0] as RuleType]?.title ?? summary.topRule[0]}</p>
                  <p className="text-sm text-muted-foreground">
                    {summary.topRule[1]} {summary.topRule[1] === 1 ? "vez" : "veces"} esta semana. Es la primera que tienes que cuidar.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Ninguna. Respetaste todas tus reglas en estas operaciones.</p>
            )}
          </Panel>
        </div>
      )}

      {summary.n > 0 && (
        <Panel title="Operaciones de la semana" bodyClassName="px-0 pb-0 sm:px-0 sm:pb-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-y bg-muted/30 text-left text-xs text-subtle">
                  <th className="px-5 py-2.5 font-normal">Fecha</th>
                  <th className="px-2 py-2.5 font-normal">Índice</th>
                  <th className="px-2 py-2.5 font-normal">Dirección</th>
                  <th className="px-2 py-2.5 font-normal">Spike</th>
                  <th className="px-2 py-2.5 font-normal">Estado</th>
                  <th className="px-2 py-2.5 text-right font-normal">R</th>
                  <th className="px-5 py-2.5 font-normal">Reglas</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id} className="border-b last:border-b-0 hover:bg-muted/40">
                    <td className="num px-5 py-3 whitespace-nowrap text-muted-foreground">
                      <Link href={`/journal/${t.id}`} className="hover:text-foreground">
                        {dateTimeShort(t.opened_at)}
                      </Link>
                    </td>
                    <td className="px-2 py-3">{instrumentLabel(t.instrument)}</td>
                    <td className="px-2 py-3 text-muted-foreground">{DIRECTION_LABEL[t.direction]}</td>
                    <td className={cn("px-2 py-3", t.with_spike ? "text-muted-foreground" : "text-warn")}>{t.with_spike ? "A favor" : "Contra"}</td>
                    <td className="px-2 py-3 text-muted-foreground">{t.mood ? MOOD_LABEL[t.mood] : "—"}</td>
                    <td className={cn("num px-2 py-3 text-right font-medium", t.r_multiple > 0 ? "text-gain" : t.r_multiple < 0 ? "text-loss" : "")}>
                      {rValue(t.r_multiple)}
                    </td>
                    <td className="px-5 py-3 text-xs text-warn">
                      {t.violation_types.map((r) => RULE_META[r as RuleType]?.title ?? r).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <ReviewAnswer weekStart={data.weekStart} initial={data.review?.answer ?? ""} />
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="w-24 shrink-0 text-sm text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Choice selected={on} onClick={onClick} className="min-h-8 px-2.5 text-[13px]">
      {children}
    </Choice>
  );
}

function Stat({ label, value, sub, tone, className }: { label: string; value: string; sub?: string; tone?: number; className?: string }) {
  return (
    <div className={cn("bg-card px-5 py-4", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("num mt-1 text-2xl font-semibold", tone === undefined || tone === 0 ? "" : tone > 0 ? "text-gain" : "text-loss")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-subtle">{sub}</p>}
    </div>
  );
}

function TradeHighlight({ title, trade, icon }: { title: string; trade: ReviewTrade | null; icon: "up" | "down" }) {
  const Icon = icon === "up" ? ArrowUpIcon : ArrowDownIcon;
  return (
    <Panel title={title}>
      {!trade ? (
        <p className="text-sm text-muted-foreground">Hace falta más de una operación para comparar.</p>
      ) : (
        <Link href={`/journal/${trade.id}`} className="block rounded-lg border p-3 hover:bg-muted/40">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-medium">
              <Icon className={cn("size-4", icon === "up" ? "text-gain" : "text-loss")} />
              {instrumentLabel(trade.instrument)} · {DIRECTION_LABEL[trade.direction]}
            </span>
            <span className={cn("num font-semibold", trade.r_multiple >= 0 ? "text-gain" : "text-loss")}>{rValue(trade.r_multiple)}</span>
          </div>
          <p className="num mt-1 text-xs text-subtle">
            {dateTimeShort(trade.opened_at)} · {trade.with_spike ? "a favor" : "contra el spike"}
            {trade.mood && ` · ${MOOD_LABEL[trade.mood].toLowerCase()}`}
          </p>
          {trade.note && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{trade.note}</p>}
        </Link>
      )}
    </Panel>
  );
}

function ReviewAnswer({ weekStart, initial }: { weekStart: string; initial: string }) {
  const [answer, setAnswer] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <Panel
      title="¿Qué cambias esta semana?"
      description="Una cosa concreta. Lo que escribas te aparece en el check-in de cada día de la semana que viene."
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await saveWeeklyReview({ week_start: weekStart, answer });
            if (!res.ok) return void toast.error(res.error);
            setSaved(answer);
            toast.success("Revisión guardada");
          });
        }}
      >
        <Textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={4}
          placeholder="Ej.: después de una pérdida espero los 3 minutos completos y solo opero a favor del spike."
        />
        <div className="flex items-center justify-end gap-3">
          {saved && answer === saved && <span className="text-sm text-subtle">Guardada</span>}
          <Button type="submit" disabled={pending || !answer.trim() || answer === saved}>
            {pending ? "Guardando…" : saved ? "Actualizar" : "Guardar revisión"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
