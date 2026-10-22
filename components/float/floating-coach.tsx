"use client";

import { CameraIcon, CheckIcon, GripHorizontalIcon, MinusIcon, PlusIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Logo } from "@/components/app/logo";
import { computeMeters } from "@/lib/rules";
import { cn } from "@/lib/utils";
import { useJournal } from "../journal/journal-context";
import { GoalLine, useGoalProgress } from "../journal/goal-meter";
import { clock, useSessionClock } from "../journal/session-timer";

/** Dónde vive la ventana: una ventana PiP siempre encima, o un div flotante dentro de la página. */
export type CoachHost = { kind: "pip"; win: Window } | { kind: "inline" };

interface PipApi {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

declare global {
  interface Window {
    documentPictureInPicture?: PipApi;
  }
}

export function supportsPip(): boolean {
  return typeof window !== "undefined" && "documentPictureInPicture" in window;
}

/** Copia los estilos de la app a la ventana PiP para que se vea igual. */
function copyStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join("\n");
      const style = target.createElement("style");
      style.textContent = css;
      target.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = target.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        target.head.appendChild(link);
      }
    }
  }
  target.documentElement.className = document.documentElement.className;
  target.body.className = "bg-background text-foreground antialiased";
  target.title = "Racha · estrategia";
}

/**
 * Abre la ventana flotante. Tiene que llamarse dentro de un clic (el navegador lo exige).
 * Con Document Picture-in-Picture (Chrome/Edge en computadora) queda encima de todo, incluso con el
 * navegador minimizado. Si no hay soporte, se usa un div flotante dentro de la página.
 */
export async function openCoachHost(): Promise<CoachHost> {
  const pip = window.documentPictureInPicture;
  if (!pip) return { kind: "inline" };
  try {
    const win = await pip.requestWindow({ width: 340, height: 560 });
    copyStyles(win.document);
    return { kind: "pip", win };
  } catch {
    return { kind: "inline" };
  }
}

interface CoachState {
  strategyId: string | null;
  done: number[];
  /** Operaciones que abriste en el bróker (las cuentas tú con +1). */
  taken: number;
}

function useCoachState(key: string, defaultStrategy: string | null) {
  const [state, setState] = useState<CoachState>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as CoachState;
    } catch {
      // sin almacenamiento: empieza de cero
    }
    return { strategyId: defaultStrategy, done: [], taken: 0 };
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // nada que hacer
    }
  }, [key, state]);
  return [state, setState] as const;
}

export function FloatingCoach({
  host,
  onClose,
  onCapture,
  captureReady,
}: {
  host: CoachHost;
  onClose: () => void;
  /** Captura la pantalla desde la ventana donde se hizo el clic. */
  onCapture: (win: Window) => void;
  captureReady: boolean;
}) {
  // Si se cierra la ventana PiP con su propia X, se avisa.
  useEffect(() => {
    if (host.kind !== "pip") return;
    const win = host.win;
    const closed = () => onClose();
    win.addEventListener("pagehide", closed);
    return () => win.removeEventListener("pagehide", closed);
  }, [host, onClose]);

  if (host.kind === "pip") {
    return createPortal(
      <CoachPanel ownerWindow={host.win} onClose={onClose} onCapture={onCapture} captureReady={captureReady} fill />,
      host.win.document.body,
    );
  }
  return <InlineFloat onClose={onClose} onCapture={onCapture} captureReady={captureReady} />;
}

/** Div flotante que se arrastra por la pantalla (cuando no hay PiP). */
function InlineFloat({ onClose, onCapture, captureReady }: { onClose: () => void; onCapture: (win: Window) => void; captureReady: boolean }) {
  const [pos, setPos] = useState(() => {
    try {
      const raw = window.localStorage.getItem("racha:coach:pos");
      if (raw) return JSON.parse(raw) as { x: number; y: number };
    } catch {
      // posición por defecto
    }
    return { x: Math.max(16, window.innerWidth - 360), y: 120 };
  });
  const [minimized, setMinimized] = useState(false);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  function onDown(e: PointerEvent<HTMLDivElement>) {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    const x = Math.min(Math.max(0, e.clientX - drag.current.dx), window.innerWidth - 80);
    const y = Math.min(Math.max(0, e.clientY - drag.current.dy), window.innerHeight - 48);
    setPos({ x, y });
  }
  function onUp() {
    drag.current = null;
    try {
      window.localStorage.setItem("racha:coach:pos", JSON.stringify(pos));
    } catch {
      // nada
    }
  }

  return (
    <div
      className={cn("fixed z-50 overflow-hidden rounded-xl border bg-popover shadow-2xl shadow-black/40", minimized ? "w-56" : "w-80")}
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="flex cursor-grab items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5 select-none active:cursor-grabbing"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GripHorizontalIcon className="size-3.5" />
          Arrastra para mover
        </span>
        <span className="flex gap-1">
          <IconButton label={minimized ? "Expandir" : "Minimizar"} onClick={() => setMinimized(!minimized)}>
            {minimized ? <PlusIcon className="size-3.5" /> : <MinusIcon className="size-3.5" />}
          </IconButton>
          <IconButton label="Cerrar" onClick={onClose}>
            <XIcon className="size-3.5" />
          </IconButton>
        </span>
      </div>
      <CoachPanel ownerWindow={window} onClose={onClose} onCapture={onCapture} captureReady={captureReady} compact={minimized} />
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

/**
 * El contenido: arriba los contadores (operativas, pérdidas, tiempo, hechas/anotadas), en medio los
 * pasos de tu estrategia para ir marcando, abajo capturar y registrar.
 * Sin componentes de Radix: en la ventana PiP sus portales irían a la ventana principal.
 */
function CoachPanel({
  ownerWindow,
  onClose,
  onCapture,
  captureReady,
  compact = false,
  fill = false,
}: {
  ownerWindow: Window;
  onClose: () => void;
  onCapture: (win: Window) => void;
  captureReady: boolean;
  compact?: boolean;
  fill?: boolean;
}) {
  const { data, liveTrades, startTrade } = useJournal();
  const strategies = data.strategies.filter((s) => s.active && s.steps.length > 0);
  const [state, setState] = useCoachState(`racha:coach:${data.today}:${data.account.id}`, strategies[0]?.id ?? null);
  const strategy = strategies.find((s) => s.id === state.strategyId) ?? strategies[0] ?? null;
  const steps = strategy?.steps ?? [];
  const done = state.done.filter((i) => i < steps.length);
  const ready = steps.length > 0 && done.length === steps.length;
  const sessionClock = useSessionClock(data.mode === "live" ? data.session : null, data.rules);
  const goal = useGoalProgress();

  const trades = data.mode === "live" ? liveTrades : [];
  const meters = computeMeters({
    sessionTrades: trades,
    sessionOpenedAt: data.session?.opened_at ?? new Date().toISOString(),
    now: new Date().toISOString(),
    rules: data.rules,
  });
  const tradesMeter = meters.find((m) => m.key === "trades")!;
  const lossesMeter = meters.find((m) => m.key === "losses")!;
  const annotated = trades.length;
  const missing = Math.max(0, state.taken - annotated);

  const toggle = (i: number) =>
    setState((s) => ({ ...s, done: s.done.includes(i) ? s.done.filter((x) => x !== i) : [...s.done, i] }));

  function register() {
    startTrade();
    // Lleva al formulario en la ventana principal.
    window.focus();
    setState((s) => ({ ...s, done: [] }));
  }

  const tone = (level: string) => (level === "hit" ? "text-loss" : level === "near" ? "text-warn" : "text-foreground");

  return (
    <div className={cn("flex flex-col text-sm", fill && "h-dvh")}>
      {/* Pestañas de conteo */}
      <div className="grid grid-cols-4 gap-px border-b bg-border text-center">
        <Stat label="Operativas" value={`${tradesMeter.value}${tradesMeter.limit !== null ? `/${tradesMeter.limit}` : ""}`} className={tone(tradesMeter.level)} />
        <Stat label="Pérdidas" value={`${lossesMeter.value}${lossesMeter.limit !== null ? `/${lossesMeter.limit}` : ""}`} className={tone(lossesMeter.level)} />
        <Stat
          label="Tiempo"
          value={sessionClock ? clock(sessionClock.remainingSec ?? sessionClock.elapsedSec) : "—"}
          className={sessionClock?.over ? "text-loss" : "text-foreground"}
        />
        <Stat label="Hechas/anot." value={`${state.taken}/${annotated}`} className={missing ? "text-warn" : "text-foreground"} />
      </div>

      {goal && <GoalLine progress={goal} currency={data.account.currency} />}
      {missing > 0 && (
        <p className="border-b bg-warn/10 px-3 py-1.5 text-xs text-warn">
          Te {missing === 1 ? "falta 1 operación" : `faltan ${missing} operaciones`} por anotar.
        </p>
      )}
      {data.mode === "live" && data.session?.status === "blocked" && (
        <p className="border-b bg-loss/10 px-3 py-1.5 text-xs text-loss">Sesión bloqueada. Hoy ya no se opera.</p>
      )}

      {!compact && (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            {strategies.length > 1 ? (
              <select
                value={strategy?.id ?? ""}
                onChange={(e) => setState({ strategyId: e.target.value, done: [], taken: state.taken })}
                className="h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-sm"
                aria-label="Estrategia"
              >
                {strategies.map((s) => (
                  <option key={s.id} value={s.id} className="bg-popover">
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="flex items-center gap-1.5 font-medium">
                <Logo className="size-4" />
                {strategy?.name ?? "Sin estrategia"}
              </span>
            )}
            <button
              type="button"
              onClick={() => setState((s) => ({ ...s, done: [] }))}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted"
              title="Reiniciar pasos"
            >
              <RotateCcwIcon className="size-3.5" />
              Reiniciar
            </button>
          </div>

          {steps.length === 0 ? (
            <p className="text-xs text-muted-foreground">Agrega los pasos de tu estrategia en Ajustes → Estrategias.</p>
          ) : (
            <>
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", ready ? "bg-gain" : "bg-brand")} style={{ width: `${(done.length / steps.length) * 100}%` }} />
              </div>
              <ol className="space-y-1">
                {steps.map((step, i) => {
                  const checked = done.includes(i);
                  return (
                    <li key={`${i}-${step}`}>
                      <button
                        type="button"
                        onClick={() => toggle(i)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                          checked ? "border-brand/50 bg-brand/15" : "hover:bg-muted",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-md border",
                            checked ? "border-brand bg-brand text-primary-foreground" : "border-input",
                          )}
                        >
                          {checked ? <CheckIcon className="size-3.5" strokeWidth={3} /> : <span className="num text-[10px] text-subtle">{i + 1}</span>}
                        </span>
                        <span className={checked ? "text-foreground" : "text-muted-foreground"}>{step}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              <p className={cn("mt-2 text-xs", ready ? "font-medium text-gain" : "text-subtle")}>
                {ready ? "Todo se cumple: entra según tu plan." : `${done.length} de ${steps.length} pasos. Si falta uno, no entres.`}
              </p>
            </>
          )}
        </div>
      )}

      {captureReady && (
        <p className="border-t bg-brand/10 px-3 py-1.5 text-xs">Captura lista: vuelve a Racha para dibujar sobre ella.</p>
      )}

      <div className="grid grid-cols-3 gap-1.5 border-t p-2">
        <button
          type="button"
          onClick={() => setState((s) => ({ ...s, taken: s.taken + 1 }))}
          onContextMenu={(e) => {
            e.preventDefault();
            setState((s) => ({ ...s, taken: Math.max(0, s.taken - 1) }));
          }}
          title="Abriste una operación en el bróker (clic derecho para restar)"
          className="flex h-10 items-center justify-center gap-1 rounded-lg border text-xs font-medium hover:bg-muted"
        >
          <PlusIcon className="size-3.5" />1 hecha
        </button>
        <button
          type="button"
          onClick={() => onCapture(ownerWindow)}
          className="flex h-10 items-center justify-center gap-1 rounded-lg border text-xs font-medium hover:bg-muted"
        >
          <CameraIcon className="size-3.5" />
          Capturar
        </button>
        <button
          type="button"
          onClick={register}
          className="flex h-10 items-center justify-center rounded-lg bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/85"
        >
          Registrar
        </button>
      </div>
      {fill && (
        <button type="button" onClick={onClose} className="border-t py-1.5 text-xs text-subtle hover:text-foreground">
          Cerrar ventana flotante
        </button>
      )}
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="bg-popover px-1 py-2">
      <p className="truncate text-[10px] text-subtle">{label}</p>
      <p className={cn("num text-sm font-semibold", className)}>{value}</p>
    </div>
  );
}
