"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveRule } from "@/app/actions/settings";
import { Choice, FieldError } from "@/components/app/choice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { zodFieldErrors } from "@/lib/action-result";
import { RULE_META, RULE_TYPES, type Rule, type RuleAction, type RuleType } from "@/lib/rules";
import { ruleSchema } from "@/lib/schemas";

type Params = Record<string, string>;

function draftFor(type: RuleType, rules: Rule[]) {
  const rule = rules.find((r) => r.type === type);
  const params = (rule?.params ?? RULE_META[type].defaults) as Record<string, number | string>;
  return {
    enabled: rule?.enabled ?? false,
    action: rule?.action ?? ("warn" as RuleAction),
    params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v).replace(".", ",")])) as Params,
  };
}

export function RulesSection({ rules }: { rules: Rule[] }) {
  return (
    <section id="reglas" className="scroll-mt-20 space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Reglas</h2>
        <p className="text-sm text-muted-foreground">
          “Bloquea” cierra la sesión de verdad: el servidor rechaza cualquier operación nueva ese día. “Avisa” solo te lo
          dice y lo deja registrado.
        </p>
      </div>
      <ul className="divide-y rounded-xl border bg-card">
        {RULE_TYPES.map((type) => (
          <RuleRow key={type} type={type} initial={draftFor(type, rules)} />
        ))}
      </ul>
    </section>
  );
}

function RuleRow({ type, initial }: { type: RuleType; initial: ReturnType<typeof draftFor> }) {
  const meta = RULE_META[type];
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function persist(next: typeof draft) {
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
      toast.success("Regla guardada");
    });
  }

  return (
    <li className="space-y-3 px-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium">{meta.title}</p>
          <p className="text-sm text-muted-foreground">{meta.description}</p>
        </div>
        <Switch
          checked={draft.enabled}
          aria-label={`Activar: ${meta.title}`}
          onCheckedChange={(enabled) => {
            const next = { ...draft, enabled };
            setDraft(next);
            persist(next);
          }}
        />
      </div>

      {draft.enabled && (
        <div className="flex flex-wrap items-end gap-3">
          {meta.fields.map((f) => (
            <label key={f.key} className="space-y-1">
              <span className="block text-xs text-muted-foreground">{f.label}</span>
              <span className="flex items-center gap-1.5">
                <Input
                  value={draft.params[f.key] ?? ""}
                  onChange={(e) => setDraft({ ...draft, params: { ...draft.params, [f.key]: e.target.value } })}
                  type={f.kind === "time" ? "time" : "text"}
                  inputMode={f.kind === "time" ? undefined : f.kind === "int" ? "numeric" : "decimal"}
                  className="num h-9 w-24"
                />
                {f.suffix && <span className="text-sm text-muted-foreground">{f.suffix}</span>}
              </span>
              <FieldError message={errors[`params.${f.key}`]} />
            </label>
          ))}
          <div className="grid grid-cols-2 gap-1.5">
            <Choice selected={draft.action === "warn"} className="min-h-9" onClick={() => setDraft({ ...draft, action: "warn" })}>
              Avisa
            </Choice>
            <Choice selected={draft.action === "block"} className="min-h-9" onClick={() => setDraft({ ...draft, action: "block" })}>
              Bloquea
            </Choice>
          </div>
          {dirty && (
            <Button size="sm" onClick={() => persist(draft)} disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
