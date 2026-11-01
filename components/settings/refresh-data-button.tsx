"use client";

import { RefreshCwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { refreshMyData } from "@/app/actions/cache";
import { Button } from "@/components/ui/button";

/** Vuelve a leer todo de Firestore (después de un seed o una migración). */
export function RefreshDataButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await refreshMyData();
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          router.refresh();
          toast.success("Datos actualizados");
        })
      }
    >
      <RefreshCwIcon className={pending ? "animate-spin" : undefined} />
      Volver a leer mis datos
    </Button>
  );
}
