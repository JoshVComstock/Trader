import { AppHeader } from "@/components/app/app-header";

/**
 * Páginas con sesión. La cabecera vive aquí, en el layout: al navegar entre secciones se queda
 * quieta y solo carga el contenido (con su esqueleto).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      {children}
    </div>
  );
}
