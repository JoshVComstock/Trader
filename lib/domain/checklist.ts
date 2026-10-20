export const CHECKLIST_KEYS = [
  "trend_1h",
  "valid_zone",
  "max_zones",
  "fixed_sl",
  "fixed_tp",
  "positive_r",
  "kept_sl",
  "calm",
  "impulse",
  "doubted",
] as const;

export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];
export type Checklist = Record<ChecklistKey, boolean>;

export interface ChecklistGroup {
  title: string;
  items: { key: ChecklistKey; label: string; hint?: string }[];
}

export const CHECKLIST_GROUPS: readonly ChecklistGroup[] = [
  {
    title: "Contexto",
    items: [
      { key: "trend_1h", label: "Tendencia clara en 1H" },
      { key: "valid_zone", label: "Zona válida" },
      { key: "max_zones", label: "Máximo 2 zonas en la sesión" },
    ],
  },
  {
    title: "Entrada",
    items: [
      { key: "fixed_sl", label: "SL fijo" },
      { key: "fixed_tp", label: "TP fijo" },
      { key: "positive_r", label: "+1R no negativo" },
      { key: "kept_sl", label: "No moví el SL" },
    ],
  },
  {
    title: "Psicología",
    items: [
      { key: "calm", label: "Tranquilo" },
      { key: "impulse", label: "Impulso", hint: "Cuenta como error psicológico" },
      { key: "doubted", label: "Dudé", hint: "Cerrar fue correcto" },
    ],
  },
];

/** Los ítems que definen "operación dentro del plan". */
const PLAN_KEYS: readonly ChecklistKey[] = [
  "trend_1h",
  "valid_zone",
  "max_zones",
  "fixed_sl",
  "fixed_tp",
  "positive_r",
  "kept_sl",
];

export function emptyChecklist(): Checklist {
  return {
    trend_1h: false,
    valid_zone: false,
    max_zones: false,
    fixed_sl: false,
    fixed_tp: false,
    positive_r: false,
    kept_sl: false,
    calm: false,
    impulse: false,
    doubted: false,
  };
}

/** Punto de partida de la primera operación: el plan cumplido, sin errores psicológicos. */
export function defaultChecklist(): Checklist {
  const c = emptyChecklist();
  for (const key of PLAN_KEYS) c[key] = true;
  c.calm = true;
  return c;
}

/** Normaliza lo que venga de la base (jsonb) a un checklist completo. */
export function toChecklist(value: unknown): Checklist {
  const c = emptyChecklist();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of CHECKLIST_KEYS) c[key] = record[key] === true;
  }
  return c;
}

export function isInPlan(c: Checklist): boolean {
  return PLAN_KEYS.every((key) => c[key]) && !c.impulse;
}

export function hasMovedSl(c: Checklist): boolean {
  return !c.kept_sl;
}

export function isPsychError(c: Pick<Checklist, "impulse">): boolean {
  return c.impulse;
}
