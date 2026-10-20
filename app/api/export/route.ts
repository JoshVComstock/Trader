import { NextResponse, type NextRequest } from "next/server";
import { instrumentLabel } from "@/lib/domain/instruments";
import { inLaPaz } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const HEADER = [
  "id",
  "cuenta",
  "tipo_cuenta",
  "fecha_sesion",
  "apertura_la_paz",
  "cierre_la_paz",
  "indice",
  "direccion",
  "a_favor_del_spike",
  "stake",
  "tp",
  "pnl",
  "r",
  "resultado",
  "estado_mental",
  "estrategia",
  "dentro_del_plan",
  "movio_sl",
  "impulso",
  "violaciones",
  "nota",
];

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Exporta las operaciones a CSV. Necesita una ruta: un Server Action no puede devolver una descarga. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const accountId = request.nextUrl.searchParams.get("cuenta");
  let query = supabase
    .from("trades")
    .select(
      "id, opened_at, closed_at, instrument, direction, with_spike, stake, tp, pnl, r_multiple, outcome, mood, in_plan, moved_sl, checklist, note, accounts!inner(label, kind), sessions!inner(date), strategies(name), rule_violations(count)",
    )
    .order("opened_at");
  if (accountId) query = query.eq("account_id", accountId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "No pudimos exportar" }, { status: 500 });

  const rows = data.map((t) => {
    const checklist = (t.checklist ?? {}) as Record<string, unknown>;
    return [
      t.id,
      t.accounts.label,
      t.accounts.kind,
      t.sessions.date,
      inLaPaz(t.opened_at, "yyyy-MM-dd HH:mm:ss"),
      t.closed_at ? inLaPaz(t.closed_at, "yyyy-MM-dd HH:mm:ss") : "",
      instrumentLabel(t.instrument),
      t.direction === "buy" ? "compra" : "venta",
      t.with_spike ? "si" : "no",
      t.stake,
      t.tp,
      t.pnl,
      t.r_multiple,
      t.outcome === "win" ? "ganada" : t.outcome === "loss" ? "perdida" : "empate",
      t.mood,
      t.strategies?.name,
      t.in_plan ? "si" : "no",
      t.moved_sl ? "si" : "no",
      checklist.impulse === true ? "si" : "no",
      t.rule_violations[0]?.count ?? 0,
      t.note,
    ]
      .map(cell)
      .join(",");
  });

  // BOM para que Excel abra bien los acentos.
  const csv = `﻿${HEADER.join(",")}\n${rows.join("\n")}\n`;
  const stamp = inLaPaz(new Date(), "yyyy-MM-dd");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="racha-operaciones-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
