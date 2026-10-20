"use client";

import { prepareUpload, saveAttachment } from "@/app/actions/attachments";
import { compressToWebp } from "@/lib/image";

export interface UploadedShot {
  id: string;
  url: string | null;
  width: number;
  height: number;
}

/** Comprime, sube directo a Cloudinary con una firma del servidor y registra la captura. */
export async function uploadScreenshot(tradeId: string, file: Blob): Promise<UploadedShot> {
  if (!file.type.startsWith("image/")) throw new Error("El archivo no es una imagen");
  const { blob } = await compressToWebp(file);

  const signed = await prepareUpload(tradeId);
  if (!signed.ok) throw new Error(signed.error);

  const form = new FormData();
  for (const [k, v] of Object.entries(signed.data.fields)) form.append(k, v);
  form.append("file", blob, "captura.webp");

  const res = await fetch(signed.data.uploadUrl, { method: "POST", body: form });
  if (!res.ok) throw new Error("Cloudinary rechazó la captura. Reintenta.");
  const body = (await res.json()) as { public_id: string; width: number; height: number; bytes: number };

  const saved = await saveAttachment({
    trade_id: tradeId,
    public_id: body.public_id,
    width: body.width,
    height: body.height,
    bytes: body.bytes,
  });
  if (!saved.ok) throw new Error(saved.error);
  return saved.data;
}
