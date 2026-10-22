"use client";

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveStrategy } from "@/app/actions/settings";
import { FieldError, FieldLabel } from "@/components/app/choice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { zodFieldErrors } from "@/lib/action-result";
import type { Strategy } from "@/lib/data";
import { strategySchema, type StrategyInput } from "@/lib/schemas";
import { SectionHeading } from "./section-heading";

const EMPTY: StrategyInput = { name: "", context_tf: "1H", entry_tf: "1M", notes: null, active: true, steps: [] };

export function StrategiesSection({ strategies }: { strategies: Strategy[] }) {
  const [editing, setEditing] = useState<StrategyInput | null>(null);

  return (
    <section id="estrategias" className="scroll-mt-32">
      <SectionHeading
        title="Estrategias"
        description="Las activas aparecen en el formulario de registro para etiquetar cada operación."
        action={
          !editing && (
            <Button variant="outline" onClick={() => setEditing(EMPTY)}>
              <PlusIcon />
              Nueva estrategia
            </Button>
          )
        }
      />

      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {strategies.map((s) =>
          editing?.id === s.id ? (
            <li key={s.id} className="p-5">
              <StrategyForm initial={editing} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className={s.active ? "truncate font-medium" : "truncate font-medium text-muted-foreground"}>{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  Contexto {s.context_tf} · entrada {s.entry_tf} · {s.steps.length} {s.steps.length === 1 ? "paso" : "pasos"}
                  {!s.active && " · archivada"}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditing({ ...s })}>
                Editar
              </Button>
            </li>
          ),
        )}
        {editing && !editing.id && (
          <li className="p-5">
            <StrategyForm initial={editing} onDone={() => setEditing(null)} />
          </li>
        )}
        {strategies.length === 0 && !editing && (
          <li className="px-5 py-5 text-sm text-muted-foreground">Crea una estrategia para etiquetar tus operaciones.</li>
        )}
      </ul>
    </section>
  );
}

function StrategyForm({ initial, onDone }: { initial: StrategyInput; onDone: () => void }) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  function submit() {
    const parsed = strategySchema.safeParse({ ...draft, notes: draft.notes?.trim() || null });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error.issues));
      return;
    }
    start(async () => {
      const res = await saveStrategy(parsed.data);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Estrategia guardada");
      onDone();
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
        <div>
          <FieldLabel>Nombre</FieldLabel>
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-10" />
          <FieldError message={errors.name} />
        </div>
        <div>
          <FieldLabel>Contexto</FieldLabel>
          <Input value={draft.context_tf} onChange={(e) => setDraft({ ...draft, context_tf: e.target.value })} className="num h-10 w-20" />
        </div>
        <div>
          <FieldLabel>Entrada</FieldLabel>
          <Input value={draft.entry_tf} onChange={(e) => setDraft({ ...draft, entry_tf: e.target.value })} className="num h-10 w-20" />
        </div>
      </div>
      <StepsEditor steps={draft.steps} onChange={(steps) => setDraft({ ...draft, steps })} error={errors.steps} />
      <div>
        <FieldLabel>Notas</FieldLabel>
        <Textarea value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={3} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={draft.active} onCheckedChange={(active) => setDraft({ ...draft, active })} />
          Activa
        </label>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Pasos de la estrategia, en orden. Son los que marcas en la ventana flotante antes de entrar. */
function StepsEditor({ steps, onChange, error }: { steps: string[]; onChange: (steps: string[]) => void; error?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || steps.length >= 12) return;
    onChange([...steps, v]);
    setDraft("");
  };
  const move = (i: number, d: -1 | 1) => {
    const next = [...steps];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div>
      <FieldLabel hint="Los marcas en la ventana flotante: zona clara, 5 velas…">Pasos</FieldLabel>
      {steps.length > 0 && (
        <ol className="mb-2 divide-y rounded-lg border">
          {steps.map((step, i) => (
            <li key={`${i}-${step}`} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="num w-5 text-subtle">{i + 1}.</span>
              <Input
                value={step}
                onChange={(e) => onChange(steps.map((x, k) => (k === i ? e.target.value : x)))}
                className="h-8 flex-1 border-transparent bg-transparent px-1 dark:bg-transparent"
                aria-label={`Paso ${i + 1}`}
              />
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">
                <ArrowUpIcon />
              </Button>
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label="Bajar">
                <ArrowDownIcon />
              </Button>
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => onChange(steps.filter((_, k) => k !== i))} aria-label="Quitar paso">
                <XIcon />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={steps.length ? "Otro paso" : "Ej.: Zona clara en 1H"}
          className="h-10"
          maxLength={80}
        />
        <Button type="button" variant="outline" onClick={add} disabled={!draft.trim() || steps.length >= 12}>
          <PlusIcon />
          Añadir
        </Button>
      </div>
      <FieldError message={error} />
    </div>
  );
}
