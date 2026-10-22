"use client";

/**
 * Captura de pantalla desde el navegador (getDisplayMedia): eliges la pantalla o la ventana del
 * gráfico, se toma un cuadro y se corta la transmisión enseguida.
 */
export async function captureScreen(win: Window = window): Promise<Blob> {
  const media = win.navigator.mediaDevices;
  if (!media?.getDisplayMedia) {
    throw new Error("Este navegador no permite capturar la pantalla. Usa Chrome o Edge en computadora.");
  }
  const stream = await media.getDisplayMedia({
    video: { displaySurface: "monitor", frameRate: 5 },
    audio: false,
    // Que no ofrezca capturar la propia pestaña de Racha.
    selfBrowserSurface: "exclude",
  } as DisplayMediaStreamOptions);

  try {
    const track = stream.getVideoTracks()[0];
    const video = win.document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    // Un cuadro de margen para que no salga negro.
    await new Promise((r) => win.setTimeout(r, 250));
    const width = video.videoWidth || track.getSettings().width || 1920;
    const height = video.videoHeight || track.getSettings().height || 1080;
    const canvas = win.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No pudimos procesar la captura");
    ctx.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("No pudimos procesar la captura");
    return blob;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

/** Captura pendiente de adjuntar a la próxima operación que registres. */
let pending: Blob | null = null;
const listeners = new Set<() => void>();

export const pendingCapture = {
  get: () => pending,
  set(blob: Blob | null) {
    pending = blob;
    listeners.forEach((l) => l());
  },
  /** La toma y la deja vacía (al abrir el formulario). */
  take(): Blob | null {
    const b = pending;
    pending = null;
    listeners.forEach((l) => l());
    return b;
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
