import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Racha — bitácora de trading",
    short_name: "Racha",
    description: "Registra tus operaciones de Boom y Crash y mide tu disciplina.",
    id: "/journal",
    start_url: "/journal",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#14151c",
    theme_color: "#14151c",
    lang: "es",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
