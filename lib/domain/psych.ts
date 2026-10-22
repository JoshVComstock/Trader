/**
 * Funciones de control mental que se pueden prender o apagar en Ajustes.
 * Lo que no esté guardado usa el valor por defecto.
 */
export const PSYCH_FEATURES = [
  {
    key: "pause_after_loss",
    title: "Pausa después de una pérdida",
    description: "Bloquea el botón Registrar durante los segundos de tu regla de pausa mínima, con tu frase en pantalla.",
    default: true,
  },
  {
    key: "anxiety_scale",
    title: "Escala de ansiedad por operación",
    description: "Al registrar, marcas del 1 al 5 cuántas ganas de recuperar tenías. Se cruza con tus resultados.",
    default: true,
  },
  {
    key: "calm_self_message",
    title: "Mensaje de tu yo tranquilo",
    description: "Cuando te bloqueas o te acercas al límite, te muestra lo que escribiste en un día en que seguiste el plan.",
    default: true,
  },
  {
    key: "discipline_streak",
    title: "Racha de disciplina",
    description: "Días seguidos respetando todas tus reglas, junto a los cuatro números del mes.",
    default: true,
  },
  {
    key: "mood_comparison",
    title: "Tú acelerado vs tú tranquilo",
    description: "Compara win rate, R, operaciones contra el spike y reglas rotas según tu estado mental.",
    default: true,
  },
  {
    key: "tilt_detector",
    title: "Detector de tilt",
    description: "Aviso fuerte si en 10 minutos juntas pérdida, stake más grande y entrada contra el spike.",
    default: true,
  },
  {
    key: "weekly_review",
    title: "Revisión de los domingos",
    description: "Cada domingo te pide revisar la semana y lo que respondas aparece en el check-in de la semana siguiente.",
    default: true,
  },
  {
    key: "notifications",
    title: "Recordatorios en el celular",
    description: "Avisa cuando empieza tu horario permitido y cuando se acaba el tiempo de sesión.",
    default: false,
  },
] as const;

export type PsychFeature = (typeof PSYCH_FEATURES)[number]["key"];
export type PsychFlags = Record<PsychFeature, boolean>;

export const DEFAULT_PAUSE_PHRASE = "¿Esta entrada está en tu plan o es revancha?";

export function defaultPsychFlags(): PsychFlags {
  return Object.fromEntries(PSYCH_FEATURES.map((f) => [f.key, f.default])) as PsychFlags;
}

/** jsonb de la base → banderas completas. */
export function toPsychFlags(value: unknown): PsychFlags {
  const flags = defaultPsychFlags();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const f of PSYCH_FEATURES) {
      if (typeof record[f.key] === "boolean") flags[f.key] = record[f.key] as boolean;
    }
  }
  return flags;
}

export interface UserSettings {
  psych: PsychFlags;
  pausePhrase: string;
}

export const ANXIETY_LEVELS = [1, 2, 3, 4, 5] as const;
export type Anxiety = (typeof ANXIETY_LEVELS)[number];

export const ANXIETY_LABEL: Record<Anxiety, string> = {
  1: "Nada",
  2: "Poca",
  3: "Algo",
  4: "Bastante",
  5: "Mucha",
};
