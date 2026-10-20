"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "cn";
import { ChevronDownIcon, ImagePlusIcon, TriangleAlertIcon, OctagonXIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Choice, FieldError, FieldLabel } from "@/components/app/choice";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { defaultPnl, isWithSpike } from "@/lib/calc/trade";
import { CHECKLIST_GROUPS, type Checklist } from "@/lib/domain/checklist";
import { INSTRUMENTS } from "@/lib/domain/instruments";
import { DIRECTION_LABEL, MOOD_LABEL, MOODS, OUTCOME_LABEL, type JournalMode, type Outcome } from "@/lib/domain/types";
import type { Strategy } from "@/lib/data";
import { money } from "@/lib/format";
import { imageFromClipboard } from "@/lib/image";
import { fromLocalInput } from "@/lib/local-input";
import { evaluateTrade, type EngineTrade, type Rule } from "@/lib/rules";
import { tradeInputSchema, type TradeInput } from "@/lib/schemas";
import { localDate } from "@/lib/time-core";

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
}

function parseNumber(value: string): number | null {
  const v = value.trim().replace(/\s/g, "").replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Formulario (strings) → payload. El mismo esquema Zod del servidor valida el resultado. */
export function toPayload(v: TradeFormValues): unknown {
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
    pnl: parseNumber(v.pnl),
    opened_at: v.opened_at ? fromLocalInput(v.opened_at) : null,
    closed_at: v.closed_at ? fromLocalInput(v.closed_at) : null,
    note: v.note.trim() || null,
    checklist: v.checklist,
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
  sessionTrades: (date: string | null) => { trades: EngineTrade[]; openedAt: string | null };
  sessionOpenedAt: string | null;
  showShortcuts: boolean;
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
  const [file, setFile] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(editing || mode === "backtest");
  const errors = formState.errors;

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la URL depende del archivo y se libera al cambiar
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const stakeNumber = parseNumber(values.stake ?? "") ?? Number.NaN;
  const tpNumber = parseNumber(values.tp ?? "");
  const withSpike =
    values.instrument && values.direction ? isWithSpike(values.instrument, values.direction) : null;

  // Aviso previo: el mismo motor que corre en el servidor.
  const preview_ = useMemo(() => {
    if (editing || !values.result || !(stakeNumber > 0)) return null;
    const openedAt = values.opened_at ? fromLocalInput(values.opened_at) : new Date().toISOString();
    if (!openedAt) return null;
    const ctx = sessionTrades(mode === "backtest" ? localDate(openedAt) : null);
    const pnlOverride = parseNumber(values.pnl ?? "");
    const pnl =
      pnlOverride !== null && Number.isFinite(pnlOverride)
        ? pnlOverride
        : defaultPnl(values.result, stakeNumber, tpNumber !== null && Number.isFinite(tpNumber) ? tpNumber : null);
    const openedRef = mode === "backtest" ? (ctx.openedAt && ctx.openedAt < openedAt ? ctx.openedAt : openedAt) : sessionOpenedAt;
    if (!openedRef) return null;
    return evaluateTrade({
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
  }, [editing, values, stakeNumber, tpNumber, mode, sessionTrades, sessionOpenedAt, balance, rules]);

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
        setDetailsOpen(true);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [editing]);

  const activeStrategies = strategies.filter((s) => s.active || s.id === initial.strategy_id);
  const tpHint = Number.isFinite(stakeNumber) && stakeNumber > 0 && tpNumber && Number.isFinite(tpNumber)
    ? `${(tpNumber / stakeNumber).toFixed(1).replace(".", ",")}R`
    : undefined;

  return (
    <form
      onSubmit={submit}
      className="flex min-h-0 flex-1 flex-col"
      noValidate
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pt-1 pb-4">
        {/* 1 · Resultado */}
        <div>
          <FieldLabel hint={showShortcuts ? "G · P · E" : undefined}>Resultado</FieldLabel>
          <Controller
            control={control}
            name="result"
            render={({ field }) => (
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Resultado">
                {(["win", "loss", "tie"] as const).map((o) => (
                  <Choice
                    key={o}
                    selected={field.value === o}
                    tone={RESULT_TONE[o]}
                    className="h-14 text-base"
                    onClick={() => field.onChange(o)}
                  >
                    {OUTCOME_LABEL[o]}
                    {showShortcuts && <kbd className="num text-[10px] opacity-50">{RESULT_KEY[o]}</kbd>}
                  </Choice>
                ))}
              </div>
            )}
          />
          <FieldError message={errors.result?.message ? "Elige el resultado" : undefined} />
        </div>

        {/* 2 · Instrumento */}
        <div>
          <FieldLabel>Índice</FieldLabel>
          <Controller
            control={control}
            name="instrument"
            render={({ field }) => (
              <div className="space-y-2" role="group" aria-label="Índice">
                {(["boom", "crash"] as const).map((family) => (
                  <div key={family} className="grid grid-cols-[4.25rem_repeat(5,minmax(0,1fr))] items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">{family === "boom" ? "Boom" : "Crash"}</span>
                    {INSTRUMENTS.filter((i) => i.family === family).map((i) => (
                      <Choice
                        key={i.code}
                        selected={field.value === i.code}
                        className="num min-h-9 px-0 text-[13px]"
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
          <FieldError message={errors.instrument?.message} />
        </div>

        {/* 3 · Dirección */}
        <div>
          <FieldLabel
            hint={
              withSpike === null ? undefined : (
                <span className={withSpike ? "text-muted-foreground" : "text-warn"}>
                  {withSpike ? "A favor del spike" : "Contra el spike"}
                </span>
              )
            }
          >
            Dirección
          </FieldLabel>
          <Controller
            control={control}
            name="direction"
            render={({ field }) => (
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Dirección">
                {(["buy", "sell"] as const).map((d) => (
                  <Choice key={d} selected={field.value === d} className="h-11" onClick={() => field.onChange(d)}>
                    {DIRECTION_LABEL[d]}
                  </Choice>
                ))}
              </div>
            )}
          />
        </div>

        {/* 4 · Stake */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel hint={balance > 0 && stakeNumber > 0 ? `${((stakeNumber / balance) * 100).toFixed(1).replace(".", ",")} % de ${money(balance, currency, 0)}` : undefined}>
              Stake (riesgo)
            </FieldLabel>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input
                {...register("stake")}
                inputMode="decimal"
                autoComplete="off"
                className="num h-11 pl-7 text-base"
                aria-invalid={Boolean(errors.stake)}
              />
            </div>
            <FieldError message={errors.stake?.message} />
          </div>

          {/* 6 · Cómo te sentías */}
          <div>
            <FieldLabel>Cómo te sentías</FieldLabel>
            <Controller
              control={control}
              name="mood"
              render={({ field }) => (
                <div className="grid grid-cols-3 gap-1" role="group" aria-label="Cómo te sentías">
                  {MOODS.map((m) => (
                    <Choice
                      key={m}
                      selected={field.value === m}
                      className="h-11 px-0 text-xs"
                      onClick={() => {
                        field.onChange(m);
                        setValue("checklist.calm", m === "tranquilo");
                      }}
                    >
                      {MOOD_LABEL[m]}
                    </Choice>
                  ))}
                </div>
              )}
            />
          </div>
        </div>

        {/* 5 · Estrategia */}
        {activeStrategies.length > 0 && (
          <div>
            <FieldLabel>Estrategia</FieldLabel>
            <Controller
              control={control}
              name="strategy_id"
              render={({ field }) => (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Estrategia">
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
          <div>
            <FieldLabel hint="Hora de La Paz">Fecha y hora de entrada</FieldLabel>
            <Input type="datetime-local" {...register("opened_at")} className="num h-11" aria-invalid={Boolean(errors.opened_at)} />
            <FieldError message={errors.opened_at?.message} />
          </div>
        )}

        {/* Checklist */}
        <div className="space-y-3">
          {CHECKLIST_GROUPS.map((group) => (
            <div key={group.title}>
              <FieldLabel>{group.title}</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {group.items.map((item) => (
                  <Controller
                    key={item.key}
                    control={control}
                    name={`checklist.${item.key}`}
                    render={({ field }) => (
                      <Choice
                        selected={field.value}
                        tone={item.key === "impulse" && field.value ? "loss" : "brand"}
                        className="min-h-9 text-[13px]"
                        title={item.hint}
                        onClick={() => field.onChange(!field.value)}
                      >
                        {item.label}
                      </Choice>
                    )}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Más detalle */}
        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg py-2 text-sm text-muted-foreground hover:text-foreground">
            Más detalle
            <ChevronDownIcon className={cn("size-4 transition-transform", detailsOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel hint={tpHint}>TP</FieldLabel>
                <Input {...register("tp")} inputMode="decimal" className="num h-10" aria-invalid={Boolean(errors.tp)} />
                <FieldError message={errors.tp?.message} />
              </div>
              <div>
                <FieldLabel hint="Opcional">P/L real</FieldLabel>
                <Input {...register("pnl")} inputMode="decimal" placeholder="Según SL/TP" className="num h-10" aria-invalid={Boolean(errors.pnl)} />
                <FieldError message={errors.pnl?.message} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {mode === "live" && (
                <div>
                  <FieldLabel>Apertura</FieldLabel>
                  <Input type="datetime-local" {...register("opened_at")} className="num h-10 text-xs" />
                  <FieldError message={errors.opened_at?.message} />
                </div>
              )}
              <div className={mode === "backtest" ? "col-span-2" : undefined}>
                <FieldLabel>Cierre</FieldLabel>
                <Input type="datetime-local" {...register("closed_at")} className="num h-10 text-xs" />
                <FieldError message={errors.closed_at?.message} />
              </div>
            </div>
            <div>
              <FieldLabel>Nota</FieldLabel>
              <Textarea {...register("note")} rows={3} placeholder="Qué viste, qué sentiste, qué harías distinto" />
            </div>
            {!editing && (
              <div>
                <FieldLabel hint="También puedes pegar con Ctrl+V">Captura</FieldLabel>
                <ShotPicker file={file} preview={preview} onFile={setFile} />
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Aviso previo + guardar */}
      <div className="space-y-3 border-t bg-popover px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {preview_ && (preview_.violations.length > 0 || preview_.limits.length > 0) && (
          <ul className="space-y-1.5 text-xs">
            {preview_.violations.map((v) => (
              <li key={v.ruleType} className={cn("flex gap-2", v.action === "block" ? "text-loss" : "text-warn")}>
                {v.action === "block" ? <OctagonXIcon className="mt-px size-3.5 shrink-0" /> : <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />}
                <span>{v.message}{v.action === "block" && " Al guardar, la sesión se bloquea."}</span>
              </li>
            ))}
            {preview_.limits.map((l) => (
              <li key={l.ruleType} className="flex gap-2 text-warn">
                <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
                <span>{l.action === "block" ? "Esta es la última: " : ""}{l.message}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="h-12" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" className="h-12 flex-1 text-base">
            {editing ? "Guardar cambios" : "Guardar"}
            {showShortcuts && <kbd className="num ml-1 text-[10px] opacity-60">Enter</kbd>}
          </Button>
        </div>
      </div>
    </form>
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
