"use client";

import { useEffect } from "react";
import { fromLocal } from "@/lib/time-core";
import { useJournal } from "./journal-context";
import { plannedMinutes } from "./session-timer";

const DAY = 24 * 3600_000;

/** Muestra una notificación del sistema. Usa el service worker si está (PWA instalada). */
export async function notify(title: string, body: string, tag: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const options = { body, tag, icon: "/pwa-icon/192", badge: "/pwa-icon/192" };
  try {
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
  } catch {
    // El navegador puede rechazar la notificación (modo ahorro, permisos): no rompe nada.
  }
}

/**
 * Recordatorios locales mientras la app está abierta (o en segundo plano):
 * cinco minutos antes y al terminar el tiempo de sesión, y al empezar tu horario permitido.
 */
export function Reminders() {
  const { data } = useJournal();
  const session = data.session;
  const openedAt = session?.status === "open" ? session.opened_at : null;
  const planned = session ? plannedMinutes(session, data.rules) : null;
  const hours = data.rules.find((r) => r.type === "allowed_hours" && r.enabled);
  const from = hours?.type === "allowed_hours" ? hours.params.from : null;
  const to = hours?.type === "allowed_hours" ? hours.params.to : null;
  const hasSession = session !== null;

  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const timers: number[] = [];
    const at = (when: number, title: string, body: string, tag: string) => {
      const ms = when - Date.now();
      if (ms > 0 && ms < DAY) timers.push(window.setTimeout(() => void notify(title, body, tag), ms));
    };

    if (openedAt && planned) {
      const end = Date.parse(openedAt) + planned * 60_000;
      at(end - 5 * 60_000, "Quedan 5 minutos de sesión", "Termina la operación que tengas abierta y no abras otra.", "racha-fin-5");
      at(end, "Se acabó tu tiempo de sesión", "Lo decidiste tú cuando estabas tranquilo. Cierra la plataforma.", "racha-fin");
    }
    if (from && !hasSession) {
      at(
        fromLocal(data.today, from).getTime(),
        "Empieza tu horario de operar",
        `Tu horario es de ${from} a ${to}. Haz el check-in antes de la primera operación.`,
        "racha-horario",
      );
    }
    return () => timers.forEach((t) => clearTimeout(t));
  }, [openedAt, planned, from, to, hasSession, data.today]);

  return null;
}
