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
import { defaultPnl } from "@/lib/calc/trade";
import { defaultChecklist } from "@/lib/domain/checklist";
import { getInstrument } from "@/lib/domain/instruments";
import type { JournalMode } from "@/lib/domain/types";
import type { Account, JournalTrade, Session, Strategy } from "@/lib/data";
import { toLocalInput } from "@/lib/format";
import type { EngineTrade, Rule } from "@/lib/rules";
import type { TradeInput } from "@/lib/schemas";
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
}

interface JournalContextValue {
  data: JournalClientData;
  pending: PendingTrade[];
  selectedDay: string | null;
  setSelectedDay: (day: string | null) => void;
  /** Abre el registro. En vivo, pide el check-in primero si hace falta. */
  startTrade: () => void;
  editPending: (id: string) => void;
  retryPending: (id: string) => void;
  discardPending: (id: string) => void;
  openCheckin: () => void;
  openCloseSession: () => void;
}

const JournalContext = createContext<JournalContextValue | null>(null);

export function useJournal() {
  const ctx = use(JournalContext);
  if (!ctx) throw new Error("useJournal fuera de JournalProvider");
  return ctx;
}

function toEngine(t: Pick<JournalTrade, "opened_at" | "closed_at" | "stake" | "pnl" | "checklist">): EngineTrade {
  return { opened_at: t.opened_at, closed_at: t.closed_at, stake: t.stake, pnl: t.pnl, impulse: t.checklist.impulse };
}

function payloadToEngine(p: TradeInput): EngineTrade {
  return {
    opened_at: p.opened_at ?? new Date().toISOString(),
    closed_at: p.closed_at,
    stake: p.stake,
    pnl: p.pnl ?? defaultPnl(p.result, p.stake, p.tp),
    impulse: p.checklist.impulse,
  };
}

function numberString(n: number | null | undefined): string {
  return n === null || n === undefined ? "" : String(n).replace(".", ",");
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
    const base = prev?.opened_at ? Date.parse(prev.opened_at) + 15 * 60_000 : Date.now();
    openedAt = toLocalInput(new Date(base).toISOString());
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
    tp: numberString(prev?.tp ?? stake * 2),
    pnl: "",
    opened_at: openedAt,
    closed_at: "",
    note: "",
    checklist,
  };
}

export function payloadToValues(p: TradeInput): TradeFormValues {
  const expected = defaultPnl(p.result, p.stake, p.tp);
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
    pnl: p.pnl !== null && p.pnl !== expected ? numberString(p.pnl) : "",
    opened_at: p.opened_at ? toLocalInput(p.opened_at) : "",
    closed_at: p.closed_at ? toLocalInput(p.closed_at) : "",
    note: p.note ?? "",
    checklist: p.checklist,
  };
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
  const [checkinOpen, setCheckinOpen] = useState(false);
  /** Si el check-in se abrió al querer registrar, al terminar se abre el formulario. */
  const [tradeAfterCheckin, setTradeAfterCheckin] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  // Las confirmadas se retiran cuando el servidor ya las devuelve (o a los pocos segundos).
  const serverIds = useMemo(
    () => new Set([...data.trades.map((t) => t.id), ...data.sessionTrades.map((t) => t.id)]),
    [data.trades, data.sessionTrades],
  );
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
    async (payload: TradeInput, file: Blob | null) => {
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
              ? { label: "Reintentar", onClick: () => void submit(payload, file) }
              : undefined,
        });
        if (res.code === "no_session") setCheckinOpen(true);
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
    },
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
        toast.info("Cerraste la sesión de hoy", { description: "Puedes reabrirla desde la tira de disciplina." });
        return;
      }
    }
    const lastPending = pendingStore.get().filter((p) => p.payload.account_id === data.account.id).at(-1)?.payload ?? null;
    setFormValues(newTradeValues(data, lastPending));
  }, [data]);

  const value = useMemo<JournalContextValue>(
    () => ({
      data,
      pending,
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
    }),
    [data, pending, selectedDay, startTrade, submit],
  );

  const sessionContext = useCallback(
    (date: string | null) => {
      const pendingEngine = pending.filter((p) => p.status !== "error").map((p) => p.payload);
      if (date === null) {
        return {
          trades: [
            ...data.sessionTrades.map(toEngine),
            ...pendingEngine.filter((p) => !serverIds.has(p.id)).map(payloadToEngine),
          ],
          openedAt: data.session?.opened_at ?? null,
        };
      }
      const sameDay = data.trades.filter((t) => t.session_date === date);
      return {
        trades: sameDay.map(toEngine),
        openedAt: sameDay.reduce<string | null>((min, t) => (min === null || t.opened_at < min ? t.opened_at : min), null),
      };
    },
    [data, pending, serverIds],
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
          <DialogContent className="flex max-h-[min(92vh,52rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
            <DialogHeader className="px-4 pt-4 pb-3">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            {form}
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet open={formOpen} onOpenChange={(o) => !o && close()}>
          <SheetContent side="bottom" className="flex max-h-[94svh] flex-col gap-0 rounded-t-2xl p-0">
            <SheetHeader className="px-4 pt-4 pb-2">
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>{description}</SheetDescription>
            </SheetHeader>
            {form}
          </SheetContent>
        </Sheet>
      )}

      <CheckinDialog
        open={checkinOpen}
        onOpenChange={setCheckinOpen}
        accountId={data.account.id}
        rules={data.rules}
        onDone={(mood) => {
          setCheckinOpen(false);
          router.refresh();
          if (tradeAfterCheckin) {
            setTradeAfterCheckin(false);
            setFormValues(newTradeValues(data, null, mood));
          }
        }}
      />
      {data.session && (
        <CloseSessionDialog open={closeOpen} onOpenChange={setCloseOpen} session={data.session} />
      )}
    </JournalContext>
  );
}

