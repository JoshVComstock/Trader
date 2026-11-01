import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Permite una segunda instancia local (p. ej. contra los emuladores) sin pisar la carpeta .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // El Admin SDK de Firebase se carga desde node_modules en el servidor, sin empaquetar.
  serverExternalPackages: ["firebase-admin"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
    // Volver a una página visitada hace menos de 30 s no pide nada al servidor. Cada Server Action
    // que escribe limpia esta caché, así que nunca se ve un dato viejo después de un cambio tuyo.
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
    // Iconos de lucide: solo se empaqueta lo que se usa.
    optimizePackageImports: ["lucide-react", "recharts", "date-fns"],
  },
  async headers() {
    return [
      {
        // El service worker siempre se revisa: una versión nueva llega en la próxima visita.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
