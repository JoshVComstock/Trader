"use client";

import { cn } from "@/lib/utils";
import { CameraIcon, ImagePlusIcon, LoaderIcon, Trash2Icon } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { removeAttachment } from "@/app/actions/attachments";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { imageFromClipboard } from "@/lib/image";
import { uploadScreenshot } from "@/lib/upload";
import { AnnotatorDialog } from "@/components/float/annotator";
import { captureScreen } from "@/components/float/capture";

interface Shot {
  id: string;
  url: string | null;
  width: number;
  height: number;
}

export function AttachmentsPanel({ tradeId, initial, enabled }: { tradeId: string; initial: Shot[]; enabled: boolean }) {
  const router = useRouter();
  const [shots, setShots] = useState(initial);
  const [uploading, setUploading] = useState(0);
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState<Shot | null>(null);
  const [removing, startRemove] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const [captured, setCaptured] = useState<Blob | null>(null);

  function capture() {
    captureScreen().then(setCaptured, (e: unknown) => {
      if (e instanceof DOMException && e.name === "NotAllowedError") return;
      toast.error(e instanceof Error ? e.message : "No pudimos capturar la pantalla");
    });
  }

  async function upload(files: Blob[]) {
    if (!enabled) {
      toast.error("Configura Cloudinary para subir capturas (ver README).");
      return;
    }
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    setUploading((n) => n + images.length);
    for (const f of images) {
      try {
        const shot = await uploadScreenshot(tradeId, f);
        setShots((list) => [...list, shot]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No pudimos subir la captura");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    router.refresh();
  }

  // Ctrl+V en cualquier parte de la página.
  const uploadRef = useRef(upload);
  useEffect(() => {
    uploadRef.current = upload;
  });
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      const img = imageFromClipboard(e);
      if (img) {
        e.preventDefault();
        void uploadRef.current([img]);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  function remove(shot: Shot) {
    startRemove(async () => {
      const res = await removeAttachment(shot.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setShots((list) => list.filter((s) => s.id !== shot.id));
      setOpen(null);
      router.refresh();
    });
  }

  return (
    <section
      className={cn("rounded-xl border bg-card px-4 py-4 sm:px-5", over && "border-brand")}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void upload([...e.dataTransfer.files]);
      }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Capturas</h2>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={capture} title="Capturar la pantalla y dibujar encima">
            <CameraIcon />
            Capturar pantalla
          </Button>
          {shots.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
              <ImagePlusIcon />
              Añadir
            </Button>
          )}
        </div>
      </div>

      {shots.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {shots.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setOpen(s)}
              className="relative aspect-video overflow-hidden rounded-lg border bg-muted"
              aria-label="Ver captura"
            >
              {s.url ? (
                <Image src={s.url} alt="Captura de la operación" fill unoptimized sizes="(min-width: 640px) 33vw, 50vw" className="object-cover" />
              ) : (
                <span className="text-xs text-muted-foreground">Sin acceso a Cloudinary</span>
              )}
            </button>
          ))}
          {Array.from({ length: uploading }, (_, i) => (
            <div key={`up-${i}`} className="flex aspect-video items-center justify-center rounded-lg border border-dashed">
              <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
            </div>
          ))}
        </div>
      )}

      {shots.length === 0 && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-6 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {uploading > 0 ? <LoaderIcon className="size-4 animate-spin" /> : <ImagePlusIcon className="size-4" />}
          {uploading > 0 ? "Subiendo…" : "Arrastra, pega (Ctrl+V) o elige la captura del gráfico"}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          void upload([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />

      <AnnotatorDialog
        image={captured}
        onClose={() => setCaptured(null)}
        primary={{ label: "Adjuntar a esta operación", run: (blob) => upload([blob]) }}
      />

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-[min(96vw,80rem)] p-2 sm:max-w-[min(96vw,80rem)]">
          <DialogTitle className="sr-only">Captura</DialogTitle>
          {open?.url && (
            <div className="relative w-full" style={{ aspectRatio: `${open.width} / ${open.height}` }}>
              <Image src={open.url} alt="Captura de la operación" fill unoptimized sizes="96vw" className="rounded-lg object-contain" />
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="destructive" size="sm" disabled={removing} onClick={() => open && remove(open)}>
              <Trash2Icon />
              Borrar captura
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
