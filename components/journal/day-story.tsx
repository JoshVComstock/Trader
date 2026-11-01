"use client";

import { CheckIcon, ImageIcon, LoaderIcon, LockIcon, TimerIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getDayStory, type DayStory } from "@/app/actions/psych";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsDesktop } from "@/hooks/use-media-query";
import { instrumentLabel } from "@/lib/domain/instruments";
import { DIRECTION_LABEL, MOOD_LABEL, type Mood } from "@/lib/domain/types";
import { dayLabel, money, rValue, signedMoney, timeShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Private } from "@/components/app/private";

/** Historia completa de un día: check-in, cada operación con su foto y nota, y el cierre. */
export function DayStorySheet({
  accountId,
  date,
  currency,
  onClose,
}: {
  accountId: string;
  date: string | null;
  currency: string;
  onClose: () => void;
}) {
  const isDesktop = useIsDesktop();
  // Cada respuesta queda asociada a su día: al cambiar de día no se muestra la anterior.
  const [result, setResult] = useState<{ date: string; story?: DayStory; error?: string } | null>(null);

  useEffect(() => {
    if (!date) return;
    let alive = true;
    getDayStory(accountId, date).then((res) => {
      if (alive) setResult(res.ok ? { date, story: res.data } : { date, error: res.error });
    });
    return () => {
      alive = false;
    };
  }, [accountId, date]);

  const current = result?.date === date ? result : null;
  const story = current?.story ?? null;
  const error = current?.error ?? null;
  const loaded = story !== null;
  const net = loaded ? story.trades.reduce((a, t) => a + t.pnl, 0) : 0;

  return (
    <Sheet open={date !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={cn("flex flex-col gap-0 p-0", isDesktop ? "w-full data-[side=right]:sm:max-w-xl" : "max-h-[92svh] rounded-t-2xl")}
      >
        <SheetHeader className="border-b px-5 pt-5 pb-4">
          <SheetTitle className="text-lg">{date ? dayLabel(date) : ""}</SheetTitle>
          <SheetDescription>
            {loaded && story.trades.length > 0
              ? `${story.trades.length} ${story.trades.length === 1 ? "operación" : "operaciones"} · `
              : "Historia del día"}
            {loaded && story.trades.length > 0 && (
              <span className={cn("num font-medium", net > 0 ? "text-gain" : net < 0 ? "text-loss" : "")}><Private>{signedMoney(net, currency)}</Private></span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {error && <p className="text-sm text-loss">{error}</p>}
          {!loaded && !error && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderIcon className="size-4 animate-spin" />
              Cargando el día…
            </p>
          )}
          {loaded && !story.session && <p className="text-sm text-muted-foreground">Ese día no abriste sesión.</p>}

          {loaded && story.session && (
            <ol className="relative space-y-5 border-l pl-6">
              {/* Check-in */}
              <TimelineItem time={timeShort(story.session.opened_at)} dot="brand" title="Abriste la sesión">
                <p className="text-sm text-muted-foreground">
                  {story.session.mood_before ? `Llegaste ${MOOD_LABEL[story.session.mood_before as Mood].toLowerCase()}` : "Sin check-in"}
                  {story.session.planned_minutes ? ` · plan de ${story.session.planned_minutes} min` : ""}
                  {story.session.goal_r !== null ? ` · objetivo ${story.session.goal_r}R` : ""}
                  {story.session.read_rules ? " · leíste tus reglas" : ""}
                </p>
              </TimelineItem>

              {story.trades.map((t, i) => (
                <TimelineItem
                  key={t.id}
                  time={timeShort(t.opened_at)}
                  dot={t.pnl > 0 ? "gain" : t.pnl < 0 ? "loss" : "muted"}
                  title={
                    <Link href={`/journal/${t.id}`} className="hover:underline">
                      {i + 1}. {instrumentLabel(t.instrument)} · {DIRECTION_LABEL[t.direction]}
                    </Link>
                  }
                  aside={
                    <span className={cn("num text-right font-semibold", t.pnl > 0 ? "text-gain" : t.pnl < 0 ? "text-loss" : "")}>
                      <Private>{signedMoney(t.pnl, currency)}</Private>
                      <span className="block text-xs font-normal text-subtle">{rValue(t.r_multiple)}</span>
                    </span>
                  }
                >
                  <p className="num text-xs text-muted-foreground">
                    {t.entry_amount !== null && (
                      <>
                        Inversión <Private>{money(t.entry_amount, currency)}</Private>
                        {t.multiplier ? ` ×${t.multiplier}` : ""} ·{" "}
                      </>
                    )}
                    Stop <Private>{money(t.stake, currency)}</Private> · {t.with_spike ? "a favor del spike" : "contra el spike"}
                    {t.mood && ` · ${MOOD_LABEL[t.mood as Mood].toLowerCase()}`}
                    {t.closed_at && ` · cerró ${timeShort(t.closed_at)}`}
                  </p>
                  <p className={cn("mt-1 flex items-center gap-1 text-xs", t.in_plan ? "text-muted-foreground" : "text-warn")}>
                    {t.in_plan ? <CheckIcon className="size-3.5" /> : <XIcon className="size-3.5" />}
                    {t.in_plan ? "Dentro del plan" : "Fuera del plan"}
                  </p>
                  {t.note && <p className="mt-2 text-sm whitespace-pre-wrap">{t.note}</p>}
                  {t.violations.map((v) => (
                    <p key={v} className="mt-1.5 flex gap-1.5 text-xs text-warn">
                      <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
                      {v}
                    </p>
                  ))}
                  {t.shots.length > 0 ? (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {t.shots.map((s) =>
                        s.url ? (
                          <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="relative block aspect-video overflow-hidden rounded-lg border bg-muted">
                            <Image src={s.url} alt="Captura de la operación" fill unoptimized sizes="20rem" className="object-cover" />
                          </a>
                        ) : null,
                      )}
                    </div>
                  ) : (
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-subtle">
                      <ImageIcon className="size-3.5" />
                      Sin captura
                    </p>
                  )}
                </TimelineItem>
              ))}

              {/* Cierre */}
              {story.session.status === "blocked" && (
                <TimelineItem time={story.session.closed_at ? timeShort(story.session.closed_at) : ""} dot="loss" title="Sesión bloqueada">
                  <p className="flex gap-1.5 text-sm text-muted-foreground">
                    <LockIcon className="mt-0.5 size-3.5 shrink-0" />
                    {story.session.blocked_reason ?? "Rompiste una regla que bloquea."}
                  </p>
                </TimelineItem>
              )}
              {story.session.status === "closed" && (
                <TimelineItem time={story.session.closed_at ? timeShort(story.session.closed_at) : ""} dot="muted" title="Cerraste la sesión">
                  <p className="text-sm text-muted-foreground">
                    {story.session.followed_plan === true ? "Dijiste que seguiste tu plan." : story.session.followed_plan === false ? "Dijiste que no seguiste tu plan." : ""}
                  </p>
                </TimelineItem>
              )}
              {story.session.status === "open" && (
                <TimelineItem time="" dot="muted" title="Sesión abierta">
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <TimerIcon className="size-3.5" />
                    Todavía no la cerraste.
                  </p>
                </TimelineItem>
              )}
              {story.session.journal && (
                <li>
                  <blockquote className="rounded-lg border bg-muted/30 px-4 py-3 text-sm whitespace-pre-wrap">{story.session.journal}</blockquote>
                </li>
              )}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TimelineItem({
  time,
  dot,
  title,
  aside,
  children,
}: {
  time: string;
  dot: "brand" | "gain" | "loss" | "muted";
  title: React.ReactNode;
  aside?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li className="relative">
      <span
        aria-hidden
        className={cn(
          "absolute top-1.5 -left-[1.95rem] size-3 rounded-full border-2 border-background",
          { brand: "bg-brand", gain: "bg-gain", loss: "bg-loss", muted: "bg-subtle" }[dot],
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="num text-xs text-subtle">{time}</p>
          <p className="font-medium">{title}</p>
        </div>
        {aside}
      </div>
      <div className="mt-1">{children}</div>
    </li>
  );
}
