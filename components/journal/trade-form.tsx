"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronDownIcon, ImagePlusIcon, MapPinIcon, OctagonXIcon, SirenIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Choice, FieldError } from "@/components/app/choice";
import { InputGroup, Segmented } from "@/components/app/input-group";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { defaultPnl, isWithSpike } from "@/lib/calc/trade";
import { CHECKLIST_GROUPS, type Checklist } from "@/lib/domain/checklist";
import { INSTRUMENTS } from "@/lib/domain/instruments";
import { DIRECTION_LABEL, MOOD_LABEL, MOODS, OUTCOME_LABEL, type JournalMode, type Outcome } from "@/lib/domain/types";
import type { Observation, Session, Strategy } from "@/lib/data";
import { ANXIETY_LABEL, ANXIETY_LEVELS, defaultPsychFlags, type PsychFlags } from "@/lib/domain/psych";
import { detectTilt } from "@/lib/psych";
import { money, timeShort } from "@/lib/format";
import { imageFromClipboard } from "@/lib/image";
import { fromLocalInput } from "@/lib/local-input";
import { evaluateTrade, type EngineTrade, type Rule } from "@/lib/rules";
import { tradeInputSchema, type TradeInput } from "@/lib/schemas";
import { localDate } from "@/lib/time-core";
import { ResultExplainer, RHelp } from "./r-help";
import { SessionTimerChip, useSessionClock } from "./session-timer";

export interface TradeFormValues {
  id: string;
  account_id: string;
  result: Outcome | "";
  instrument: string;
  direction: "buy" | "sell";
  stake: string;
  strategy_id: string;
  mood: "tranquilo" | "acelerado" | "cansado";
  tp: string;
  pnl: string;
  opened_at: string;
  closed_at: string;
  note: string;
  checklist: Checklist;
  /** "" o "1"…"5". */
  anxiety: string;
  /** Monto de entrada con multiplicador. */
  entry_amount: string;
  multiplier: string;
}

function parseNumber(value: string): number | null {
  const v = value.trim().replace(/\s/g, "").replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

/**
 * En el formulario el monto ganado o perdido se escribe sin signo ("¿cuánto ganaste?": 3.20);
 * el resultado elegido le pone el signo.
 */
export function signedAmount(result: Outcome | "" | undefined, raw: string): number | null {
  const n = parseNumber(raw);
  if (n === null) return null;
  if (!Number.isFinite(n)) return Number.NaN;
  if (result === "win") return Math.abs(n);
  if (result === "loss") return -Math.abs(n);
  if (result === "tie") return 0;
  return n;
}

/** Formulario (strings) → payload. El mismo esquema Zod del servidor valida el resultado. */
export function toPayload(v: TradeFormValues): unknown {
  const multiplier = parseNumber(v.multiplier ?? "");
  return {
    id: v.id,
    account_id: v.account_id,
    result: v.result === "" ? undefined : v.result,
    instrument: v.instrument,
    direction: v.direction,
    stake: parseNumber(v.stake) ?? Number.NaN,
    strategy_id: v.strategy_id || null,
    mood: v.mood,
    tp: parseNumber(v.tp),
    pnl: v.result === "tie" ? 0 : signedAmount(v.result, v.pnl),
    opened_at: v.opened_at ? fromLocalInput(v.opened_at) : null,
    closed_at: v.closed_at ? fromLocalInput(v.closed_at) : null,
    note: v.note.trim() || null,
    checklist: v.checklist,
    anxiety: v.anxiety ? Number(v.anxiety) : null,
    entry_amount: parseNumber(v.entry_amount ?? ""),
    multiplier: multiplier === null ? null : Math.round(multiplier),
  };
}

const formSchema = z
  .custom<TradeFormValues>()
  .transform((v) => toPayload(v))
  .pipe(tradeInputSchema);

const RESULT_TONE: Record<Outcome, "gain" | "loss" | "neutral"> = { win: "gain", loss: "loss", tie: "neutral" };
const RESULT_KEY: Record<Outcome, string> = { win: "G", loss: "P", tie: "E" };

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function TradeForm({
  mode,
  initial,
  editing,
  strategies,
  rules,
  balance,
  currency,
  sessionTrades,
  sessionOpenedAt,
  showShortcuts,
  session = null,
  psych = defaultPsychFlags(),
  observations = [],
  initialFile = null,
  onSubmit,
  onCancel,
}: {
  mode: JournalMode;
  initial: TradeFormValues;
  editing: boolean;
  strategies: Strategy[];
  rules: Rule[];
  balance: number;
  currency: string;
  /** Operaciones de la sesión para el aviso previo, por día (YYYY-MM-DD). */
  sessionTrades: (date: string | null) => { trades: (EngineTrade & { with_spike: boolean })[]; openedAt: string | null };
  sessionOpenedAt: string | null;
  showShortcuts: boolean;
  /** Sesión en vivo: el formulario muestra cuánto tiempo queda. */
  session?: Session | null;
  /** Funciones de control mental activas. */
  psych?: PsychFlags;
  /** Zonas y patrones anotados, para recordarlos al elegir el índice. */
  observations?: Observation[];
  /** Captura ya hecha (desde la ventana flotante) para adjuntar a esta operación. */
  initialFile?: Blob | null;
  onSubmit: (payload: TradeInput, file: Blob | null) => void;
  onCancel: () => void;
}) {
  // React Hook Form muta su estado interno: con React Compiler, los Controller se quedan un render atrás.
  "use no memo";
  const form = useForm<TradeFormValues, unknown, TradeInput>({
    resolver: zodResolver(formSchema),
    defaultValues: initial,
    mode: "onSubmit",
  });
  const { control, register, handleSubmit, setValue, formState } = form;
  const values = useWatch({ control });
  const [file, setFile] = useState<Blob | null>(initialFile);
  const [preview, setPreview] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(editing);
  const errors = formState.errors;
  const sessionClock = useSessionClock(session, rules);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la URL depende del archivo y se libera al cambiar
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const stakeNumber = parseNumber(values.stake ?? "") ?? Number.NaN;
  const tpNumber = parseNumber(values.tp ?? "");
  // P/L con signo según el resultado; null si todavía no se escribió.
  const typedPnl = values.result === "tie" ? 0 : signedAmount(values.result, values.pnl ?? "");
  const signedPnl =
    typedPnl !== null && Number.isFinite(typedPnl)
      ? typedPnl
      : values.result === "loss" && stakeNumber > 0
        ? -stakeNumber
        : values.result === "win" && tpNumber !== null && Number.isFinite(tpNumber)
          ? tpNumber
          : null;
  const withSpike =
    values.instrument && values.direction ? isWithSpike(values.instrument, values.direction) : null;

  // Aviso previo: el mismo motor que corre en el servidor.
  const preview_ = useMemo(() => {
    if (editing || !values.result || !(stakeNumber > 0)) return null;
    const openedAt = values.opened_at ? fromLocalInput(values.opened_at) : new Date().toISOString();
    if (!openedAt) return null;
    const ctx = sessionTrades(mode === "backtest" ? localDate(openedAt) : null);
    const pnl = signedPnl ?? defaultPnl(values.result, stakeNumber, tpNumber !== null && Number.isFinite(tpNumber) ? tpNumber : null);
    const openedRef = mode === "backtest" ? (ctx.openedAt && ctx.openedAt < openedAt ? ctx.openedAt : openedAt) : sessionOpenedAt;
    if (!openedRef) return null;
    const candidateSpike = values.instrument && values.direction ? isWithSpike(values.instrument, values.direction) : true;
    const tilt = psych.tilt_detector
      ? detectTilt({ opened_at: openedAt, stake: stakeNumber, pnl, with_spike: candidateSpike }, ctx.trades)
      : null;
    const engine = evaluateTrade({
      candidate: {
        opened_at: openedAt,
        closed_at: values.closed_at ? fromLocalInput(values.closed_at) : null,
        stake: stakeNumber,
        pnl,
        impulse: values.checklist?.impulse ?? false,
      },
      sessionTrades: ctx.trades,
      sessionOpenedAt: openedRef,
      balance,
      rules,
    });
    return { ...engine, tilt };
  }, [editing, values, stakeNumber, tpNumber, signedPnl, mode, sessionTrades, sessionOpenedAt, balance, rules, psych.tilt_detector]);

  const submit = handleSubmit((payload) => onSubmit(payload, file));
  const submitted = formState.isSubmitted;

  // Atajos en todo el diálogo, no solo con el foco dentro del formulario.
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing) return;
      if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        void submit();
        return;
      }
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, Outcome> = { g: "win", p: "loss", e: "tie" };
      const result = map[e.key.toLowerCase()];
      if (result) {
        e.preventDefault();
        setValue("result", result, { shouldValidate: submitted });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [submit, setValue, submitted]);

  // Ctrl+V con una imagen en el portapapeles: se adjunta como captura.
  useEffect(() => {
    if (editing) return;
    function onPaste(e: ClipboardEvent) {
      const img = imageFromClipboard(e);
      if (img) {
        e.preventDefault();
        setFile(img);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [editing]);

  const activeStrategies = strategies.filter((s) => s.active || s.id === initial.strategy_id);
  const tpHint =
    Number.isFinite(stakeNumber) && stakeNumber > 0 && tpNumber && Number.isFinite(tpNumber)
      ? `${(tpNumber / stakeNumber).toFixed(1)}R`
      : undefined;
  const riskHint =
    balance > 0 && stakeNumber > 0 ? `${((stakeNumber / balance) * 100).toFixed(1)}% de ${money(balance, currency, 0)}` : undefined;
  const tilt = preview_?.tilt && preview_.tilt.level !== "none" ? preview_.tilt : null;
  const warnings = preview_ ? preview_.violations.length + preview_.limits.length : 0;
  const instrumentNotes = observations.filter((o) => o.instrument === values.instrument).slice(0, 3);

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pt-2 pb-5 sm:px-6">
        {sessionClock && sessionClock.running && (
          <SessionTimerChip clock={sessionClock} className="w-full justify-center sm:w-auto" />
        )}

        {/* 1 · Resultado */}
        <FormSection step={1} title="Resultado" hint={showShortcuts ? "Teclas G · P · E" : undefined} error={errors.result ? "Elige el resultado" : undefined}>
          <Controller
            control={control}
            name="result"
            render={({ field }) => (
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Resultado">
                {(["win", "loss", "tie"] as const).map((o) => (
                  <Choice
                    key={o}
                    role="radio"
                    aria-checked={field.value === o}
                    selected={field.value === o}
                    tone={RESULT_TONE[o]}
                    className="h-14 text-base"
                    onClick={() => field.onChange(o)}
                  >
                    {OUTCOME_LABEL[o]}
                    {showShortcuts && <kbd className="num rounded border px-1 text-[10px] opacity-60">{RESULT_KEY[o]}</kbd>}
                  </Choice>
                ))}
              </div>
            )}
          />
        </FormSection>

        {/* 2 · Índice y dirección */}
        <FormSection
          step={2}
          title="Índice y dirección"
          hint={
            withSpike === null ? undefined : (
              <span className={cn("rounded px-1.5 py-0.5 font-medium", withSpike ? "bg-muted text-muted-foreground" : "bg-warn/15 text-warn")}>
                {withSpike ? "A favor del spike" : "Contra el spike"}
              </span>
            )
          }
          error={errors.instrument?.message}
        >
          <Controller
            control={control}
            name="instrument"
            render={({ field }) => (
              <div className="space-y-1.5" role="radiogroup" aria-label="Índice">
                {(["boom", "crash"] as const).map((family) => (
                  <div key={family} className="grid grid-cols-[4rem_repeat(5,minmax(0,1fr))] items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">{family === "boom" ? "Boom" : "Crash"}</span>
                    {INSTRUMENTS.filter((i) => i.family === family).map((i) => (
                      <Choice
                        key={i.code}
                        role="radio"
                        aria-checked={field.value === i.code}
                        selected={field.value === i.code}
                        className="num min-h-10 px-0 text-sm"
                        onClick={() => field.onChange(i.code)}
                        aria-label={i.label}
                      >
                        {i.spikeEvery}
                      </Choice>
                    ))}
                  </div>
                ))}
              </div>
            )}
          />
          {instrumentNotes.length > 0 && (
            <ul className="mt-2 space-y-1 rounded-lg bg-brand/5 px-3 py-2 text-xs text-muted-foreground">
              {instrumentNotes.map((o) => (
                <li key={o.id} className="flex gap-2">
                  <MapPinIcon className="mt-0.5 size-3.5 shrink-0 text-brand" />
                  <span>
                    {o.level !== null && <span className="num text-foreground">{o.level} </span>}
                    {o.note}
                    {o.times_seen > 1 && <span className="text-subtle"> · visto {o.times_seen} veces</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Controller
            control={control}
            name="direction"
            render={({ field }) => (
              <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Dirección">
                {(["buy", "sell"] as const).map((d) => (
                  <Choice key={d} role="radio" aria-checked={field.value === d} selected={field.value === d} className="h-11" onClick={() => field.onChange(d)}>
                    {DIRECTION_LABEL[d]}
                  </Choice>
                ))}
              </div>
            )}
          />
        </FormSection>

        {/* 3 · Riesgo, estado y estrategia */}
        {/* 3 · Montos (multiplicadores) */}
        <FormSection step={3} title="Montos" hint={<RHelp />}>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1.5">
              <span className="block text-sm text-muted-foreground">Inversión (entrada)</span>
              <InputGroup prefix="$" {...register("entry_amount")} inputMode="decimal" autoComplete="off" placeholder="10" className="h-11" aria-invalid={Boolean(errors.entry_amount)} />
              <FieldError message={errors.entry_amount?.message} />
            </label>
            <label className="block space-y-1.5">
              <span className="block text-sm text-muted-foreground">Multiplicador</span>
              <InputGroup prefix="×" {...register("multiplier")} inputMode="numeric" autoComplete="off" placeholder="Opcional" className="h-11" aria-invalid={Boolean(errors.multiplier)} />
              <FieldError message={errors.multiplier?.message} />
            </label>
            <label className="block space-y-1.5">
              <span className="block text-sm text-muted-foreground">Stop (lo que aceptas perder)</span>
              <InputGroup prefix="$" {...register("stake")} inputMode="decimal" autoComplete="off" className="h-11" aria-invalid={Boolean(errors.stake)} />
              {riskHint && <span className="num block text-xs text-subtle">{riskHint}</span>}
              <FieldError message={errors.stake?.message} />
            </label>
          </div>

          {values.result === "win" || values.result === "loss" ? (
            <label className="mt-4 block space-y-1.5">
              <span className="block text-sm font-medium">
                {values.result === "win" ? "¿Cuánto ganaste con el spike?" : "¿Cuánto perdiste?"}
              </span>
              <InputGroup
                prefix={values.result === "win" ? "+$" : "−$"}
                {...register("pnl")}
                inputMode="decimal"
                autoComplete="off"
                placeholder={values.result === "loss" && stakeNumber > 0 ? String(stakeNumber) : "0.00"}
                className={cn("h-12 text-lg", values.result === "win" ? "border-gain/50" : "border-loss/40")}
                inputClassName="text-lg"
                aria-invalid={Boolean(errors.pnl)}
              />
              <span className="block text-xs text-subtle">
                {values.result === "win"
                  ? "Escribe lo que te pagó el spike, aunque no haya llegado a ningún TP."
                  : "Si lo dejas vacío, cuenta tu stop completo."}
              </span>
              <FieldError message={errors.pnl?.message} />
            </label>
          ) : null}

          <ResultExplainer result={values.result ?? ""} pnl={signedPnl} stake={stakeNumber} currency={currency} />
        </FormSection>

        {/* 4 · Estado y estrategia */}
        <FormSection step={4} title="Estado y estrategia">
          <div className="space-y-1.5">
            <span className="block text-sm text-muted-foreground">Cómo te sentías</span>
            <Controller
              control={control}
              name="mood"
              render={({ field }) => (
                <Segmented
                  aria-label="Cómo te sentías"
                  value={field.value}
                  options={MOODS.map((m) => ({ value: m, label: MOOD_LABEL[m] }))}
                  onChange={(m) => {
                    field.onChange(m);
                    setValue("checklist.calm", m === "tranquilo");
                  }}
                  className="flex w-full [&>button]:h-10"
                />
              )}
            />
          </div>

          {psych.anxiety_scale && (
            <div className="mt-4 space-y-1.5">
              <span className="flex items-baseline justify-between gap-2 text-sm text-muted-foreground">
                Ansiedad / ganas de recuperar
                <span className="text-xs text-subtle">1 nada · 5 mucha</span>
              </span>
              <Controller
                control={control}
                name="anxiety"
                render={({ field }) => (
                  <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Ansiedad">
                    {ANXIETY_LEVELS.map((n) => (
                      <Choice
                        key={n}
                        role="radio"
                        aria-checked={field.value === String(n)}
                        selected={field.value === String(n)}
                        tone={n >= 4 ? "loss" : "brand"}
                        className="h-11 flex-col gap-0 px-0"
                        onClick={() => field.onChange(field.value === String(n) ? "" : String(n))}
                      >
                        <span className="num text-base leading-none">{n}</span>
                        <span className="text-[10px] font-normal opacity-70">{ANXIETY_LABEL[n]}</span>
                      </Choice>
                    ))}
                  </div>
                )}
              />
            </div>
          )}

          {activeStrategies.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <span className="block text-sm text-muted-foreground">Estrategia</span>
              <Controller
                control={control}
                name="strategy_id"
                render={({ field }) => (
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Estrategia">
                    {activeStrategies.map((s) => (
                      <Choice key={s.id} selected={field.value === s.id} onClick={() => field.onChange(s.id)}>
                        {s.name}
                      </Choice>
                    ))}
                    <Choice selected={field.value === ""} onClick={() => field.onChange("")}>
                      Ninguna
                    </Choice>
                  </div>
                )}
              />
            </div>
          )}

          {mode === "backtest" && (
            <label className="mt-4 block space-y-1.5">
              <span className="flex items-baseline justify-between text-sm text-muted-foreground">
                Fecha y hora de entrada
                <span className="text-xs text-subtle">Hora de La Paz</span>
              </span>
              <Input type="datetime-local" {...register("opened_at")} className="num h-11" aria-invalid={Boolean(errors.opened_at)} />
              <FieldError message={errors.opened_at?.message} />
            </label>
          )}
        </FormSection>

        {/* 5 · Checklist */}
        <FormSection step={5} title="Checklist" hint="Desmarca lo que no se cumplió">
          <div className="grid gap-3 sm:grid-cols-3">
            {CHECKLIST_GROUPS.map((group) => (
              <div key={group.title} className="rounded-lg border bg-muted/20 p-2">
                <p className="px-1.5 pt-0.5 pb-1.5 text-xs font-medium tracking-wide text-subtle uppercase">{group.title}</p>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <Controller
                      key={item.key}
                      control={control}
                      name={`checklist.${item.key}`}
                      render={({ field }) => (
                        <CheckRow
                          checked={field.value}
                          danger={item.key === "impulse"}
                          label={item.label}
                          hint={item.hint}
                          onToggle={() => field.onChange(!field.value)}
                        />
                      )}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </FormSection>

        {/* 6 · Captura y descripción: siempre a la vista, las dos opcionales */}
        <FormSection step={6} title="Captura y descripción" hint="Opcional">
          <div className={cn("grid gap-3", !editing && "sm:grid-cols-2")}>
            {!editing && (
              <div className="space-y-1.5">
                <span className="block text-sm text-muted-foreground">Foto de la operación</span>
                <ShotPicker file={file} preview={preview} onFile={setFile} />
              </div>
            )}
            <label className="block space-y-1.5">
              <span className="block text-sm text-muted-foreground">Descripción</span>
              <Textarea {...register("note")} rows={editing ? 3 : 5} placeholder="Qué viste, por qué entraste, qué harías distinto" />
            </label>
          </div>
        </FormSection>

        {/* Más detalle */}
        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen} className="rounded-lg border">
          <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/40">
            <span>
              Más detalle
              <span className="ml-2 font-normal text-subtle">TP y horas</span>
            </span>
            <ChevronDownIcon className={cn("size-4 transition-transform", detailsOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 border-t px-4 pt-4 pb-4">
            <label className="block max-w-56 space-y-1.5">
              <span className="flex items-baseline justify-between text-sm text-muted-foreground">
                TP (si pusiste uno) {tpHint && <span className="num text-xs text-subtle">{tpHint}</span>}
              </span>
              <InputGroup prefix="$" {...register("tp")} inputMode="decimal" placeholder="Opcional" aria-invalid={Boolean(errors.tp)} />
              <FieldError message={errors.tp?.message} />
            </label>

            <div className="grid grid-cols-2 gap-3">
              {mode === "live" && (
                <label className="block space-y-1.5">
                  <span className="block text-sm text-muted-foreground">Apertura</span>
                  <Input type="datetime-local" {...register("opened_at")} className="num h-10 text-sm" />
                  <span className="block text-xs text-subtle">
                    {sessionClock ? `Sesión abierta a las ${timeShort(sessionClock.openedAt)}. Vacío = ahora.` : "Vacío = ahora."}
                  </span>
                  <FieldError message={errors.opened_at?.message} />
                </label>
              )}
              <label className={cn("block space-y-1.5", mode === "backtest" && "col-span-2")}>
                <span className="block text-sm text-muted-foreground">Cierre</span>
                <Input type="datetime-local" {...register("closed_at")} className="num h-10 text-sm" />
                <FieldError message={errors.closed_at?.message} />
              </label>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Aviso previo + guardar */}
      <footer className="space-y-3 border-t bg-popover px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
        {tilt && (
          <div
            role="alert"
            className={cn(
              "flex gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium",
              tilt.level === "tilt" ? "bg-loss text-background" : "border border-loss/40 bg-loss/10 text-loss",
            )}
          >
            <SirenIcon className="mt-0.5 size-4 shrink-0" />
            <span>{tilt.message}</span>
          </div>
        )}
        {preview_ && warnings > 0 && (
          <ul className="space-y-1.5 rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-sm">
            {preview_.violations.map((v) => (
              <li key={v.ruleType} className={cn("flex gap-2", v.action === "block" ? "text-loss" : "text-warn")}>
                {v.action === "block" ? <OctagonXIcon className="mt-0.5 size-4 shrink-0" /> : <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />}
                <span>
                  {v.message}
                  {v.action === "block" && " Al guardar, la sesión se bloquea."}
                </span>
              </li>
            ))}
            {preview_.limits.map((l) => (
              <li key={l.ruleType} className="flex gap-2 text-warn">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                <span>
                  {l.action === "block" ? "Esta es la última: " : ""}
                  {l.message}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="h-12 px-4" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" className="h-12 flex-1 text-base">
            {editing ? "Guardar cambios" : "Guardar operación"}
            {showShortcuts && <kbd className="num ml-1 rounded border border-current/30 px-1 text-[10px] opacity-70">Enter</kbd>}
          </Button>
        </div>
      </footer>
    </form>
  );
}

/** Un bloque numerado del formulario. */
function FormSection({
  step,
  title,
  hint,
  error,
  children,
}: {
  step: number;
  title: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2.5 flex w-full items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="num flex size-5 items-center justify-center rounded-full bg-muted text-[11px] text-muted-foreground">{step}</span>
          {title}
        </span>
        {hint && <span className="text-xs text-subtle">{hint}</span>}
      </legend>
      {children}
      <FieldError message={error} />
    </fieldset>
  );
}

/** Casilla del checklist: fila entera tocable, con su caja de check. */
function CheckRow({
  checked,
  danger,
  label,
  hint,
  onToggle,
}: {
  checked: boolean;
  danger?: boolean;
  label: string;
  hint?: string;
  onToggle: () => void;
}) {
  const bad = danger && checked;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      title={hint}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-md px-1.5 py-1.5 text-left text-sm transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
        checked ? "text-foreground" : "text-muted-foreground",
        bad && "text-loss",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
          checked ? (bad ? "border-loss bg-loss text-background" : "border-brand bg-brand text-primary-foreground") : "border-input",
        )}
      >
        {checked && <CheckIcon className="size-3" strokeWidth={3} />}
      </span>
      <span className="leading-tight">
        {label}
        {hint && checked && <span className="block text-xs font-normal opacity-75">{hint}</span>}
      </span>
    </button>
  );
}

function ShotPicker({ file, preview, onFile }: { file: Blob | null; preview: string | null; onFile: (f: Blob | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  if (file && preview) {
    return (
      <div className="relative overflow-hidden rounded-lg border">
        {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:) */}
        <img src={preview} alt="Captura a subir" className="max-h-48 w-full object-contain" />
        <Button type="button" size="icon-sm" variant="secondary" className="absolute top-2 right-2" onClick={() => onFile(null)} aria-label="Quitar captura">
          <XIcon />
        </Button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f?.type.startsWith("image/")) onFile(f);
      }}
      className={cn(
        "flex h-20 w-full items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted",
        over && "border-brand bg-brand/10 text-foreground",
      )}
    >
      <ImagePlusIcon className="size-4" />
      Arrastra, pega o elige una imagen
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </button>
  );
}
