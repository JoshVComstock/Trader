"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { checkIn } from "@/app/actions/sessions";
import { Choice, FieldLabel } from "@/components/app/choice";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MOOD_LABEL, MOODS, type Mood } from "@/lib/domain/types";
import type { Rule } from "@/lib/rules";

const dec = (n: number) => String(n).replace(".", ",");

export function ruleSummary(rule: Rule): string {
  switch (rule.type) {
    case "max_trades":
      return `Máximo ${rule.params.n} operativas`;
    case "max_losses":
      return `Máximo ${rule.params.n} pérdidas`;
    case "max_session_minutes":
      return `Sesión de ${rule.params.minutes} min`;
    case "max_risk_pct":
      return `Riesgo máximo ${dec(rule.params.pct)} % por operación`;
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
  const [mood, setMood] = useState<Mood | null>(null);
  const [readRules, setReadRules] = useState(false);
  const [goal, setGoal] = useState("2");
  const [pending, start] = useTransition();
  const active = rules.filter((r) => r.enabled);

  function submit() {
    if (!mood) {
      toast.error("Elige cómo llegas a la sesión");
      return;
    }
    const g = goal.trim() ? Number(goal.replace(",", ".")) : null;
    start(async () => {
      const res = await checkIn({
        account_id: accountId,
        mood_before: mood,
        read_rules: readRules,
        goal_r: g !== null && Number.isFinite(g) ? g : null,
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Antes de operar</DialogTitle>
          <DialogDescription>Treinta segundos para empezar la sesión con la cabeza en su sitio.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <FieldLabel>¿Cómo llegas?</FieldLabel>
            <div className="grid grid-cols-3 gap-2">
              {MOODS.map((m) => (
                <Choice key={m} selected={mood === m} className="h-12" onClick={() => setMood(m)}>
                  {MOOD_LABEL[m]}
                </Choice>
              ))}
            </div>
            {mood === "acelerado" && (
              <p className="mt-2 text-xs text-warn">Llegas acelerado. Es el estado en el que más se rompen reglas.</p>
            )}
            {mood === "cansado" && (
              <p className="mt-2 text-xs text-warn">Llegas cansado. Considera una sesión más corta hoy.</p>
            )}
          </div>

          {active.length > 0 && (
            <div>
              <FieldLabel>Tus reglas de hoy</FieldLabel>
              <ul className="space-y-1 rounded-lg border p-3 text-sm">
                {active.map((r) => (
                  <li key={r.type} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{ruleSummary(r)}</span>
                    <span className={r.action === "block" ? "text-xs text-foreground" : "text-xs text-subtle"}>
                      {r.action === "block" ? "Bloquea" : "Avisa"}
                    </span>
                  </li>
                ))}
              </ul>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <Checkbox checked={readRules} onCheckedChange={(v) => setReadRules(v === true)} />
                Las leí y las voy a respetar
              </label>
            </div>
          )}

          <div>
            <FieldLabel hint="En R">Objetivo del día</FieldLabel>
            <Input value={goal} onChange={(e) => setGoal(e.target.value)} inputMode="decimal" className="num h-11 w-28" />
          </div>
        </div>

        <DialogFooter>
          <Button className="h-11 w-full sm:w-auto" onClick={submit} disabled={pending}>
            {pending ? "Abriendo…" : "Empezar sesión"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
