"use client";

import type { TradeInput } from "@/lib/schemas";

/**
 * Operaciones guardadas de forma optimista que todavía no confirma el servidor.
 * Las que fallan se guardan en localStorage para no perder los datos al recargar.
 */
export interface PendingTrade {
  payload: TradeInput;
  status: "saving" | "saved" | "error";
  error?: string;
  /** Captura a subir cuando el servidor confirme. No se persiste. */
  file?: Blob | null;
  createdAt: number;
}

const KEY = "racha:pending:v1";
const EMPTY: PendingTrade[] = [];
let state: PendingTrade[] | null = null;
const listeners = new Set<() => void>();

function load(): PendingTrade[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingTrade[];
    // Lo que quedó "guardando" al cerrar la pestaña se trata como fallido: hay que reintentar.
    return parsed.map((p) => ({ ...p, status: "error", error: p.error ?? "No se confirmó. Reintenta." }));
  } catch {
    return [];
  }
}

function persist(list: PendingTrade[]) {
  try {
    const keep = list
      .filter((p) => p.status !== "saved")
      .map((p) => ({ payload: p.payload, status: p.status, error: p.error, createdAt: p.createdAt }));
    if (keep.length) window.localStorage.setItem(KEY, JSON.stringify(keep));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Sin almacenamiento disponible: se pierde solo la persistencia, no la operación en curso.
  }
}

export const pendingStore = {
  get(): PendingTrade[] {
    if (state === null) state = typeof window === "undefined" ? [] : load();
    return state;
  },
  getServer(): PendingTrade[] {
    return EMPTY;
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  update(fn: (list: PendingTrade[]) => PendingTrade[]) {
    state = fn(pendingStore.get());
    persist(state);
    for (const l of listeners) l();
  },
};
