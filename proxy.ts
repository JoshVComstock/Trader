import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Todo menos estáticos, imágenes, íconos, manifest y service worker.
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|pwa-icon|manifest.webmanifest|sw.js|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
