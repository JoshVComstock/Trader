import { Container } from "@/components/app/layout";
import { cn } from "@/lib/utils";

function Block({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-muted/50", className)} />;
}

/**
 * Esqueleto del contenido mientras el servidor arma la página. La cabecera no se toca (vive en el
 * layout); ocupa el mismo lugar que el contenido real, así nada salta cuando llega.
 */
export function PageSkeleton({ variant = "journal" }: { variant?: "journal" | "operar" | "simple" }) {
  return (
    <div aria-busy aria-label="Cargando" className="flex-1">
      {variant !== "simple" && (
        <div className="border-b">
          <Container className="flex items-center gap-3 py-2.5">
            <Block className="h-9 w-44 rounded-lg" />
            <Block className="h-9 w-48 rounded-lg" />
            <Block className="ml-auto h-10 w-40 rounded-lg" />
          </Container>
        </div>
      )}
      <Container className="space-y-5 pt-5 sm:pt-6">
        {variant === "operar" && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_25rem] 2xl:grid-cols-[minmax(0,1fr)_28rem]">
            <div className="space-y-5">
              <Block className="h-44" />
              <Block className="h-96" />
            </div>
            <Block className="h-80" />
          </div>
        )}
        {variant === "journal" && (
          <>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Block key={i} className="h-28 rounded-none" />
              ))}
            </div>
            <Block className="h-48" />
            <Block className="h-72" />
            <Block className="h-96" />
          </>
        )}
        {variant === "simple" && (
          <>
            <Block className="h-10 w-64" />
            <Block className="h-64" />
            <Block className="h-64" />
          </>
        )}
      </Container>
    </div>
  );
}
