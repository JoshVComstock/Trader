import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseEnv } from "@/lib/env";
import type { Database } from "./database.types";

const PUBLIC_PATHS = ["/login", "/auth"];

/** Refresca la sesión en cada petición y manda al login a quien no la tenga. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseEnv();

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // No pongas código entre createServerClient y getUser: rompe el refresco de sesión.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    if (path !== "/") to.searchParams.set("next", path);
    return NextResponse.redirect(to);
  }

  if (user && path === "/login") {
    const to = request.nextUrl.clone();
    to.pathname = "/journal";
    to.search = "";
    return NextResponse.redirect(to);
  }

  return response;
}
