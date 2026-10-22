/**
 * Datos de ejemplo: 30 sesiones y ~70 operaciones en dos meses para una cuenta real,
 * más una cuenta de backtesting con algunas sesiones. Pasa por el mismo motor de reglas.
 *
 *   pnpm seed                       (usa SEED_EMAIL / SEED_PASSWORD de .env.local)
 *   pnpm seed -- --email yo@x.com   (siembra en un usuario existente)
 *
 * Borra y vuelve a crear solo las cuentas de ejemplo de ese usuario.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { defaultPnl, deriveTrade } from "../lib/calc/trade";
import { defaultChecklist, type Checklist } from "../lib/domain/checklist";
import { getInstrument, type InstrumentCode } from "../lib/domain/instruments";
import type { Mood, Outcome } from "../lib/domain/types";
import { evaluateTrade, type EngineTrade } from "../lib/rules";
import { parseRules } from "../lib/schemas";
import type { Database } from "../lib/supabase/database.types";
import { addDays, fromLocal, localDate, weekdayMondayFirst } from "../lib/time-core";

const REAL_LABEL = "Deriv real (ejemplo)";
const BACKTEST_LABEL = "Backtesting (ejemplo)";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// PRNG determinista: el mismo seed da los mismos datos.
let state = 20261020;
function rand(): number {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
}
const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const chance = (p: number) => rand() < p;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY en .env.local");
  process.exit(1);
}
const db = createClient<Database>(url, secret, { auth: { persistSession: false } });

async function ensureUser(email: string, password: string | undefined): Promise<string> {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  if (!password) throw new Error(`No existe ${email} y no hay SEED_PASSWORD para crearlo`);
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  console.log(`Usuario creado: ${email}`);
  return data.user.id;
}

interface SeedTrade extends EngineTrade {
  id: string;
}

async function seedAccount(opts: {
  userId: string;
  label: string;
  kind: "real" | "backtest";
  startBalance: number;
  dates: string[];
  strategyId: string | null;
}) {
  const { userId } = opts;
  const { data: account, error } = await db
    .from("accounts")
    .insert({ user_id: userId, label: opts.label, kind: opts.kind, start_balance: opts.startBalance, currency: "USD" })
    .select("id")
    .single();
  if (error) throw error;

  const { data: ruleRows } = await db.from("rules").select("type, params, action, enabled").eq("user_id", userId);
  const rules = parseRules(ruleRows ?? []);

  let balance = opts.startBalance;
  let trades = 0;
  let blocked = 0;

  for (const date of opts.dates) {
    const moodBefore: Mood = pick(["tranquilo", "tranquilo", "tranquilo", "acelerado", "cansado"]);
    const startMinute = 8 * 60 + 20 + Math.floor(rand() * 110);
    const openedAt = fromLocal(date, `${String(Math.floor(startMinute / 60)).padStart(2, "0")}:${String(startMinute % 60).padStart(2, "0")}`);

    const { data: session, error: sErr } = await db
      .from("sessions")
      .insert({
        user_id: userId,
        account_id: account.id,
        date,
        opened_at: openedAt.toISOString(),
        mood_before: opts.kind === "real" ? moodBefore : null,
        read_rules: opts.kind === "real" ? chance(0.8) : false,
        goal_r: opts.kind === "real" ? 2 : null,
      })
      .select("id")
      .single();
    if (sErr) throw sErr;

    const planned = 1 + Math.floor(rand() * 3) + (moodBefore === "acelerado" && chance(0.5) ? 1 : 0);
    const sessionTrades: SeedTrade[] = [];
    let cursor = openedAt.getTime() + (3 + rand() * 10) * 60_000;
    let blockReason: string | null = null;
    let lastLoss = false;
    let lastStake = 1;

    for (let i = 0; i < planned; i++) {
      const instrument: InstrumentCode = pick(["BOOM1000", "BOOM1000", "BOOM500", "CRASH1000", "CRASH500", "BOOM300", "CRASH300"]);
      const favored = getInstrument(instrument).favoredDirection;
      const accelerated = moodBefore === "acelerado" || (lastLoss && chance(0.35));
      const against = chance(accelerated ? 0.35 : 0.12);
      const direction = against ? (favored === "buy" ? "sell" : "buy") : favored;
      const winP = against ? 0.3 : 0.68;
      const roll = rand();
      const result: Outcome = roll < winP ? "win" : roll < winP + 0.05 ? "tie" : "loss";
      // Antimartingala rota de vez en cuando, justo después de perder.
      const stake = lastLoss && accelerated && chance(0.4) ? lastStake * 2 : 1;
      const tp = stake * 2;
      const pnl = defaultPnl(result, stake, tp);
      const mood: Mood = accelerated ? "acelerado" : pick(["tranquilo", "tranquilo", "cansado"]);

      const checklist: Checklist = { ...defaultChecklist(), calm: mood === "tranquilo" };
      if (accelerated && chance(0.45)) checklist.impulse = true;
      if (against) checklist.trend_1h = false;
      if (chance(0.08)) checklist.kept_sl = false;
      if (chance(0.1)) checklist.doubted = true;

      // Revancha: a veces entra enseguida tras una pérdida.
      const gapMin = lastLoss && accelerated && chance(0.5) ? 1 + rand() * 1.5 : 5 + rand() * 18;
      if (i > 0) cursor += gapMin * 60_000;
      const opened = new Date(cursor);
      const closed = new Date(cursor + (1 + rand() * 6) * 60_000);
      cursor = closed.getTime();

      const candidate: SeedTrade = {
        id: randomUUID(),
        opened_at: opened.toISOString(),
        closed_at: closed.toISOString(),
        stake,
        pnl,
        impulse: checklist.impulse,
      };
      const evaluation = evaluateTrade({
        candidate,
        sessionTrades,
        sessionOpenedAt: openedAt.toISOString(),
        balance,
        rules,
      });

      const { error: tErr } = await db.from("trades").insert({
        id: candidate.id,
        user_id: userId,
        session_id: session.id,
        account_id: account.id,
        strategy_id: opts.strategyId,
        instrument,
        direction,
        opened_at: candidate.opened_at,
        closed_at: candidate.closed_at,
        stake,
        tp,
        pnl,
        mood,
        checklist,
        anxiety: accelerated ? 4 + Math.floor(rand() * 2) : 1 + Math.floor(rand() * 3),
        note: chance(0.25)
          ? pick([
              "Spike limpio en la zona de 1H, reacción inmediata.",
              "Entré antes de la confirmación. No esperé la vela.",
              "Zona válida pero el spike no llegó. SL respetado.",
              "Contra el spike por impaciencia. No se repite.",
              "Salida en TP sin tocar nada. Así es.",
            ])
          : null,
        ...deriveTrade({ instrument, direction, stake, pnl, checklist }),
      });
      if (tErr) throw tErr;

      if (evaluation.violations.length) {
        await db.from("rule_violations").insert(
          evaluation.violations.map((v) => ({
            user_id: userId,
            trade_id: candidate.id,
            session_id: session.id,
            rule_type: v.ruleType,
            message: v.message,
          })),
        );
      }

      sessionTrades.push(candidate);
      balance += pnl;
      trades++;
      lastLoss = pnl < 0;
      lastStake = stake;

      if (evaluation.shouldBlock) {
        blockReason =
          evaluation.limits.find((l) => l.action === "block")?.message ??
          evaluation.violations.find((v) => v.action === "block")?.message ??
          null;
        break;
      }
    }

    const followed = !sessionTrades.some((t) => t.impulse) && chance(0.85);
    await db
      .from("sessions")
      .update({
        // En backtesting los días quedan abiertos para seguir cargando operaciones.
        status: blockReason ? "blocked" : opts.kind === "backtest" ? "open" : "closed",
        blocked_reason: blockReason,
        closed_at: new Date(cursor + 2 * 60_000).toISOString(),
        followed_plan: opts.kind === "real" ? followed : null,
        journal:
          opts.kind === "real" && chance(0.4)
            ? followed
              ? "Esperé las zonas y respeté el SL. Día tranquilo."
              : "Me aceleré después de la primera pérdida. Mañana, pausa de 5 minutos."
            : null,
      })
      .eq("id", session.id);
    if (blockReason) blocked++;
  }

  return { trades, sessions: opts.dates.length, blocked, balance };
}

function pastWeekdays(count: number, today: string, skipChance: number): string[] {
  const out: string[] = [];
  let d = addDays(today, -1);
  while (out.length < count) {
    if (weekdayMondayFirst(d) < 5 && !chance(skipChance)) out.push(d);
    d = addDays(d, -1);
  }
  return out.reverse();
}

async function main() {
  const email = arg("email") ?? process.env.SEED_EMAIL;
  const password = arg("password") ?? process.env.SEED_PASSWORD;
  if (!email) throw new Error("Indica --email o SEED_EMAIL");

  const userId = await ensureUser(email, password);

  await db.from("accounts").delete().eq("user_id", userId).in("label", [REAL_LABEL, BACKTEST_LABEL]);

  const { data: strategy } = await db
    .from("strategies")
    .select("id")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  const today = localDate(new Date());
  // 30 días hábiles en ~2 meses (se saltan algunos).
  const realDates = pastWeekdays(30, today, 0.28);
  const real = await seedAccount({
    userId,
    label: REAL_LABEL,
    kind: "real",
    startBalance: 250,
    dates: realDates,
    strategyId: strategy?.id ?? null,
  });

  const backtestDates = pastWeekdays(10, addDays(today, -120), 0.2);
  const backtest = await seedAccount({
    userId,
    label: BACKTEST_LABEL,
    kind: "backtest",
    startBalance: 500,
    dates: backtestDates,
    strategyId: strategy?.id ?? null,
  });

  await db.from("observations").delete().eq("user_id", userId);
  const { data: bt } = await db.from("accounts").select("id").eq("user_id", userId).eq("label", BACKTEST_LABEL).single();
  await db.from("observations").insert([
    { user_id: userId, account_id: bt?.id ?? null, instrument: "BOOM1000", kind: "zona", level: 12850.5, timeframe: "1H", note: "Soporte que reaccionó tres veces con spike inmediato.", times_seen: 3 },
    { user_id: userId, account_id: bt?.id ?? null, instrument: "CRASH500", kind: "patron", timeframe: "1M", note: "Después de dos spikes seguidos, el tercero casi nunca llega a la zona.", times_seen: 2 },
    { user_id: userId, account_id: bt?.id ?? null, instrument: "BOOM500", kind: "zona", level: 4321.25, timeframe: "1H", note: "Resistencia: los spikes se frenan aquí.", times_seen: 1 },
  ]);

  console.log(
    `Real: ${real.sessions} sesiones, ${real.trades} operaciones, ${real.blocked} bloqueadas, balance final $${real.balance.toFixed(2)}`,
  );
  console.log(`Backtesting: ${backtest.sessions} sesiones, ${backtest.trades} operaciones, ${backtest.blocked} bloqueadas`);
  console.log(`Listo. Entra con ${email}.`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
