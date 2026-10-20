"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { closeSession } from "@/app/actions/sessions";
import { Choice, FieldLabel } from "@/components/app/choice";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { Session } from "@/lib/data";

export function CloseSessionDialog({
  open,
  onOpenChange,
  session,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: Session;
}) {
  const [followed, setFollowed] = useState<boolean | null>(session.followed_plan);
  const [journal, setJournal] = useState(session.journal ?? "");
  const [pending, start] = useTransition();
  const blocked = session.status === "blocked";

  function submit() {
    if (followed === null) {
      toast.error("Contesta si seguiste tu plan");
      return;
    }
    start(async () => {
      const res = await closeSession({ session_id: session.id, followed_plan: followed, journal: journal.trim() || null });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(blocked ? "Reflexión guardada" : "Sesión cerrada");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{blocked ? "Reflexión del día" : "Cerrar la sesión"}</DialogTitle>
          <DialogDescription>Lo que escribas hoy es lo que vas a leer cuando quieras saltarte una regla.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div>
            <FieldLabel>¿Seguiste tu plan?</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              <Choice selected={followed === true} className="h-11" onClick={() => setFollowed(true)}>
                Sí
              </Choice>
              <Choice selected={followed === false} className="h-11" onClick={() => setFollowed(false)}>
                No
              </Choice>
            </div>
          </div>
          <div>
            <FieldLabel>Qué te llevas de hoy</FieldLabel>
            <Textarea value={journal} onChange={(e) => setJournal(e.target.value)} rows={4} placeholder="Una o dos frases bastan" />
          </div>
        </div>
        <DialogFooter>
          <Button className="h-11 w-full sm:w-auto" onClick={submit} disabled={pending}>
            {pending ? "Guardando…" : blocked ? "Guardar" : "Cerrar sesión"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
