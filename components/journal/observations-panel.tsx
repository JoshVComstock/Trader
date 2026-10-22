"use client";

import { MapPinIcon, PlusIcon, RepeatIcon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { bumpObservation, deleteObservation, saveObservation } from "@/app/actions/psych";
import { Choice, FieldError } from "@/components/app/choice";
import { InputGroup, Segmented } from "@/components/app/input-group";
import { Panel } from "@/components/app/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { zodFieldErrors } from "@/lib/action-result";
import type { Observation } from "@/lib/data";
import { INSTRUMENTS, instrumentLabel, type InstrumentCode } from "@/lib/domain/instruments";
import { dateTimeShort } from "@/lib/format";
import { observationSchema } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { useJournal } from "./journal-context";

type Kind = Observation["kind"];

const KIND_LABEL: Record<Kind, string> = { zona: "Zona", patron: "Patrón", nota: "Nota" };
const KINDS = (["zona", "patron", "nota"] as const).map((k) => ({ value: k, label: KIND_LABEL[k] }));

const KIND_HINT: Record<Kind, string> = {
  zona: "Ej.: el precio reaccionó tres veces en este nivel en 1H.",
  patron: "Ej.: después de dos spikes seguidos, el tercero casi nunca llega a la zona.",
  nota: "Cualquier cosa que quieras llevarte a la cuenta real.",
};

interface Draft {
  kind: Kind;
  instrument: InstrumentCode | "";
  level: string;
  timeframe: string;
  note: string;
}

const EMPTY: Draft = { kind: "zona", instrument: "", level: "", timeframe: "1H", note: "" };

/**
 * Lo que vas notando en el backtesting. Cada vez que vuelves a ver lo mismo, "Se repitió" lo suma.
 * Las zonas aparecen luego en el formulario de registro al elegir ese índice, también en real.
 */
export function ObservationsPanel({ accountId }: { accountId: string }) {
  const { data } = useJournal();
  const [items, setItems] = useState(data.observations);
  const [adding, setAdding] = useState(items.length === 0);
  const [filter, setFilter] = useState<InstrumentCode | "all">("all");
  const used = INSTRUMENTS.filter((i) => items.some((o) => o.instrument === i.code));
  const visible = filter === "all" ? items : items.filter((o) => o.instrument === filter);

  return (
    <Panel
      id="observaciones"
      title="Observaciones"
      description="Zonas donde el precio reaccionó y patrones que se repiten. Lo que se repite es lo que vale la pena llevar a real."
      actions={
        !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <PlusIcon />
            Anotar
          </Button>
        )
      }
      bodyClassName="space-y-4"
    >
      {adding && (
        <ObservationForm
          accountId={accountId}
          onCancel={items.length ? () => setAdding(false) : undefined}
          onSaved={(o) => {
            setItems((list) => [o, ...list]);
            setAdding(false);
          }}
        />
      )}

      {used.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filtrar por índice">
          <Choice selected={filter === "all"} className="min-h-8" onClick={() => setFilter("all")}>
            Todos
          </Choice>
          {used.map((i) => (
            <Choice key={i.code} selected={filter === i.code} className="min-h-8" onClick={() => setFilter(i.code)}>
              {i.label}
            </Choice>
          ))}
        </div>
      )}

      {visible.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">
          Mientras haces backtesting, anota las zonas donde el precio reacciona. Cuando una se repita, súmala con “Se repitió”.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((o) => (
            <ObservationCard
              key={o.id}
              item={o}
              onChange={(next) => setItems((list) => list.map((x) => (x.id === next.id ? next : x)))}
              onRemove={() => setItems((list) => list.filter((x) => x.id !== o.id))}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ObservationCard({
  item,
  onChange,
  onRemove,
}: {
  item: Observation;
  onChange: (o: Observation) => void;
  onRemove: () => void;
}) {
  const [pending, start] = useTransition();
  const repeated = item.times_seen >= 3;
  return (
    <li className={cn("flex flex-col rounded-lg border p-4", repeated && "border-brand/40 bg-brand/5")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{KIND_LABEL[item.kind]}</span>
          {item.instrument && <span className="rounded bg-muted px-1.5 py-0.5">{instrumentLabel(item.instrument)}</span>}
          {item.timeframe && <span className="num text-subtle">{item.timeframe}</span>}
        </div>
        <span className={cn("num shrink-0 text-sm font-semibold", repeated ? "text-brand" : "text-muted-foreground")}>
          ×{item.times_seen}
        </span>
      </div>
      {item.level !== null && (
        <p className="num mt-2 flex items-center gap-1.5 text-lg font-semibold">
          <MapPinIcon className="size-4 text-brand" />
          {item.level}
        </p>
      )}
      <p className="mt-1.5 flex-1 text-sm whitespace-pre-wrap">{item.note}</p>
      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
        <span className="text-xs text-subtle">Última vez {dateTimeShort(item.last_seen_at)}</span>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await bumpObservation(item.id);
                if (!res.ok) return void toast.error(res.error);
                onChange({ ...item, times_seen: res.data.times, last_seen_at: new Date().toISOString() });
              })
            }
          >
            <RepeatIcon />
            Se repitió
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Borrar observación"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await deleteObservation(item.id);
                if (!res.ok) return void toast.error(res.error);
                onRemove();
              })
            }
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>
    </li>
  );
}

function ObservationForm({
  accountId,
  onCancel,
  onSaved,
}: {
  accountId: string;
  onCancel?: () => void;
  onSaved: (o: Observation) => void;
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  function submit() {
    const level = draft.level.trim() ? Number(draft.level.replace(",", ".")) : null;
    const parsed = observationSchema.safeParse({
      account_id: accountId,
      instrument: draft.instrument || null,
      kind: draft.kind,
      level,
      timeframe: draft.timeframe.trim() || null,
      note: draft.note,
    });
    if (!parsed.success) return setErrors(zodFieldErrors(parsed.error.issues));
    setErrors({});
    start(async () => {
      const res = await saveObservation(parsed.data);
      if (!res.ok) return void toast.error(res.error);
      onSaved({
        id: res.data.id,
        account_id: accountId,
        instrument: parsed.data.instrument,
        kind: parsed.data.kind,
        level: parsed.data.level,
        timeframe: parsed.data.timeframe,
        note: parsed.data.note,
        times_seen: 1,
        last_seen_at: new Date().toISOString(),
      });
      setDraft(EMPTY);
      toast.success("Observación guardada");
    });
  }

  return (
    <form
      className="space-y-4 rounded-lg border border-brand/30 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <span className="block text-sm text-muted-foreground">Tipo</span>
          <Segmented aria-label="Tipo" value={draft.kind} options={KINDS} onChange={(kind) => setDraft({ ...draft, kind })} />
        </div>
        <label className="w-36 space-y-1.5">
          <span className="block text-sm text-muted-foreground">Nivel de precio</span>
          <InputGroup
            value={draft.level}
            onChange={(e) => setDraft({ ...draft, level: e.target.value })}
            inputMode="decimal"
            placeholder="Opcional"
            aria-invalid={Boolean(errors.level)}
          />
          <FieldError message={errors.level} />
        </label>
        <label className="w-24 space-y-1.5">
          <span className="block text-sm text-muted-foreground">Temporalidad</span>
          <Input value={draft.timeframe} onChange={(e) => setDraft({ ...draft, timeframe: e.target.value })} className="num h-10" />
        </label>
      </div>

      <div className="space-y-1.5">
        <span className="block text-sm text-muted-foreground">Índice</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Índice">
          {INSTRUMENTS.map((i) => (
            <Choice
              key={i.code}
              selected={draft.instrument === i.code}
              className="min-h-8 text-[13px]"
              onClick={() => setDraft({ ...draft, instrument: draft.instrument === i.code ? "" : i.code })}
            >
              {i.label}
            </Choice>
          ))}
        </div>
      </div>

      <label className="block space-y-1.5">
        <span className="block text-sm text-muted-foreground">Qué viste</span>
        <Textarea
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          rows={2}
          placeholder={KIND_HINT[draft.kind]}
          aria-invalid={Boolean(errors.note)}
        />
        <FieldError message={errors.note} />
      </label>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar observación"}
        </Button>
      </div>
    </form>
  );
}
