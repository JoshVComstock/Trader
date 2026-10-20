"use client";

import { PlusIcon } from "lucide-react";
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

const EMPTY: StrategyInput = { name: "", context_tf: "1H", entry_tf: "1M", notes: null, active: true };

export function StrategiesSection({ strategies }: { strategies: Strategy[] }) {
  const [editing, setEditing] = useState<StrategyInput | null>(null);

  return (
    <section id="estrategias" className="scroll-mt-20 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Estrategias</h2>
          <p className="text-sm text-muted-foreground">Las activas aparecen en el formulario de registro.</p>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(EMPTY)}>
            <PlusIcon />
            Nueva
          </Button>
        )}
      </div>

      <ul className="divide-y rounded-xl border bg-card">
        {strategies.map((s) =>
          editing?.id === s.id ? (
            <li key={s.id} className="p-4">
              <StrategyForm initial={editing} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className={s.active ? "truncate font-medium" : "truncate font-medium text-muted-foreground"}>{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  Contexto {s.context_tf} · entrada {s.entry_tf}
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
          <li className="p-4">
            <StrategyForm initial={editing} onDone={() => setEditing(null)} />
          </li>
        )}
        {strategies.length === 0 && !editing && (
          <li className="px-4 py-4 text-sm text-muted-foreground">Crea una estrategia para etiquetar tus operaciones.</li>
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
