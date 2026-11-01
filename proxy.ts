import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-cookie";

const PUBLIC_PATHS = ["/login"];

/**
 * Filtro rápido: sin cookie de sesión, al login. No verifica la firma (eso lo hace cada página
 * con `requireUser`, en el servidor y sin red): así el proxy no agrega latencia a cada petición.
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  if (isPublic || request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const to = request.nextUrl.clone();
  to.pathname = "/login";
  to.search = "";
  if (path !== "/") to.searchParams.set("next", path);
  return NextResponse.redirect(to);
}

export const config = {
  matcher: [
    // Todo menos estáticos, imágenes, íconos, manifest y service worker.
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|pwa-icon|manifest.webmanifest|sw.js|offline|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
