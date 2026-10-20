import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";

/**
 * Capturas en Cloudinary.
 * - Se suben como `type: "private"`: el original no tiene URL pública.
 * - Se leen con URLs firmadas que caducan (`private_download_url` con `expires_at`).
 * - El public_id es racha/{user_id}/{trade_id}/{uuid}: el servidor firma solo rutas del dueño.
 */
const ROOT = "racha";
const DELIVERY_TTL_SECONDS = 60 * 60;

export function cloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET,
  );
}

function configure() {
  if (!cloudinaryConfigured()) {
    throw new Error("Cloudinary no está configurado. Revisa CLOUDINARY_* en .env.local (ver README).");
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  return cloudinary;
}

export function tradePrefix(userId: string, tradeId: string): string {
  return `${ROOT}/${userId}/${tradeId}/`;
}

export interface SignedUpload {
  uploadUrl: string;
  fields: Record<string, string>;
  publicId: string;
}

/** Firma una subida directa del navegador a Cloudinary, atada a un public_id concreto. */
export function signUpload(userId: string, tradeId: string): SignedUpload {
  const c = configure();
  const publicId = `${tradePrefix(userId, tradeId)}${randomUUID()}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { public_id: publicId, timestamp, type: "private" };
  const signature = c.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET!);
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`,
    publicId,
    fields: {
      api_key: process.env.CLOUDINARY_API_KEY!,
      public_id: publicId,
      timestamp: String(timestamp),
      type: "private",
      signature,
    },
  };
}

/** Lee del propio Cloudinary las medidas reales del archivo subido (no se confía en el cliente). */
export async function fetchAsset(publicId: string): Promise<{ width: number; height: number; bytes: number } | null> {
  const c = configure();
  try {
    const r = (await c.api.resource(publicId, { type: "private", resource_type: "image" })) as {
      width: number;
      height: number;
      bytes: number;
    };
    return { width: r.width, height: r.height, bytes: r.bytes };
  } catch {
    return null;
  }
}

/** URL firmada y temporal para ver una captura privada. */
export function signedImageUrl(publicId: string): string | null {
  if (!cloudinaryConfigured()) return null;
  const c = configure();
  return c.utils.private_download_url(publicId, "webp", {
    type: "private",
    resource_type: "image",
    expires_at: Math.floor(Date.now() / 1000) + DELIVERY_TTL_SECONDS,
  });
}

export async function deleteAsset(publicId: string): Promise<void> {
  const c = configure();
  await c.uploader.destroy(publicId, { type: "private", resource_type: "image", invalidate: true });
}

export async function deleteTradeAssets(userId: string, tradeId: string): Promise<void> {
  if (!cloudinaryConfigured()) return;
  const c = configure();
  await c.api.delete_resources_by_prefix(tradePrefix(userId, tradeId), {
    type: "private",
    resource_type: "image",
  });
}
