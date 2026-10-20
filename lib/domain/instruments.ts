import type { Direction, InstrumentFamily } from "./types";

export interface Instrument {
  code: InstrumentCode;
  label: string;
  family: InstrumentFamily;
  spikeEvery: number;
  favoredDirection: Direction;
}

export const INSTRUMENT_CODES = [
  "BOOM300",
  "BOOM500",
  "BOOM600",
  "BOOM900",
  "BOOM1000",
  "CRASH300",
  "CRASH500",
  "CRASH600",
  "CRASH900",
  "CRASH1000",
] as const;

export type InstrumentCode = (typeof INSTRUMENT_CODES)[number];

function build(code: InstrumentCode): Instrument {
  const family: InstrumentFamily = code.startsWith("BOOM") ? "boom" : "crash";
  const spikeEvery = Number(code.replace(/\D/g, ""));
  return {
    code,
    label: `${family === "boom" ? "Boom" : "Crash"} ${spikeEvery}`,
    family,
    spikeEvery,
    // En Boom el spike es alcista: comprar va a favor. En Crash es bajista: vender va a favor.
    favoredDirection: family === "boom" ? "buy" : "sell",
  };
}

/** Espejo del catálogo `instruments` de la base. Es fijo: diez índices. */
export const INSTRUMENTS: readonly Instrument[] = INSTRUMENT_CODES.map(build);

const BY_CODE = new Map<string, Instrument>(INSTRUMENTS.map((i) => [i.code, i]));

export function isInstrumentCode(value: string): value is InstrumentCode {
  return BY_CODE.has(value);
}

export function getInstrument(code: string): Instrument {
  const found = BY_CODE.get(code);
  if (!found) throw new Error(`Instrumento desconocido: ${code}`);
  return found;
}

export function instrumentLabel(code: string): string {
  return BY_CODE.get(code)?.label ?? code;
}
