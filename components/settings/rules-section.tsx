"use client";

import { CheckIcon, LoaderIcon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveRule } from "@/app/actions/settings";
import { FieldError } from "@/components/app/choice";
import { InputGroup, Segmented } from "@/components/app/input-group";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { zodFieldErrors } from "@/lib/action-result";
import { RULE_META, RULE_TYPES, type Rule, type RuleAction, type RuleType } from "@/lib/rules";
import { ruleSchema } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

type Params = Record<string, string>;

interface Draft {
  enabled: boolean;
  action: RuleAction;
  params: Params;
}

function draftFor(type: RuleType, rules: Rule[]): Draft {
  const rule = rules.find((r) => r.type === type);
  const params = (rule?.params ?? RULE_META[type].defaults) as Record<string, number | string>;
  return {
    enabled: rule?.enabled ?? false,
    action: rule?.action ?? "warn",
    params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  };
}

const ACTIONS = [
  { value: "warn", label: "Avisa" },
  { value: "block", label: "Bloquea", tone: "loss" },
] as const;

export function RulesSection({ rules }: { rules: Rule[] }) {
  const active = rules.filter((r) => r.enabled).length;
  return (
    <section id="reglas" className="scroll-mt-32">
      <SectionHeading
        title="Reglas"
        description={
          <>
            <strong className="font-medium text-foreground">Bloquea</strong> cierra la sesión de verdad: el servidor rechaza
            cualquier operación nueva ese día. <strong className="font-medium text-foreground">Avisa</strong> solo te lo dice y
            lo deja registrado. Tienes {active} de {RULE_TYPES.length} activas.
          </>
        }
      />
      <ul className="grid gap-4 xl:grid-cols-2">
        {RULE_TYPES.map((type) => (
          <RuleCard key={type} type={type} initial={draftFor(type, rules)} />
        ))}
      </ul>
    </section>
  );
}

function RuleCard({ type, initial }: { type: RuleType; initial: Draft }) {
  const meta = RULE_META[type];
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function persist(next: Draft) {
    const params = Object.fromEntries(
      meta.fields.map((f) => [f.key, f.kind === "time" ? next.params[f.key] : Number((next.params[f.key] ?? "").replace(",", "."))]),
    );
    const parsed = ruleSchema.safeParse({ type, params, action: next.action, enabled: next.enabled });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    start(async () => {
      const res = await saveRule(parsed.data);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSaved(next);
    });
  }

  // El interruptor y la acción se guardan al instante; los números con el botón (o Enter).
  function update(next: Draft, immediate: boolean) {
    setDraft(next);
    if (immediate) persist(next);
  }

  return (
    <li
      className={cn(
        "flex flex-col rounded-xl border bg-card transition-colors",
        draft.enabled ? (draft.action === "block" ? "border-loss/30" : "border-border") : "opacity-75",
      )}
    >
      <div className="flex items-start justify-between gap-4 px-5 pt-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-medium">
            {draft.enabled &&
              (draft.action === "block" ? (
                <OctagonXIcon className="size-4 text-loss" aria-label="Bloquea" />
              ) : (
                <TriangleAlertIcon className="size-4 text-warn" aria-label="Avisa" />
              ))}
            {meta.title}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{meta.description}</p>
        </div>
        <Switch
          checked={draft.enabled}
          aria-label={`Activar: ${meta.title}`}
          onCheckedChange={(enabled) => update({ ...draft, enabled }, true)}
        />
      </div>

      {draft.enabled ? (
        <form
          className="mt-4 flex flex-1 flex-col gap-4 border-t px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            persist(draft);
          }}
        >
          <div className="flex flex-wrap items-start gap-3">
            {meta.fields.map((f) => (
              <label key={f.key} className="w-32 space-y-1.5">
                <span className="block text-xs font-medium text-muted-foreground">{f.label}</span>
                <InputGroup
                  value={draft.params[f.key] ?? ""}
                  onChange={(e) => update({ ...draft, params: { ...draft.params, [f.key]: e.target.value } }, false)}
                  type={f.kind === "time" ? "time" : "text"}
                  inputMode={f.kind === "time" ? undefined : f.kind === "int" ? "numeric" : "decimal"}
                  suffix={f.suffix}
                  aria-invalid={Boolean(errors[`params.${f.key}`])}
                />
                <FieldError message={errors[`params.${f.key}`]} />
              </label>
            ))}
          </div>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
            <Segmented
              aria-label="Qué pasa al romperla"
              value={draft.action}
              options={ACTIONS}
              onChange={(action) => update({ ...draft, action }, !dirtyParams(draft, saved))}
              className="w-44"
            />
            <SaveState dirty={dirty} pending={pending} />
          </div>
        </form>
      ) : (
        <p className="px-5 pt-3 pb-4 text-sm text-subtle">Desactivada. Actívala para configurarla.</p>
      )}
    </li>
  );
}

function dirtyParams(a: Draft, b: Draft) {
  return JSON.stringify(a.params) !== JSON.stringify(b.params);
}

function SaveState({ dirty, pending }: { dirty: boolean; pending: boolean }) {
  if (pending) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <LoaderIcon className="size-4 animate-spin" />
        Guardando
      </span>
    );
  }
  if (dirty) {
    return (
      <Button type="submit" size="sm">
        Guardar cambios
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-subtle">
      <CheckIcon className="size-4" />
      Guardada
    </span>
  );
}
