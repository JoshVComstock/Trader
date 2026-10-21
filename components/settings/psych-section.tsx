"use client";

import { BellRingIcon, BrainIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveUserSettings } from "@/app/actions/psych";
import { notify } from "@/components/journal/reminders";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_PAUSE_PHRASE, PSYCH_FEATURES, type PsychFeature, type UserSettings } from "@/lib/domain/psych";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

/**
 * Control mental: cada función se puede apagar. Lo apagado desaparece de la bitácora,
 * del formulario y del check-in.
 */
export function PsychSection({ settings, pauseSeconds }: { settings: UserSettings; pauseSeconds: number | null }) {
  const [flags, setFlags] = useState(settings.psych);
  const [phrase, setPhrase] = useState(settings.pausePhrase === DEFAULT_PAUSE_PHRASE ? "" : settings.pausePhrase);
  const [savedPhrase, setSavedPhrase] = useState(phrase);
  const [pending, start] = useTransition();

  function persist(nextFlags: typeof flags, nextPhrase: string, message?: string) {
    const prev = flags;
    setFlags(nextFlags);
    start(async () => {
      const res = await saveUserSettings({ psych: nextFlags, pause_phrase: nextPhrase.trim() || null });
      if (!res.ok) {
        setFlags(prev);
        toast.error(res.error);
        return;
      }
      setSavedPhrase(nextPhrase);
      if (message) toast.success(message);
    });
  }

  async function toggle(key: PsychFeature, on: boolean) {
    if (key === "notifications" && on) {
      if (typeof Notification === "undefined") {
        toast.error("Este navegador no permite notificaciones.");
        return;
      }
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Sin permiso para notificaciones. Actívalo en los ajustes del navegador.");
        return;
      }
      void notify("Recordatorios activados", "Te avisaremos al empezar tu horario y al terminar tu sesión.", "racha-prueba");
    }
    persist({ ...flags, [key]: on }, phrase);
  }

  const active = PSYCH_FEATURES.filter((f) => flags[f.key]).length;

  return (
    <section id="control-mental" className="scroll-mt-32">
      <SectionHeading
        title="Control mental"
        description={`Apaga lo que no quieras ver: desaparece de la bitácora, del formulario y del check-in. Tienes ${active} de ${PSYCH_FEATURES.length} activas.`}
      />
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {PSYCH_FEATURES.map((f) => (
          <li key={f.key} className={cn("px-5 py-4", !flags[f.key] && "opacity-75")}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium">
                  {f.key === "notifications" ? (
                    <BellRingIcon className="size-4 text-muted-foreground" />
                  ) : (
                    <BrainIcon className="size-4 text-muted-foreground" />
                  )}
                  {f.title}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{f.description}</p>
                {f.key === "pause_after_loss" && flags.pause_after_loss && (
                  <p className={cn("mt-1 text-xs", pauseSeconds ? "text-subtle" : "text-warn")}>
                    {pauseSeconds
                      ? `Dura ${pauseSeconds} s: lo marca tu regla “Pausa mínima entre operaciones”.`
                      : "Activa la regla “Pausa mínima entre operaciones” para que la pausa funcione: de ahí sale la duración."}
                  </p>
                )}
                {f.key === "notifications" && flags.notifications && (
                  <p className="mt-1 text-xs text-subtle">
                    Funcionan con la app abierta o en segundo plano. Instálala en el celular (Añadir a inicio) para que lleguen mejor.
                  </p>
                )}
              </div>
              <Switch
                checked={flags[f.key]}
                disabled={pending}
                aria-label={f.title}
                onCheckedChange={(on) => void toggle(f.key, on)}
              />
            </div>

            {f.key === "pause_after_loss" && flags.pause_after_loss && (
              <form
                className="mt-3 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  persist(flags, phrase, "Frase guardada");
                }}
              >
                <label className="block space-y-1.5">
                  <span className="block text-xs font-medium text-muted-foreground">Tu frase durante la pausa</span>
                  <Textarea
                    value={phrase}
                    onChange={(e) => setPhrase(e.target.value)}
                    rows={2}
                    maxLength={280}
                    placeholder={DEFAULT_PAUSE_PHRASE}
                  />
                </label>
                {phrase !== savedPhrase && (
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={pending}>
                      Guardar frase
                    </Button>
                  </div>
                )}
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
