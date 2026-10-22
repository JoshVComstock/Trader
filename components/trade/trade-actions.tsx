"use client";

import { PencilIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteTrade, updateTrade } from "@/app/actions/trades";
import { TradeForm, type TradeFormValues } from "@/components/journal/trade-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsDesktop } from "@/hooks/use-media-query";
import { defaultPnl } from "@/lib/calc/trade";
import type { JournalTrade, Strategy } from "@/lib/data";
import type { JournalMode } from "@/lib/domain/types";
import { toLocalInput } from "@/lib/format";
import type { Rule } from "@/lib/rules";

const str = (n: number | null) => (n === null ? "" : String(n));

function toValues(t: JournalTrade): TradeFormValues {
  const expected = defaultPnl(t.outcome, t.stake, t.tp);
  return {
    id: t.id,
    account_id: t.account_id,
    result: t.outcome,
    instrument: t.instrument,
    direction: t.direction,
    stake: str(t.stake),
    strategy_id: t.strategy_id ?? "",
    mood: t.mood ?? "tranquilo",
    tp: str(t.tp),
    pnl: t.pnl !== expected ? str(t.pnl) : "",
    opened_at: toLocalInput(t.opened_at),
    closed_at: t.closed_at ? toLocalInput(t.closed_at) : "",
    note: t.note ?? "",
    checklist: t.checklist,
    anxiety: t.anxiety ? String(t.anxiety) : "",
  };
}

export function TradeActions({
  trade,
  mode,
  strategies,
  rules,
  currency,
  backHref,
}: {
  trade: JournalTrade;
  mode: JournalMode;
  strategies: Strategy[];
  rules: Rule[];
  currency: string;
  backHref: string;
}) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const form = editing && (
    <TradeForm
      mode={mode}
      initial={toValues(trade)}
      editing
      strategies={strategies}
      rules={rules}
      balance={0}
      currency={currency}
      sessionTrades={() => ({ trades: [], openedAt: null })}
      sessionOpenedAt={null}
      showShortcuts={isDesktop}
      onCancel={() => setEditing(false)}
      onSubmit={(payload) =>
        start(async () => {
          const res = await updateTrade(payload);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Cambios guardados");
          setEditing(false);
          router.refresh();
        })
      }
    />
  );

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setEditing(true)} disabled={pending}>
        <PencilIcon />
        Editar
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => setConfirming(true)} aria-label="Borrar operación">
        <Trash2Icon />
      </Button>

      {isDesktop ? (
        <Dialog open={editing} onOpenChange={setEditing}>
          <DialogContent className="flex max-h-[min(94vh,60rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
            <DialogHeader className="border-b px-6 pt-5 pb-4">
              <DialogTitle>Corregir operación</DialogTitle>
              <DialogDescription>Se recalculan R, resultado y spike. Las reglas no se vuelven a evaluar.</DialogDescription>
            </DialogHeader>
            {form}
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet open={editing} onOpenChange={setEditing}>
          <SheetContent side="bottom" className="flex max-h-[94svh] flex-col gap-0 rounded-t-2xl p-0">
            <SheetHeader className="px-4 pt-4 pb-2">
              <SheetTitle>Corregir operación</SheetTitle>
            </SheetHeader>
            {form}
          </SheetContent>
        </Sheet>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Borrar esta operación?</DialogTitle>
            <DialogDescription>
              Se borran también sus capturas. Las violaciones de reglas quedan registradas en la sesión.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await deleteTrade(trade.id);
                  if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success("Operación borrada");
                  router.replace(backHref);
                })
              }
            >
              Borrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
