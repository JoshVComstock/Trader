"use client";

import {
  CameraIcon,
  DownloadIcon,
  MinusIcon,
  MoveDiagonalIcon,
  PaperclipIcon,
  PencilIcon,
  RectangleHorizontalIcon,
  SeparatorVerticalIcon,
  TypeIcon,
  Undo2Icon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { isStream } from "./capture";

type Point = [number, number];
type Tool = "pen" | "hline" | "vline" | "line" | "rect" | "text";

type Shape =
  | { tool: "pen"; color: string; size: number; points: Point[] }
  | { tool: "line" | "rect"; color: string; size: number; a: Point; b: Point }
  | { tool: "hline"; color: string; size: number; y: number }
  | { tool: "vline"; color: string; size: number; x: number }
  | { tool: "text"; color: string; size: number; at: Point; text: string };

/** Colores de dibujo sobre el gráfico (contenido del usuario, no de la interfaz). */
const INK = [
  { name: "Rojo", value: "#ff4d4f" },
  { name: "Verde", value: "#22c55e" },
  { name: "Amarillo", value: "#facc15" },
  { name: "Azul", value: "#3b82f6" },
  { name: "Violeta", value: "#a78bfa" },
  { name: "Blanco", value: "#ffffff" },
  { name: "Negro", value: "#111111" },
] as const;

const TOOLS: { key: Tool; label: string; icon: typeof PencilIcon; shortcut: string }[] = [
  { key: "pen", label: "Lápiz", icon: PencilIcon, shortcut: "L" },
  { key: "hline", label: "Línea horizontal", icon: MinusIcon, shortcut: "H" },
  { key: "vline", label: "Línea vertical", icon: SeparatorVerticalIcon, shortcut: "V" },
  { key: "line", label: "Línea diagonal", icon: MoveDiagonalIcon, shortcut: "D" },
  { key: "rect", label: "Cuadrado", icon: RectangleHorizontalIcon, shortcut: "C" },
  { key: "text", label: "Texto", icon: TypeIcon, shortcut: "T" },
];

const SIZES = [2, 4, 8];

function drawShape(ctx: CanvasRenderingContext2D, s: Shape, scale: number, w: number, h: number) {
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.size * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  switch (s.tool) {
    case "pen":
      s.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
      break;
    case "line":
      ctx.moveTo(...s.a);
      ctx.lineTo(...s.b);
      ctx.stroke();
      break;
    case "rect":
      ctx.strokeRect(Math.min(s.a[0], s.b[0]), Math.min(s.a[1], s.b[1]), Math.abs(s.b[0] - s.a[0]), Math.abs(s.b[1] - s.a[1]));
      break;
    case "hline":
      ctx.setLineDash([12 * scale, 6 * scale]);
      ctx.moveTo(0, s.y);
      ctx.lineTo(w, s.y);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    case "vline":
      ctx.setLineDash([12 * scale, 6 * scale]);
      ctx.moveTo(s.x, 0);
      ctx.lineTo(s.x, h);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    case "text": {
      const px = Math.round((14 + s.size * 3) * scale);
      ctx.font = `600 ${px}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textBaseline = "top";
      // Contorno oscuro para que se lea sobre cualquier vela.
      ctx.lineWidth = Math.max(2, px / 6);
      ctx.strokeStyle = "rgba(0,0,0,0.65)";
      ctx.strokeText(s.text, s.at[0], s.at[1]);
      ctx.fillText(s.text, s.at[0], s.at[1]);
      break;
    }
  }
}

type Frame = { el: CanvasImageSource; w: number; h: number };

/**
 * Dibujo tipo Epic Pen: lápiz, líneas horizontales, verticales y diagonales, cuadrados y texto.
 * Con una transmisión de pantalla (MediaStream) dibujas EN VIVO, con las velas moviéndose debajo;
 * "Tomar captura" congela ese instante con tus dibujos. Con una imagen (Blob) dibujas sobre ella.
 * El navegador no puede dibujar encima de otras aplicaciones: se dibuja sobre su espejo en Racha.
 */
export function AnnotatorDialog({
  source,
  onClose,
  onCaptured,
  onAttachNext,
  attachTargets = [],
  onAttachTo,
  primary,
}: {
  /** Pantalla en vivo o imagen ya tomada. */
  source: MediaStream | Blob | null;
  onClose: () => void;
  /** Al tomar la captura en vivo: la imagen (cuadro + dibujos) queda lista. */
  onCaptured?: (blob: Blob) => void;
  /** Guardar para la próxima operación que se registre. */
  onAttachNext?: (blob: Blob) => void;
  /** Operaciones ya registradas a las que se puede adjuntar. */
  attachTargets?: { id: string; label: string }[];
  onAttachTo?: (tradeId: string, blob: Blob) => Promise<void> | void;
  /** Acción principal propia (ej. "Adjuntar a esta operación" en el detalle). */
  primary?: { label: string; run: (blob: Blob) => Promise<void> | void };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // El <video> vive dentro del diálogo, que se monta después: se conecta cuando aparece.
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoEl(el);
  }, []);
  /** Imagen de fondo: la captura congelada o la imagen recibida. Null mientras está en vivo. */
  const [img, setImg] = useState<Frame | null>(null);
  /** Tamaño de la transmisión en vivo. */
  const [liveSize, setLiveSize] = useState<{ w: number; h: number } | null>(null);
  const stream = isStream(source) ? source : null;
  const live = stream !== null && img === null;
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(INK[0].value);
  const [size, setSize] = useState(4);
  const [textAt, setTextAt] = useState<{ img: Point; screen: Point } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  // Imagen recibida: se carga como fondo.
  useEffect(() => {
    if (!(source instanceof Blob)) return;
    const url = URL.createObjectURL(source);
    const el = new Image();
    el.onload = () => setImg({ el, w: el.naturalWidth, h: el.naturalHeight });
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [source]);

  // Pantalla en vivo: se conecta al <video>. Al cerrar o congelar, se corta la transmisión.
  useEffect(() => {
    const video = videoEl;
    if (!stream || !video) return;
    video.srcObject = stream;
    const onMeta = () => setLiveSize({ w: video.videoWidth, h: video.videoHeight });
    video.addEventListener("loadedmetadata", onMeta);
    void video.play().catch(() => undefined);
    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
    };
  }, [stream, videoEl]);

  // Al cerrar el editor (o cambiar de fuente), se corta la transmisión.
  useEffect(() => {
    if (!stream) return;
    return () => stream.getTracks().forEach((t) => t.stop());
  }, [stream]);

  const size2d = useMemo(() => (img ? { w: img.w, h: img.h } : liveSize), [img, liveSize]);
  const scale = size2d ? Math.max(1, size2d.w / 1400) : 1;

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size2d) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = size2d.w;
    canvas.height = size2d.h;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (img) ctx.drawImage(img.el, 0, 0);
    for (const s of draft ? [...shapes, draft] : shapes) drawShape(ctx, s, scale, canvas.width, canvas.height);
  }, [img, size2d, shapes, draft, scale]);

  useEffect(render, [render]);

  function toImage(e: PointerEvent<HTMLCanvasElement>): Point {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return [((e.clientX - rect.left) * canvas.width) / rect.width, ((e.clientY - rect.top) * canvas.height) / rect.height];
  }

  function onDown(e: PointerEvent<HTMLCanvasElement>) {
    if (!size2d) return;
    const p = toImage(e);
    if (tool === "text") {
      const wrap = e.currentTarget.parentElement!.getBoundingClientRect();
      setTextAt({ img: p, screen: [e.clientX - wrap.left, e.clientY - wrap.top] });
      setText("");
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Algunos punteros (lápices, eventos sintéticos) no admiten captura: se dibuja igual.
    }
    if (tool === "pen") setDraft({ tool, color, size, points: [p] });
    else if (tool === "hline") setDraft({ tool, color, size, y: p[1] });
    else if (tool === "vline") setDraft({ tool, color, size, x: p[0] });
    else setDraft({ tool, color, size, a: p, b: p });
  }

  function onMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!draft) return;
    const p = toImage(e);
    if (draft.tool === "pen") setDraft({ ...draft, points: [...draft.points, p] });
    else if (draft.tool === "hline") setDraft({ ...draft, y: p[1] });
    else if (draft.tool === "vline") setDraft({ ...draft, x: p[0] });
    else if (draft.tool === "line" || draft.tool === "rect") setDraft({ ...draft, b: p });
  }

  function onUp() {
    if (draft) setShapes((list) => [...list, draft]);
    setDraft(null);
  }

  function commitText() {
    if (textAt && text.trim()) setShapes((list) => [...list, { tool: "text", color, size, at: textAt.img, text: text.trim() }]);
    setTextAt(null);
    setText("");
  }

  // Atajos: L H V D C T para herramientas, Ctrl+Z deshacer.
  const freezeRef = useRef(freeze);
  useEffect(() => {
    freezeRef.current = freeze;
  });
  // Si dejas de compartir desde la barra del navegador, se queda con el último cuadro.
  useEffect(() => {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    const onEnded = () => {
      if (videoRef.current?.srcObject) void freezeRef.current();
    };
    track.addEventListener("ended", onEnded);
    return () => track.removeEventListener("ended", onEnded);
  }, [stream]);

  useEffect(() => {
    if (!source) return;
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === " " && videoRef.current?.srcObject) {
        e.preventDefault();
        void freezeRef.current();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setShapes((list) => list.slice(0, -1));
        return;
      }
      const t = TOOLS.find((x) => x.shortcut === e.key.toUpperCase());
      if (t && !e.ctrlKey && !e.metaKey) setTool(t.key);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [source]);

  /** Congela el cuadro actual de la pantalla en vivo con tus dibujos encima. */
  async function freeze() {
    const video = videoRef.current;
    if (!video || !liveSize) return;
    const frame = document.createElement("canvas");
    frame.width = liveSize.w;
    frame.height = liveSize.h;
    frame.getContext("2d")?.drawImage(video, 0, 0, liveSize.w, liveSize.h);
    video.srcObject = null;
    stream?.getTracks().forEach((t) => t.stop());
    setImg({ el: frame, w: liveSize.w, h: liveSize.h });
    // La imagen final se arma aparte (cuadro + dibujos): funciona aunque la pestaña esté en segundo plano.
    const out = document.createElement("canvas");
    out.width = liveSize.w;
    out.height = liveSize.h;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(frame, 0, 0);
    for (const s of shapes) drawShape(ctx, s, scale, out.width, out.height);
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/webp", 0.92));
    if (blob) onCaptured?.(blob);
  }

  async function exportBlob(): Promise<Blob> {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Sin imagen");
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
    if (!blob) throw new Error("No pudimos exportar la imagen");
    return blob;
  }

  async function run(fn: (blob: Blob) => Promise<void> | void) {
    setBusy(true);
    try {
      await fn(await exportBlob());
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    stream?.getTracks().forEach((t) => t.stop());
    setShapes([]);
    setDraft(null);
    setTextAt(null);
    setImg(null);
    setLiveSize(null);
    onClose();
  }

  return (
    <Dialog open={source !== null} onOpenChange={(o) => !o && reset()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[94vh] max-w-[98vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[98vw]"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">{live ? "Dibujar sobre tu pantalla en vivo" : "Dibujar sobre la captura"}</DialogTitle>
        <DialogDescription className="sr-only">Lápiz, líneas, cuadrados y texto sobre tu captura de pantalla.</DialogDescription>

        {/* Barra de herramientas */}
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <div className="flex rounded-lg border p-0.5" role="radiogroup" aria-label="Herramienta">
            {TOOLS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="radio"
                aria-checked={tool === t.key}
                title={`${t.label} (${t.shortcut})`}
                onClick={() => setTool(t.key)}
                className={cn(
                  "flex size-9 items-center justify-center rounded-md transition-colors",
                  tool === t.key ? "bg-brand/20 text-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <t.icon className="size-4" />
                <span className="sr-only">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1" role="radiogroup" aria-label="Color">
            {INK.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={color === c.value}
                title={c.name}
                onClick={() => setColor(c.value)}
                className={cn("size-7 rounded-full border-2", color === c.value ? "border-foreground" : "border-transparent")}
                style={{ backgroundColor: c.value }}
              >
                <span className="sr-only">{c.name}</span>
              </button>
            ))}
          </div>

          <div className="flex rounded-lg border p-0.5" role="radiogroup" aria-label="Grosor">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={size === s}
                title={`Grosor ${s}`}
                onClick={() => setSize(s)}
                className={cn("flex size-9 items-center justify-center rounded-md", size === s ? "bg-muted" : "hover:bg-muted/60")}
              >
                <span className="rounded-full bg-foreground" style={{ width: s + 4, height: s + 4 }} />
              </button>
            ))}
          </div>

          <Button variant="ghost" size="sm" onClick={() => setShapes((l) => l.slice(0, -1))} disabled={!shapes.length} title="Deshacer (Ctrl+Z)">
            <Undo2Icon />
            Deshacer
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShapes([])} disabled={!shapes.length}>
            <Trash2Icon />
            Limpiar
          </Button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {live && (
              <>
                <span className="flex items-center gap-1.5 rounded-md bg-loss/15 px-2 py-1 text-xs font-medium text-loss">
                  <span className="size-2 animate-pulse rounded-full bg-loss" />
                  En vivo
                </span>
                <Button size="sm" onClick={() => void freeze()} disabled={!liveSize} title="Congela este instante con tus dibujos (Espacio)">
                  <CameraIcon />
                  Tomar captura
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || !img || live}
              onClick={() =>
                run((blob) => {
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `racha-captura-${Date.now()}.webp`;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                })
              }
            >
              <DownloadIcon />
              Descargar
            </Button>
            {onAttachTo && attachTargets.length > 0 && (
              <select
                className="h-8 rounded-lg border bg-transparent px-2 text-sm dark:bg-input/30"
                defaultValue=""
                disabled={busy || !img || live}
                aria-label="Adjuntar a una operación ya registrada"
                onChange={(e) => {
                  const id = e.target.value;
                  e.target.value = "";
                  if (id) void run(async (blob) => {
                    await onAttachTo(id, blob);
                    reset();
                  });
                }}
              >
                <option value="" disabled>
                  Adjuntar a una operación…
                </option>
                {attachTargets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
            {primary && (
              <Button
                size="sm"
                disabled={busy || !img || live}
                onClick={() =>
                  run(async (blob) => {
                    await primary.run(blob);
                    reset();
                  })
                }
              >
                <PaperclipIcon />
                {primary.label}
              </Button>
            )}
            {onAttachNext && (
              <Button
                size="sm"
                disabled={busy || !img || live}
                onClick={() =>
                  run((blob) => {
                    onAttachNext(blob);
                    reset();
                  })
                }
              >
                <PaperclipIcon />
                Usar en la próxima operación
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={reset}>
              Cerrar
            </Button>
          </div>
        </div>

        {/* Lienzo */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black/80 p-3">
          {!size2d && <p className="text-sm text-muted-foreground">{stream ? "Conectando con tu pantalla…" : "Cargando captura…"}</p>}
          <div className="relative max-h-full max-w-full">
            {stream && (
              <video
                ref={attachVideo}
                muted
                playsInline
                className={cn("block max-h-[calc(94vh-5rem)] max-w-full", !live && "hidden")}
              />
            )}
            <canvas
              ref={canvasRef}
              className={cn(
                "touch-none",
                live ? "absolute inset-0 h-full w-full" : "block max-h-[calc(94vh-5rem)] max-w-full",
                tool === "text" ? "cursor-text" : "cursor-crosshair",
              )}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            />
            {textAt && (
              <input
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitText();
                  if (e.key === "Escape") setTextAt(null);
                }}
                onBlur={commitText}
                placeholder="Escribe y Enter"
                className="absolute min-w-40 rounded border border-white/40 bg-black/70 px-2 py-1 text-sm text-white outline-none"
                style={{ left: textAt.screen[0], top: textAt.screen[1], color }}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
