"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { checkIn } from "@/app/actions/sessions";
import { Choice } from "@/components/app/choice";
import { InputGroup } from "@/components/app/input-group";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MOOD_LABEL, MOODS, type Mood } from "@/lib/domain/types";
import type { Rule } from "@/lib/rules";
import { cn } from "@/lib/utils";

const dec = (n: number) => String(n);

const DURATIONS = [30, 45, 60, 90];

export function ruleSummary(rule: Rule): string {
  switch (rule.type) {
    case "max_trades":
      return `Máximo ${rule.params.n} operativas`;
    case "max_losses":
      return `Máximo ${rule.params.n} pérdidas`;
    case "max_session_minutes":
      return `Sesión de ${rule.params.minutes} min`;
    case "max_risk_pct":
      return `Riesgo máximo ${dec(rule.params.pct)}% por operación`;
    case "allowed_hours":
      return `Solo de ${rule.params.from} a ${rule.params.to}`;
    case "no_size_increase_after_loss":
      return `Tras perder, stake como mucho ×${dec(rule.params.factor)}`;
    case "min_gap_seconds":
      return `${rule.params.seconds} s de pausa entre operaciones`;
    case "max_psych_errors":
      return `Máximo ${rule.params.n} entradas por impulso`;
  }
}

export function CheckinDialog({
  open,
  onOpenChange,
  accountId,
  rules,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  rules: Rule[];
  onDone: (mood: Mood) => void;
}) {
  const ruleMinutes = rules.find((r) => r.type === "max_session_minutes" && r.enabled);
  const defaultMinutes = ruleMinutes?.type === "max_session_minutes" ? ruleMinutes.params.minutes : 60;
  const [mood, setMood] = useState<Mood | null>(null);
  const [readRules, setReadRules] = useState(false);
  const [goal, setGoal] = useState("2");
  const [minutes, setMinutes] = useState(String(defaultMinutes));
  const [pending, start] = useTransition();
  const active = rules.filter((r) => r.enabled);
  const minutesNumber = Number(minutes);
  const customMinutes = !DURATIONS.includes(minutesNumber);

  function submit() {
    if (!mood) {
      toast.error("Elige cómo llegas a la sesión");
      return;
    }
    if (!Number.isInteger(minutesNumber) || minutesNumber < 5 || minutesNumber > 600) {
      toast.error("La duración tiene que estar entre 5 y 600 minutos");
      return;
    }
    const g = goal.trim() ? Number(goal.replace(",", ".")) : null;
    start(async () => {
      const res = await checkIn({
        account_id: accountId,
        mood_before: mood,
        read_rules: readRules,
        goal_r: g !== null && Number.isFinite(g) ? g : null,
        planned_minutes: minutesNumber,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onDone(mood);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">Antes de operar</DialogTitle>
          <DialogDescription>Treinta segundos para empezar la sesión con la cabeza en su sitio.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">¿Cómo llegas?</legend>
            <div className="grid grid-cols-3 gap-2">
              {MOODS.map((m) => (
                <Choice key={m} selected={mood === m} className="h-12" onClick={() => setMood(m)}>
                  {MOOD_LABEL[m]}
                </Choice>
              ))}
            </div>
            {mood === "acelerado" && (
              <p className="mt-2 text-sm text-warn">Llegas acelerado. Es el estado en el que más se rompen reglas.</p>
            )}
            {mood === "cansado" && <p className="mt-2 text-sm text-warn">Llegas cansado. Considera una sesión más corta hoy.</p>}
          </fieldset>

          <fieldset>
            <legend className="mb-2 flex w-full items-baseline justify-between text-sm font-medium">
              ¿Cuánto tiempo vas a operar?
              <span className="text-xs font-normal text-subtle">El temporizador arranca al empezar</span>
            </legend>
            <div className="grid grid-cols-5 gap-2">
              {DURATIONS.map((d) => (
                <Choice key={d} selected={minutesNumber === d} className="num h-11 px-0" onClick={() => setMinutes(String(d))}>
                  {d}′
                </Choice>
              ))}
              <InputGroup
                value={customMinutes ? minutes : ""}
                placeholder="Otro"
                onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                aria-label="Minutos personalizados"
                className={cn("h-11", customMinutes && "border-brand/60")}
                inputClassName="px-2 text-center"
              />
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="block text-sm font-medium">Objetivo del día</span>
              <InputGroup value={goal} onChange={(e) => setGoal(e.target.value)} inputMode="decimal" suffix="R" className="h-11" />
            </label>
          </div>

          {active.length > 0 && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Tus reglas de hoy</legend>
              <ul className="divide-y rounded-lg border text-sm">
                {active.map((r) => (
                  <li key={r.type} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-muted-foreground">{ruleSummary(r)}</span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-xs font-medium",
                        r.action === "block" ? "bg-loss/15 text-loss" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {r.action === "block" ? "Bloquea" : "Avisa"}
                    </span>
                  </li>
                ))}
              </ul>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <Checkbox checked={readRules} onCheckedChange={(v) => setReadRules(v === true)} />
                Las leí y las voy a respetar
              </label>
            </fieldset>
          )}
        </div>

        <DialogFooter>
          <Button size="lg" className="h-11 w-full sm:w-auto" onClick={submit} disabled={pending}>
            {pending ? "Abriendo…" : `Empezar sesión de ${Number.isFinite(minutesNumber) && minutesNumber > 0 ? minutesNumber : "—"} min`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
