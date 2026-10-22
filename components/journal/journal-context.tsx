"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { createTrade } from "@/app/actions/trades";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsDesktop } from "@/hooks/use-media-query";
import { defaultPnl, isWithSpike } from "@/lib/calc/trade";
import { defaultChecklist } from "@/lib/domain/checklist";
import { getInstrument } from "@/lib/domain/instruments";
import type { JournalMode } from "@/lib/domain/types";
import type { Account, CalmMessage, JournalTrade, Observation, Session, Strategy, WeeklyReview } from "@/lib/data";
import { signedMoney, timeShort, toLocalInput } from "@/lib/format";
import { instrumentLabel } from "@/lib/domain/instruments";
import { AnnotatorDialog } from "../float/annotator";
import { captureScreen, pendingCapture } from "../float/capture";
import { FloatingCoach, openCoachHost, supportsPip, type CoachHost } from "../float/floating-coach";
import type { EngineTrade, Rule } from "@/lib/rules";
import type { TradeInput } from "@/lib/schemas";
import { pauseState } from "@/lib/psych";
import type { UserSettings } from "@/lib/domain/psych";
import { clock } from "./session-timer";
import { addDays, fromLocal, localDate } from "@/lib/time-core";
import { uploadScreenshot } from "@/lib/upload";
import { CheckinDialog } from "./checkin-dialog";
import { CloseSessionDialog } from "./close-session-dialog";
import { pendingStore, type PendingTrade } from "./pending-store";
import { TradeForm, type TradeFormValues } from "./trade-form";

export interface JournalClientData {
  mode: JournalMode;
  account: Account;
  strategies: Strategy[];
  rules: Rule[];
  session: Session | null;
  sessionTrades: JournalTrade[];
  /** Operaciones del mes que se está viendo. */
  trades: JournalTrade[];
  lastTrade: JournalTrade | null;
  balance: number;
  today: string;
  settings: UserSettings;
  calmMessages: CalmMessage[];
  lastReview: WeeklyReview | null;
  observations: Observation[];
  /** Objetivo de cada día del mes, para el calendario. */
  goals: Record<string, number>;
  /** Última meta usada, como sugerencia para el check-in. */
  lastGoal: number | null;
}

/** Operación de la sesión con lo que necesitan el motor, la pausa y el detector de tilt. */
export type SessionTrade = EngineTrade & { with_spike: boolean };

interface JournalContextValue {
  data: JournalClientData;
  pending: PendingTrade[];
  /** Operaciones de hoy (servidor + pendientes), para la pausa y el detector de tilt. */
  liveTrades: SessionTrade[];
  /** Lo que te dice tu yo tranquilo hoy (o null si no hay o está apagado). */
  calmMessage: CalmMessage | null;
  selectedDay: string | null;
  setSelectedDay: (day: string | null) => void;
  /** Abre el registro. En vivo, pide el check-in primero si hace falta. */
  startTrade: () => void;
  editPending: (id: string) => void;
  retryPending: (id: string) => void;
  discardPending: (id: string) => void;
  openCheckin: () => void;
  openCloseSession: () => void;
  /** Abre (o enfoca) la ventana flotante de la estrategia. Llamar dentro de un clic. */
  openCoach: () => void;
  coachOpen: boolean;
  /** Captura la pantalla y abre el editor de dibujo. */
  captureFrom: (win?: Window) => void;
}

const JournalContext = createContext<JournalContextValue | null>(null);

export function useJournal() {
  const ctx = use(JournalContext);
  if (!ctx) throw new Error("useJournal fuera de JournalProvider");
  return ctx;
}

function toEngine(t: JournalTrade): SessionTrade {
  return {
    opened_at: t.opened_at,
    closed_at: t.closed_at,
    stake: t.stake,
    pnl: t.pnl,
    impulse: t.checklist.impulse,
    with_spike: t.with_spike,
  };
}

function payloadToEngine(p: TradeInput, createdAt?: number): SessionTrade {
  return {
    opened_at: p.opened_at ?? new Date(createdAt ?? Date.now()).toISOString(),
    closed_at: p.closed_at,
    stake: p.stake,
    pnl: p.pnl ?? defaultPnl(p.result, p.stake, p.tp),
    impulse: p.checklist.impulse,
    with_spike: isWithSpike(p.instrument, p.direction),
  };
}

/** Un mensaje por día, siempre el mismo ese día. */
function pickCalmMessage(list: readonly CalmMessage[], today: string): CalmMessage | null {
  if (list.length === 0) return null;
  const n = Number(today.replace(/-/g, ""));
  return list[n % list.length];
}

function numberString(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : String(n);
}

/** Valores iniciales: la operación anterior de la sesión manda (índice, stake, TP). */
function newTradeValues(
  data: JournalClientData,
  previous: Partial<TradeInput> | null,
  moodOverride?: TradeFormValues["mood"],
): TradeFormValues {
  const prev = previous ?? data.sessionTrades.at(-1) ?? data.lastTrade;
  const instrument = prev?.instrument ?? "BOOM1000";
  const stake = prev?.stake ?? 1;
  const strategy =
    (prev?.strategy_id && data.strategies.find((s) => s.id === prev.strategy_id && s.active)?.id) ??
    data.strategies.find((s) => s.active)?.id ??
    "";
  const checklist = prev?.checklist ? { ...prev.checklist, impulse: false, doubted: false } : defaultChecklist();
  const mood = moodOverride ?? data.session?.mood_before ?? prev?.mood ?? "tranquilo";
  checklist.calm = mood === "tranquilo";

  let openedAt = "";
  if (data.mode === "backtest") {
    // Sigue donde quedó el backtest; si ese día ya se bloqueó, salta al siguiente a las 09:00.
    const prevDay = prev?.opened_at ? localDate(prev.opened_at) : null;
    const dayBlocked = prevDay !== null && data.session?.date === prevDay && data.session.status === "blocked";
    const base = !prev?.opened_at
      ? new Date()
      : dayBlocked
        ? fromLocal(addDays(prevDay, 1), "09:00")
        : new Date(Date.parse(prev.opened_at) + 15 * 60_000);
    openedAt = toLocalInput(base.toISOString());
  }

  return {
    id: crypto.randomUUID(),
    account_id: data.account.id,
    result: "",
    instrument,
    direction: prev?.direction ?? getInstrument(instrument).favoredDirection,
    stake: numberString(stake),
    strategy_id: strategy,
    mood,
    // Con multiplicadores el spike paga lo que paga: el TP no se arrastra de la anterior.
    tp: "",
    pnl: "",
    opened_at: openedAt,
    closed_at: "",
    note: "",
    checklist,
    anxiety: "",
    entry_amount: numberString(prev?.entry_amount ?? null),
    multiplier: numberString(prev?.multiplier ?? null),
  };
}

export function payloadToValues(p: TradeInput): TradeFormValues {
  const expected = defaultPnl(p.result, p.stake, p.tp);
  const amount = p.pnl === null || p.pnl === expected && p.result !== "win" ? "" : numberString(Math.abs(p.pnl));
  return {
    id: p.id,
    account_id: p.account_id,
    result: p.result,
    instrument: p.instrument,
    direction: p.direction,
    stake: numberString(p.stake),
    strategy_id: p.strategy_id ?? "",
    mood: p.mood,
    tp: numberString(p.tp),
    pnl: amount,
    opened_at: p.opened_at ? toLocalInput(p.opened_at) : "",
    closed_at: p.closed_at ? toLocalInput(p.closed_at) : "",
    note: p.note ?? "",
    checklist: p.checklist,
    anxiety: p.anxiety ? String(p.anxiety) : "",
    entry_amount: numberString(p.entry_amount),
    multiplier: numberString(p.multiplier),
  };
}

/**
 * Guardado optimista: la operación aparece al instante como pendiente y se confirma después.
 * Si falla, queda guardada en el navegador para reintentar sin perder los datos.
 */
async function submitTrade(payload: TradeInput, file: Blob | null, onNoSession: () => void) {
  pendingStore.update((list) => [
    ...list.filter((p) => p.payload.id !== payload.id),
    { payload, status: "saving", file, createdAt: Date.now() },
  ]);
  let res: Awaited<ReturnType<typeof createTrade>>;
  try {
    res = await createTrade(payload);
  } catch {
    res = { ok: false, error: "Sin conexión con el servidor. Tus datos quedan guardados aquí.", code: "unknown" };
  }

  if (!res.ok) {
    pendingStore.update((list) =>
      list.map((p) => (p.payload.id === payload.id ? { ...p, status: "error", error: res.error } : p)),
    );
    toast.error(res.error, {
      duration: 8000,
      action:
        res.code === "unknown"
          ? { label: "Reintentar", onClick: () => void submitTrade(payload, file, onNoSession) }
          : undefined,
    });
    if (res.code === "no_session") onNoSession();
    return;
  }

  pendingStore.update((list) =>
    list.map((p) => (p.payload.id === payload.id ? { ...p, status: "saved", createdAt: Date.now(), file: null } : p)),
  );

  const { sessionStatus, violations, limits } = res.data;
  if (sessionStatus === "blocked") {
    const msg = limits.find((l) => l.action === "block")?.message ?? violations.find((v) => v.action === "block")?.message;
    toast.warning("Sesión bloqueada", { description: msg, duration: 10000 });
  } else if (violations.length > 0) {
    toast.warning("Guardada con avisos", { description: violations.map((v) => v.message).join(" "), duration: 8000 });
  } else if (limits.length > 0) {
    toast.warning("Guardada", { description: limits[0].message, duration: 8000 });
  } else {
    toast.success("Operación guardada");
  }

  if (file) {
    uploadScreenshot(payload.id, file).then(
      () => toast.success("Captura subida"),
      (e: unknown) => toast.error(e instanceof Error ? e.message : "No pudimos subir la captura"),
    );
  }
}

export function JournalProvider({ data, children }: { data: JournalClientData; children: ReactNode }) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const pendingAll = useSyncExternalStore(pendingStore.subscribe, pendingStore.get, pendingStore.getServer);
  const pending = useMemo(
    () => pendingAll.filter((p) => p.payload.account_id === data.account.id),
    [pendingAll, data.account.id],
  );
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<TradeFormValues | null>(null);
  /** Foto para el formulario que se abre (una captura dibujada en la ventana flotante). */
  const [formFile, setFormFile] = useState<Blob | null>(null);
  const [coachHost, setCoachHost] = useState<CoachHost | null>(null);
  const [captureImage, setCaptureImage] = useState<Blob | null>(null);
  const openForm = useCallback((values: TradeFormValues) => {
    setFormFile(pendingCapture.take());
    setFormValues(values);
  }, []);
  const [checkinOpen, setCheckinOpen] = useState(false);
  /** Si el check-in se abrió al querer registrar, al terminar se abre el formulario. */
  const [tradeAfterCheckin, setTradeAfterCheckin] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  // Las confirmadas se retiran cuando el servidor ya las devuelve (o a los pocos segundos).
  const serverIds = useMemo(
    () => new Set([...data.trades.map((t) => t.id), ...data.sessionTrades.map((t) => t.id)]),
    [data.trades, data.sessionTrades],
  );
  const liveTrades = useMemo<SessionTrade[]>(
    () =>
      data.mode !== "live"
        ? []
        : [
            ...data.sessionTrades.map(toEngine),
            ...pending
              .filter((p) => p.status !== "error" && !serverIds.has(p.payload.id))
              .map((p) => payloadToEngine(p.payload, p.createdAt)),
          ],
    [data.mode, data.sessionTrades, pending, serverIds],
  );
  const calmMessage = data.settings.psych.calm_self_message ? pickCalmMessage(data.calmMessages, data.today) : null;
  useEffect(() => {
    const saved = pendingStore.get().filter((p) => p.status === "saved");
    if (saved.length === 0) return;
    if (saved.some((p) => serverIds.has(p.payload.id))) {
      pendingStore.update((list) => list.filter((p) => !(p.status === "saved" && serverIds.has(p.payload.id))));
    }
    const timer = setTimeout(() => {
      pendingStore.update((list) => list.filter((p) => p.status !== "saved" || Date.now() - p.createdAt < 4000));
    }, 4000);
    return () => clearTimeout(timer);
  }, [serverIds, pendingAll]);

  const submit = useCallback(
    (payload: TradeInput, file: Blob | null) => submitTrade(payload, file, () => setCheckinOpen(true)),
    [],
  );

  const startTrade = useCallback(() => {
    const s = data.session;
    if (data.mode === "live") {
      if (!s) {
        setTradeAfterCheckin(true);
        setCheckinOpen(true);
        return;
      }
      if (s.status === "blocked") {
        toast.warning("La sesión de hoy está bloqueada", { description: s.blocked_reason ?? undefined });
        return;
      }
      if (s.status === "closed") {
        toast.info("Cerraste la sesión de hoy", { description: "Se vuelve a abrir mañana. Lo que no operaste hoy no se pierde." });
        return;
      }
      if (data.settings.psych.pause_after_loss) {
        const pause = pauseState(liveTrades, data.rules, new Date().toISOString());
        if (pause.active) {
          toast.warning(data.settings.pausePhrase, {
            description: `Vienes de perder. Puedes registrar de nuevo en ${clock(pause.remainingSec)}.`,
            duration: 6000,
          });
          return;
        }
      }
    }
    const lastPending = pendingStore.get().filter((p) => p.payload.account_id === data.account.id).at(-1)?.payload ?? null;
    openForm(newTradeValues(data, lastPending));
  }, [data, liveTrades, openForm]);

  const value = useMemo<JournalContextValue>(
    () => ({
      data,
      pending,
      liveTrades,
      calmMessage,
      selectedDay,
      setSelectedDay,
      startTrade,
      editPending: (id) => {
        const p = pendingStore.get().find((x) => x.payload.id === id);
        if (p) setFormValues(payloadToValues(p.payload));
      },
      retryPending: (id) => {
        const p = pendingStore.get().find((x) => x.payload.id === id);
        if (p) void submit(p.payload, p.file ?? null);
      },
      discardPending: (id) => pendingStore.update((list) => list.filter((p) => p.payload.id !== id)),
      openCheckin: () => {
        setTradeAfterCheckin(false);
        setCheckinOpen(true);
      },
      openCloseSession: () => setCloseOpen(true),
      coachOpen: coachHost !== null,
      openCoach: () => {
        if (coachHost?.kind === "pip") {
          coachHost.win.focus();
          return;
        }
        void openCoachHost().then((host) => {
          setCoachHost(host);
          if (host.kind === "inline") {
            toast.info("Ventana flotante dentro de la página", {
              description: supportsPip()
                ? "Para que quede encima aunque minimices el navegador, ábrela con un clic en Chrome o Edge de computadora."
                : "Tu navegador no permite ventanas siempre encima. En Chrome o Edge de computadora sí.",
            });
          }
        });
      },
      captureFrom: (win) => {
        captureScreen(win ?? window).then(
          (blob) => {
            setCaptureImage(blob);
            window.focus();
          },
          (e: unknown) => {
            // Cancelar el selector de pantalla no es un error.
            if (e instanceof DOMException && e.name === "NotAllowedError") return;
            toast.error(e instanceof Error ? e.message : "No pudimos capturar la pantalla");
          },
        );
      },
    }),
    [data, pending, liveTrades, calmMessage, selectedDay, startTrade, submit, coachHost],
  );

  const sessionContext = useCallback(
    (date: string | null) => {
      if (date === null) return { trades: liveTrades, openedAt: data.session?.opened_at ?? null };
      const sameDay = data.trades.filter((t) => t.session_date === date);
      return {
        trades: sameDay.map(toEngine),
        openedAt: sameDay.reduce<string | null>((min, t) => (min === null || t.opened_at < min ? t.opened_at : min), null),
      };
    },
    [data, liveTrades],
  );

  const formOpen = formValues !== null;
  const close = () => setFormValues(null);
  const form = formValues && (
    <TradeForm
      key={formValues.id}
      mode={data.mode}
      initial={formValues}
      editing={false}
      strategies={data.strategies}
      rules={data.rules}
      balance={data.balance}
      currency={data.account.currency}
      sessionTrades={sessionContext}
      sessionOpenedAt={data.session?.opened_at ?? null}
      showShortcuts={isDesktop}
      session={data.mode === "live" ? data.session : null}
      psych={data.settings.psych}
      observations={data.observations}
      initialFile={formFile}
      onCancel={close}
      onSubmit={(payload, file) => {
        close();
        void submit(payload, file);
      }}
    />
  );
  const title = data.mode === "backtest" ? "Registrar operación de backtesting" : "Registrar operación";
  const description = `${data.account.label} · ${data.mode === "backtest" ? "sin dinero real" : "hoy"}`;

  return (
    <JournalContext value={value}>
      {children}

      {isDesktop ? (
        <Dialog open={formOpen} onOpenChange={(o) => !o && close()}>
          <DialogContent className="flex max-h-[min(94vh,60rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
            <DialogHeader className="border-b px-6 pt-5 pb-4">
              <DialogTitle className="text-lg">{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            {form}
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet open={formOpen} onOpenChange={(o) => !o && close()}>
          <SheetContent side="bottom" className="flex max-h-[94svh] flex-col gap-0 rounded-t-2xl p-0">
            <SheetHeader className="border-b px-4 pt-4 pb-3">
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>{description}</SheetDescription>
            </SheetHeader>
            {form}
          </SheetContent>
        </Sheet>
      )}

      {coachHost && (
        <FloatingCoach
          host={coachHost}
          onClose={() => {
            if (coachHost.kind === "pip") coachHost.win.close();
            setCoachHost(null);
          }}
          onCapture={(win) => value.captureFrom(win)}
          captureReady={captureImage !== null}
        />
      )}

      <AnnotatorDialog
        image={captureImage}
        onClose={() => setCaptureImage(null)}
        onAttachNext={(blob) => {
          pendingCapture.set(blob);
          toast.success("Captura lista", { description: "Se adjunta sola a la próxima operación que registres." });
        }}
        attachTargets={(data.mode === "live" ? data.sessionTrades : data.trades.slice(0, 15)).map((t) => ({
          id: t.id,
          label: `${timeShort(t.opened_at)} · ${instrumentLabel(t.instrument)} · ${signedMoney(t.pnl, data.account.currency)}`,
        }))}
        onAttachTo={async (tradeId, blob) => {
          try {
            await uploadScreenshot(tradeId, blob);
            toast.success("Captura adjuntada");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "No pudimos subir la captura");
          }
        }}
      />

      <CheckinDialog
        open={checkinOpen}
        onOpenChange={setCheckinOpen}
        accountId={data.account.id}
        rules={data.rules}
        stake={data.sessionTrades.at(-1)?.stake ?? data.lastTrade?.stake ?? 1}
        balance={data.balance}
        defaultGoal={data.lastGoal}
        lastReview={data.settings.psych.weekly_review ? data.lastReview : null}
        onDone={(mood) => {
          setCheckinOpen(false);
          router.refresh();
          if (tradeAfterCheckin) {
            setTradeAfterCheckin(false);
            openForm(newTradeValues(data, null, mood));
          }
        }}
      />
      {data.session && (
        <CloseSessionDialog open={closeOpen} onOpenChange={setCloseOpen} session={data.session} />
      )}
    </JournalContext>
  );
}

