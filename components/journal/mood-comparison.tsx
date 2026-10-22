import { Panel } from "@/components/app/layout";
import type { MoodBucket } from "@/lib/calc/metrics";
import { ANXIETY_LABEL, type Anxiety } from "@/lib/domain/psych";
import { percent, rValue } from "@/lib/format";
import { cn } from "@/lib/utils";

const tone = (v: number | null) => (v === null || v === 0 ? "text-muted-foreground" : v > 0 ? "text-gain" : "text-loss");

function Column({ bucket, accent }: { bucket: MoodBucket; accent: "calm" | "rushed" }) {
  const rows = [
    { label: "Win rate", value: percent(bucket.winRate), className: "text-foreground" },
    { label: "R por operación", value: bucket.avgR === null ? "—" : rValue(bucket.avgR), className: tone(bucket.avgR) },
    { label: "Contra el spike", value: percent(bucket.againstPct), className: (bucket.againstPct ?? 0) > 0.2 ? "text-warn" : "text-foreground" },
    { label: "Rompió reglas", value: percent(bucket.brokenPct), className: (bucket.brokenPct ?? 0) > 0 ? "text-warn" : "text-foreground" },
  ];
  return (
    <div className={cn("rounded-lg border p-4", accent === "rushed" ? "border-warn/30 bg-warn/5" : "bg-muted/20")}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{accent === "calm" ? "Tú tranquilo" : "Tú acelerado"}</h3>
        <span className="num text-sm text-subtle">{bucket.trades} op</span>
      </div>
      {bucket.trades === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Sin operaciones en este estado este mes.</p>
      ) : (
        <dl className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-3 text-sm">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className={cn("num text-base font-semibold", r.className)}>{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** Compara cómo operas tranquilo y acelerado. Si la diferencia es grande, el problema no es la estrategia. */
export function MoodComparison({
  calm,
  rushed,
  tired,
  anxiety,
}: {
  calm: MoodBucket;
  rushed: MoodBucket;
  tired: MoodBucket;
  anxiety: MoodBucket[] | null;
}) {
  const gap = calm.avgR !== null && rushed.avgR !== null ? calm.avgR - rushed.avgR : null;
  const verdict =
    gap === null
      ? "Registra operaciones en los dos estados para ver la diferencia."
      : gap > 0
        ? `Acelerado pierdes ${rValue(gap).replace("+", "")} por operación frente a cuando estás tranquilo.`
        : "Este mes no rindes peor acelerado. Sigue registrando para confirmarlo.";
  const maxAbs = Math.max(0.5, ...(anxiety ?? []).map((b) => Math.abs(b.avgR ?? 0)));

  return (
    <Panel title="Tú acelerado vs tú tranquilo" description={verdict}>
      <div className={cn("grid gap-4", anxiety && anxiety.length > 0 ? "lg:grid-cols-[1fr_1fr_1.1fr]" : "md:grid-cols-2")}>
        <Column bucket={calm} accent="calm" />
        <Column bucket={rushed} accent="rushed" />

        {anxiety && anxiety.length > 0 && (
          <div className="rounded-lg border p-4">
            <h3 className="font-semibold">Por ansiedad al entrar</h3>
            <p className="text-xs text-subtle">R por operación según las ganas de recuperar</p>
            <ul className="mt-3 space-y-2">
              {anxiety.map((b) => {
                const r = b.avgR ?? 0;
                const w = (Math.abs(r) / maxAbs) * 50;
                return (
                  <li key={b.key} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-2 text-xs">
                    <span className="text-muted-foreground">
                      <span className="num text-foreground">{b.key}</span> · {ANXIETY_LABEL[Number(b.key) as Anxiety]}
                    </span>
                    <div className="relative h-3">
                      <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                      <div
                        className={cn("absolute inset-y-0.5 rounded-sm", r >= 0 ? "bg-gain" : "bg-loss")}
                        style={r >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
                      />
                    </div>
                    <span className={cn("num text-right", tone(b.avgR))}>{b.avgR === null ? "—" : rValue(b.avgR)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      {tired.trades > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Cansado: {tired.trades} op · {percent(tired.winRate)} win rate ·{" "}
          <span className={tone(tired.avgR)}>{tired.avgR === null ? "—" : rValue(tired.avgR)}</span> por operación.
        </p>
      )}
    </Panel>
  );
}
