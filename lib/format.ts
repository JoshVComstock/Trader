import { es } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";
import { TIME_ZONE } from "@/lib/time-core";

const LOCALE = "en-US";

const moneyFormatters = new Map<string, Intl.NumberFormat>();
function moneyFormatter(currency: string, decimals: number) {
  const key = `${currency}:${decimals}`;
  let f = moneyFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    moneyFormatters.set(key, f);
  }
  return f;
}

export function money(value: number, currency = "USD", decimals = 2): string {
  return moneyFormatter(currency, decimals).format(value);
}

/** Con signo explícito: +$2.00 / −$1.00. */
export function signedMoney(value: number, currency = "USD"): string {
  if (value === 0) return money(0, currency);
  const abs = money(Math.abs(value), currency);
  return value > 0 ? `+${abs}` : `−${abs}`;
}

const rFormat = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function rValue(value: number): string {
  if (value === 0) return "0.00R";
  const abs = rFormat.format(Math.abs(value));
  return `${value > 0 ? "+" : "−"}${abs}R`;
}

const pctFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

export function percent(ratio: number | null): string {
  return ratio === null ? "—" : `${pctFormat.format(ratio * 100)}%`;
}

const decimalFormat = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function decimal(value: number | null): string {
  if (value === null) return "—";
  if (!Number.isFinite(value)) return "∞";
  return decimalFormat.format(value);
}

/** Dólares compactos para celdas chicas: +$2.00, −$1.5k. */
export function compactMoney(value: number): string {
  const abs = Math.abs(value);
  const s = abs >= 1000 ? `${(abs / 1000).toFixed(1)}k` : abs.toFixed(abs >= 100 ? 0 : 2);
  if (value === 0) return "$0";
  return `${value > 0 ? "+" : "−"}$${s}`;
}

/** Fecha/hora en La Paz con un patrón de date-fns. */
export function inLaPaz(date: string | Date, pattern: string): string {
  return formatInTimeZone(date, TIME_ZONE, pattern, { locale: es });
}

export function dateTimeShort(iso: string): string {
  return inLaPaz(iso, "d MMM · HH:mm");
}

export function timeShort(iso: string): string {
  return inLaPaz(iso, "HH:mm");
}

export function monthLabel(month: string): string {
  const label = inLaPaz(`${month}-15T12:00:00Z`, "MMMM yyyy");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function dayLabel(date: string): string {
  const label = inLaPaz(`${date}T16:00:00Z`, "EEEE d 'de' MMMM");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function duration(fromIso: string, toIso: string | null): string {
  if (!toIso) return "—";
  const s = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return rest ? `${m} min ${rest} s` : `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Valor para <input type="datetime-local"> en hora de La Paz. */
export function toLocalInput(iso: string): string {
  return inLaPaz(iso, "yyyy-MM-dd'T'HH:mm");
}
