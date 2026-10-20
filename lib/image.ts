/** Comprime una imagen en el navegador: WebP, máximo 1600 px de ancho. */
export async function compressToWebp(
  file: Blob,
  { maxWidth = 1600, quality = 0.85 }: { maxWidth?: number; quality?: number } = {},
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador no puede procesar imágenes");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (!blob) throw new Error("No pudimos comprimir la imagen");
  return { blob, width, height };
}

/** Saca la primera imagen de un evento de pegar (Ctrl+V). */
export function imageFromClipboard(event: { clipboardData: DataTransfer | null }): File | null {
  const items = event.clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.kind === "file" && item.type.startsWith("image/")) return item.getAsFile();
  }
  return null;
}
