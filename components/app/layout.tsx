import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Bloques de maquetación compartidos. Todas las páginas usan el mismo ancho y las mismas tarjetas,
 * así cambiar el espaciado o el ancho se hace en un solo lugar.
 */

/** Ancho de página: aprovecha pantallas grandes sin dejar márgenes enormes a los lados. */
export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8", className)} {...props} />;
}

/** Contenido principal de una página. */
export function PageMain({ className, ...props }: ComponentProps<"div">) {
  return (
    <main className="flex-1">
      <Container className={cn("space-y-5 pt-5 pb-28 sm:space-y-6 sm:pt-6 sm:pb-14", className)} {...props} />
    </main>
  );
}

/** Título de página con descripción y acciones a la derecha. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="text-sm text-muted-foreground sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Tarjeta con encabezado. La usan todos los bloques del journal, el detalle y los ajustes. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  id,
  "aria-label": ariaLabel,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const hasHeader = title || description || actions;
  return (
    <section id={id} aria-label={ariaLabel} className={cn("min-w-0 scroll-mt-32 rounded-xl border bg-card", className)}>
      {hasHeader && (
        <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-4 pt-4 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className={cn("px-4 pt-3 pb-4 sm:px-5 sm:pb-5", !hasHeader && "pt-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Texto de estado vacío que enseña a usar el producto. */
export function EmptyHint({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 text-sm text-muted-foreground">
      <p>{children}</p>
      {action}
    </div>
  );
}
