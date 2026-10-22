"use client";

import { HourglassIcon, QuoteIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { dayLabel } from "@/lib/format";
import { pauseState, type PauseState } from "@/lib/psych";
import { useJournal } from "./journal-context";
import { clock } from "./session-timer";

/** Pausa después de una pérdida, en vivo. Avanza cada segundo mientras dura. */
export function usePause(): PauseState {
  const { data, liveTrades } = useJournal();
  const enabled = data.mode === "live" && data.settings.psych.pause_after_loss && data.session?.status === "open";
  const [now, setNow] = useState(() => Date.now());
  const state = enabled ? pauseState(liveTrades, data.rules, new Date(now).toISOString()) : null;
  const active = state?.active ?? false;

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  return state ?? { active: false, remainingSec: 0, totalSec: 0, endsAt: null };
}

/** Aviso de pausa con tu frase. Va en la tira de disciplina. */
export function PauseBanner({ pause }: { pause: PauseState }) {
  const { data } = useJournal();
  if (!pause.active) return null;
  const pct = pause.totalSec ? ((pause.totalSec - pause.remainingSec) / pause.totalSec) * 100 : 0;
  return (
    <div role="status" className="rounded-lg border border-warn/30 bg-warn/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <HourglassIcon className="mt-0.5 size-5 shrink-0 text-warn" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{data.settings.pausePhrase}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Vienes de perder. Respira; puedes registrar otra operación en{" "}
            <span className="num font-semibold text-warn">{clock(pause.remainingSec)}</span>.
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-warn" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Lo que escribiste en un día en que seguiste el plan. */
export function CalmSelfMessage() {
  const { calmMessage } = useJournal();
  if (!calmMessage) return null;
  return (
    <figure className="rounded-lg border bg-muted/30 px-4 py-3">
      <figcaption className="flex items-center gap-2 text-xs font-medium tracking-wide text-subtle uppercase">
        <QuoteIcon className="size-3.5" />
        Tu yo tranquilo te dijo · {dayLabel(calmMessage.date)}
      </figcaption>
      <blockquote className="mt-1.5 text-sm whitespace-pre-wrap">{calmMessage.text}</blockquote>
    </figure>
  );
}
