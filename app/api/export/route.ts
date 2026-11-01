import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db/admin";
import { listAccounts, listStrategies } from "@/lib/db/queries";
import { refs, type TradeDoc } from "@/lib/db/schema";
import { instrumentLabel } from "@/lib/domain/instruments";
import { inLaPaz } from "@/lib/format";

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
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const accountId = request.nextUrl.searchParams.get("cuenta");
  const col = refs(db(), user.uid).trades;
  const [snap, accounts, strategies] = await Promise.all([
    (accountId ? col.where("account_id", "==", accountId) : col).get(),
    listAccounts(user.uid),
    listStrategies(user.uid),
  ]).catch(() => [null, [], []] as const);
  if (!snap) return NextResponse.json({ error: "No pudimos exportar" }, { status: 500 });

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const strategyName = new Map(strategies.map((s) => [s.id, s.name]));
  const trades = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as TradeDoc) }))
    .sort((a, b) => a.opened_at.localeCompare(b.opened_at));

  const rows = trades.map((t) => {
    const account = accountById.get(t.account_id);
    return [
      t.id,
      account?.label,
      account?.kind,
      t.session_date,
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
      t.strategy_id ? strategyName.get(t.strategy_id) : "",
      t.in_plan ? "si" : "no",
      t.moved_sl ? "si" : "no",
      t.checklist?.impulse === true ? "si" : "no",
      t.violations?.length ?? 0,
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
