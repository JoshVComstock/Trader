import { fromLocal } from "@/lib/time-core";

/** "2026-10-20T09:15" (hora de La Paz) → ISO UTC. Devuelve null si está vacío o es inválido. */
export function fromLocalInput(value: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  if (!m) return null;
  return fromLocal(m[1], m[2]).toISOString();
}
