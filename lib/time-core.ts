/**
 * Utilidades de tiempo sin dependencias, para módulos puros (motor de reglas, métricas).
 * America/La_Paz es UTC−4 todo el año: no tiene horario de verano.
 */
export const TIME_ZONE = "America/La_Paz";
export const LA_PAZ_OFFSET_MINUTES = -240;

function shifted(iso: string | Date): Date {
  const ms = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  return new Date(ms + LA_PAZ_OFFSET_MINUTES * 60_000);
}

/** Día local (YYYY-MM-DD) en La Paz de un instante UTC. */
export function localDate(iso: string | Date): string {
  return shifted(iso).toISOString().slice(0, 10);
}

/** Minuto del día (0–1439) en La Paz. */
export function localMinuteOfDay(iso: string | Date): number {
  const d = shifted(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function localHour(iso: string | Date): number {
  return shifted(iso).getUTCHours();
}

/** "HH:MM" → minutos desde medianoche. */
export function parseHHMM(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) throw new Error(`Hora inválida: ${value}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatHHMM(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Instante UTC de una fecha y hora locales de La Paz. */
export function fromLocal(date: string, time = "00:00"): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const minutes = parseHHMM(time);
  return new Date(Date.UTC(y, mo - 1, d, 0, minutes) - LA_PAZ_OFFSET_MINUTES * 60_000);
}

/** Suma días a una fecha YYYY-MM-DD. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Primer y último día de un mes YYYY-MM. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from, to };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** 0 = lunes … 6 = domingo. */
export function weekdayMondayFirst(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
