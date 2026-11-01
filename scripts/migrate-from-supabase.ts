/**
 * Copia tus datos de Supabase a Firebase (una vez, al cambiar de base).
 *
 *   pnpm migrate:supabase -- --email tu@email.com
 *
 * Necesita en .env.local las variables de Firebase y, además, las de la base vieja:
 *   SUPABASE_URL, SUPABASE_SECRET_KEY
 *
 * Busca tu usuario por email en las dos. En Firebase tiene que existir: entra una vez a la app
 * nueva con "Crear cuenta" (mismo email) y después corre esto. Copia cuentas, estrategias,
 * reglas, control mental, sesiones, operaciones (con violaciones y capturas), revisiones y
 * observaciones, y recalcula el resumen de cada día y el balance de cada cuenta.
 * Se puede correr más de una vez: usa los mismos ids, así que pisa en vez de duplicar.
 */
import { createClient } from "@supabase/supabase-js";
import { computeDayMetrics } from "../lib/calc/daily";
import { round } from "../lib/calc/trade";
import { adminAuth, db } from "../lib/db/admin";
import { ensureUserProfile } from "../lib/db/bootstrap";
import {
  refs,
  sessionId,
  type AccountDoc,
  type ObservationDoc,
  type SessionDoc,
  type StrategyDoc,
  type TradeDoc,
  type WeeklyReviewDoc,
} from "../lib/db/schema";
import { writeAll, type Write } from "./firestore-utils";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) {
  console.error("Faltan SUPABASE_URL y SUPABASE_SECRET_KEY en .env.local");
  process.exit(1);
}
const sb = createClient(url, secret, { auth: { persistSession: false } });

const n = (v: unknown): number => Number(v ?? 0);
const nOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const iso = (v: string | null): string | null => (v ? new Date(v).toISOString() : null);

async function rows<T>(table: string, userId: string, columns = "*"): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(columns).eq("user_id", userId).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data as T[]));
    if (data.length < 1000) return out;
  }
}

async function supabaseUserId(email: string): Promise<string> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`No existe ${email} en Supabase`);
}

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function main() {
  const email = arg("email");
  if (!email) throw new Error("Indica --email");

  const sbUser = await supabaseUserId(email);
  const fbUser = await adminAuth()
    .getUserByEmail(email)
    .catch(() => {
      throw new Error(`No existe ${email} en Firebase. Crea la cuenta en la app nueva y vuelve a correr esto.`);
    });
  const uid = fbUser.uid;
  await ensureUserProfile(uid, email);
  const r = refs(db(), uid);

  const [accounts, strategies, rules, settings, sessions, trades, violations, attachments, reviews, observations] =
    await Promise.all([
      rows<Row>("accounts", sbUser),
      rows<Row>("strategies", sbUser),
      rows<Row>("rules", sbUser),
      rows<Row>("user_settings", sbUser),
      rows<Row>("sessions", sbUser),
      rows<Row>("trades", sbUser),
      rows<Row>("rule_violations", sbUser),
      rows<Row>("attachments", sbUser),
      rows<Row>("weekly_reviews", sbUser),
      rows<Row>("observations", sbUser),
    ]);

  const writes: Write[] = [];

  // Perfil: reglas y control mental.
  const profile: Record<string, unknown> = {
    rules: Object.fromEntries(rules.map((x) => [x.type, { params: x.params ?? {}, action: x.action, enabled: x.enabled }])),
  };
  if (settings[0]) {
    profile.psych = settings[0].psych ?? {};
    profile.pause_phrase = settings[0].pause_phrase ?? null;
  }
  await r.user.set(profile, { merge: true });

  for (const s of strategies) {
    const doc: StrategyDoc = {
      name: s.name,
      context_tf: s.context_tf,
      entry_tf: s.entry_tf,
      notes: s.notes,
      active: s.active,
      steps: Array.isArray(s.steps) ? s.steps : [],
      created_at: iso(s.created_at)!,
    };
    writes.push({ ref: r.strategies.doc(s.id), data: doc });
  }

  // Sesiones por id viejo → id nuevo ("<cuenta>_<fecha>").
  const sessionById = new Map(sessions.map((s) => [s.id as string, s]));
  const violationsByTrade = new Map<string, Row[]>();
  for (const v of violations) {
    if (!v.trade_id) continue;
    violationsByTrade.set(v.trade_id, [...(violationsByTrade.get(v.trade_id) ?? []), v]);
  }
  const attachmentsByTrade = new Map<string, Row[]>();
  for (const a of attachments) attachmentsByTrade.set(a.trade_id, [...(attachmentsByTrade.get(a.trade_id) ?? []), a]);

  const tradesBySession = new Map<string, (TradeDoc & { id: string })[]>();
  const pnlByAccount = new Map<string, number>();
  const lastByAccount = new Map<string, { id: string; at: string }>();

  for (const t of trades) {
    const s = sessionById.get(t.session_id);
    if (!s) continue;
    const sid = sessionId(t.account_id, s.date);
    const doc: TradeDoc & { id: string } = {
      id: t.id,
      session_id: sid,
      session_date: s.date,
      account_id: t.account_id,
      strategy_id: t.strategy_id,
      instrument: t.instrument,
      direction: t.direction,
      with_spike: t.with_spike,
      opened_at: iso(t.opened_at)!,
      closed_at: iso(t.closed_at),
      stake: n(t.stake),
      tp: nOrNull(t.tp),
      pnl: n(t.pnl),
      r_multiple: n(t.r_multiple),
      outcome: t.outcome,
      mood: t.mood,
      moved_sl: t.moved_sl,
      in_plan: t.in_plan,
      checklist: t.checklist ?? {},
      note: t.note,
      anxiety: nOrNull(t.anxiety),
      entry_amount: nOrNull(t.entry_amount),
      multiplier: nOrNull(t.multiplier),
      created_at: iso(t.created_at)!,
      violations: (violationsByTrade.get(t.id) ?? []).map((v) => ({
        id: v.id,
        rule_type: v.rule_type,
        message: v.message,
        created_at: iso(v.created_at)!,
      })),
      attachments: (attachmentsByTrade.get(t.id) ?? []).map((a) => ({
        id: a.id,
        path: a.path,
        width: a.width,
        height: a.height,
        bytes: a.bytes,
        created_at: iso(a.created_at)!,
      })),
    };
    tradesBySession.set(sid, [...(tradesBySession.get(sid) ?? []), doc]);
    pnlByAccount.set(t.account_id, (pnlByAccount.get(t.account_id) ?? 0) + doc.pnl);
    const last = lastByAccount.get(t.account_id);
    if (!last || doc.created_at > last.at) lastByAccount.set(t.account_id, { id: t.id, at: doc.created_at });
  }

  for (const a of accounts) {
    const doc: AccountDoc = {
      label: a.label,
      kind: a.kind,
      currency: a.currency ?? "USD",
      start_balance: n(a.start_balance),
      broker: a.broker ?? "deriv",
      created_at: iso(a.created_at)!,
      pnl_total: round(pnlByAccount.get(a.id) ?? 0, 2),
      deposits_total: 0,
      withdrawals_total: 0,
      last_trade_id: lastByAccount.get(a.id)?.id ?? null,
    };
    writes.push({ ref: r.accounts.doc(a.id), data: doc });
  }

  for (const s of sessions) {
    const sid = sessionId(s.account_id, s.date);
    const dayTrades = tradesBySession.get(sid) ?? [];
    const doc: SessionDoc = {
      account_id: s.account_id,
      date: s.date,
      opened_at: iso(s.opened_at)!,
      closed_at: iso(s.closed_at),
      mood_before: s.mood_before,
      read_rules: s.read_rules,
      goal_r: nOrNull(s.goal_r),
      followed_plan: s.followed_plan,
      journal: s.journal,
      status: s.status,
      blocked_reason: s.blocked_reason ?? null,
      planned_minutes: nOrNull(s.planned_minutes),
      goal_amount: nOrNull(s.goal_amount),
      created_at: iso(s.created_at)!,
      metrics: computeDayMetrics(dayTrades.map((t) => ({ ...t, violated: t.violations.length > 0 }))),
    };
    writes.push({ ref: r.sessions.doc(sid), data: doc });
    for (const { id, ...t } of dayTrades) writes.push({ ref: r.trades.doc(id), data: t });
  }

  for (const w of reviews) {
    const doc: WeeklyReviewDoc = {
      week_start: w.week_start,
      answer: w.answer,
      created_at: iso(w.created_at)!,
      updated_at: iso(w.updated_at)!,
    };
    writes.push({ ref: r.reviews.doc(w.week_start), data: doc });
  }

  for (const o of observations) {
    const doc: ObservationDoc = {
      account_id: o.account_id,
      instrument: o.instrument,
      kind: o.kind,
      level: nOrNull(o.level),
      timeframe: o.timeframe,
      note: o.note,
      times_seen: n(o.times_seen) || 1,
      last_seen_at: iso(o.last_seen_at)!,
      created_at: iso(o.created_at)!,
    };
    writes.push({ ref: r.observations.doc(o.id), data: doc });
  }

  await writeAll(writes);

  console.log(
    `Copiado: ${accounts.length} cuentas, ${strategies.length} estrategias, ${sessions.length} sesiones, ${trades.length} operaciones, ` +
      `${reviews.length} revisiones, ${observations.length} observaciones.`,
  );
  for (const a of accounts) {
    const balance = round(n(a.start_balance) + (pnlByAccount.get(a.id) ?? 0), 2);
    console.log(`  ${a.label}: inicial $${n(a.start_balance)} → balance $${balance}`);
  }
  console.log('Listo. En la app, Ajustes → "Volver a leer mis datos".');
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
