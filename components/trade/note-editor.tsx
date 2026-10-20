"use client";

import { PencilIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateTradeNote } from "@/app/actions/trades";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** La nota se escribe ahí mismo: nunca un bloque vacío decorativo. */
export function NoteEditor({ tradeId, initial }: { tradeId: string; initial: string | null }) {
  const [note, setNote] = useState(initial ?? "");
  const [saved, setSaved] = useState(initial ?? "");
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await updateTradeNote({ trade_id: tradeId, note: note.trim() || null });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSaved(note.trim());
      setEditing(false);
      toast.success("Nota guardada");
    });
  }

  return (
    <section className="rounded-xl border bg-card px-4 py-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Nota</h2>
        {!editing && saved && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <PencilIcon />
            Editar
          </Button>
        )}
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            autoFocus
            placeholder="Qué viste, qué sentiste, qué harías distinto"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
              if (e.key === "Escape") {
                setNote(saved);
                setEditing(false);
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setNote(saved);
                setEditing(false);
              }}
            >
              Cancelar
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? "Guardando…" : "Guardar nota"}
            </Button>
          </div>
        </div>
      ) : saved ? (
        <p className="mt-2 text-sm whitespace-pre-wrap">{saved}</p>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <PencilIcon className="size-4" />
          Escribe qué pasó en esta operación. Dentro de un mes es lo que más vas a agradecer.
        </button>
      )}
    </section>
  );
}
