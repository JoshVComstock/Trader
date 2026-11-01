"use server";

import { randomUUID } from "node:crypto";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { round } from "@/lib/calc/trade";
import { db } from "@/lib/db/admin";
import { invalidate } from "@/lib/db/invalidate";
import { refs, toAccount, type AccountDoc, type CashflowDoc, type StrategyDoc } from "@/lib/db/schema";
import { accountSchema, cashflowSchema, ruleSchema, strategySchema } from "@/lib/schemas";
import { todayLocal } from "@/lib/data";

export async function saveAccount(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = accountSchema.safeParse(raw);
  if (!parsed.success) return fail("Revisa la cuenta", "validation", zodFieldErrors(parsed.error.issues));
  const { id, ...values } = parsed.data;
  const { uid } = await requireUser();
  const r = refs(db(), uid);

  try {
    if (id) {
      const ref = r.accounts.doc(id);
      if (!(await ref.get()).exists) return fail("No encontramos esa cuenta", "not_found");
      await ref.update({ label: values.label, kind: values.kind, currency: values.currency, start_balance: values.start_balance });
      invalidate.ledger(uid, id);
      return ok({ id });
    }
    const newId = randomUUID();
    const doc: AccountDoc = {
      ...values,
      broker: "deriv",
      created_at: new Date().toISOString(),
      pnl_total: 0,
      deposits_total: 0,
      withdrawals_total: 0,
      last_trade_id: null,
    };
    await r.accounts.doc(newId).set(doc);
    invalidate.accounts(uid);
    return ok({ id: newId });
  } catch (e) {
    console.error("[saveAccount]", e);
    return fail("No pudimos guardar la cuenta", "unknown");
  }
}

export async function deleteAccount(id: string): Promise<ActionResult> {
  const { uid } = await requireUser();
  const r = refs(db(), uid);
  const used = await r.trades.where("account_id", "==", id).limit(1).get();
  if (!used.empty) {
    return fail("Esta cuenta tiene operaciones. Expórtalas antes; por ahora no se borra.", "validation");
  }
  // Sin operaciones solo puede tener sesiones vacías y movimientos: se borran con la cuenta.
  const [sessions, cashflows] = await Promise.all([
    r.sessions.where("account_id", "==", id).get(),
    r.cashflows.where("account_id", "==", id).get(),
  ]);
  const batch = db().batch();
  for (const d of [...sessions.docs, ...cashflows.docs]) batch.delete(d.ref);
  batch.delete(r.accounts.doc(id));
  await batch.commit();
  invalidate.ledger(uid, id);
  return ok(undefined);
}

/** Retiro o depósito. El balance de la cuenta se ajusta en la misma transacción. */
export async function addCashflow(raw: unknown): Promise<ActionResult<{ id: string; balance: number }>> {
  const parsed = cashflowSchema.safeParse(raw);
  if (!parsed.success) return fail("Revisa el movimiento", "validation", zodFieldErrors(parsed.error.issues));
  const input = parsed.data;
  if (input.date > todayLocal()) return fail("La fecha está en el futuro", "validation", { date: "Está en el futuro" });
  const { uid } = await requireUser();
  const r = refs(db(), uid);
  const accountRef = r.accounts.doc(input.account_id);
  const id = randomUUID();

  const res = await db()
    .runTransaction(async (tx) => {
      const snap = await tx.get(accountRef);
      if (!snap.exists) return { error: "not_found" as const };
      const account = toAccount(snap);
      if (account.kind === "backtest") return { error: "backtest" as const };
      if (input.kind === "withdrawal" && input.amount > account.balance) return { error: "too_much" as const, balance: account.balance };
      const doc: CashflowDoc = { ...input, created_at: new Date().toISOString() };
      tx.set(r.cashflows.doc(id), doc);
      const field = input.kind === "withdrawal" ? "withdrawals_total" : "deposits_total";
      tx.update(accountRef, { [field]: round((account[field] ?? 0) + input.amount, 2) });
      return { balance: round(account.balance + (input.kind === "withdrawal" ? -input.amount : input.amount), 2) };
    })
    .catch((e: unknown) => {
      console.error("[addCashflow]", e);
      return null;
    });

  if (!res) return fail("No pudimos guardar el movimiento", "unknown");
  if ("error" in res) {
    if (res.error === "not_found") return fail("No encontramos esa cuenta", "not_found");
    if (res.error === "backtest") return fail("Las cuentas de backtesting no tienen retiros", "validation");
    return fail(`No puedes retirar más de lo que hay en la cuenta (${res.balance} USD)`, "validation", {
      amount: "Más que el balance",
    });
  }
  invalidate.ledger(uid, input.account_id);
  return ok({ id, balance: res.balance });
}

export async function deleteCashflow(id: string): Promise<ActionResult> {
  const { uid } = await requireUser();
  const r = refs(db(), uid);
  const ref = r.cashflows.doc(id);
  const accountId = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const c = snap.data() as CashflowDoc;
    const accountRef = r.accounts.doc(c.account_id);
    const account = await tx.get(accountRef);
    tx.delete(ref);
    if (account.exists) {
      const field = c.kind === "withdrawal" ? "withdrawals_total" : "deposits_total";
      tx.update(accountRef, { [field]: round(((account.get(field) as number | undefined) ?? 0) - c.amount, 2) });
    }
    return c.account_id;
  });
  if (!accountId) return fail("No encontramos ese movimiento", "not_found");
  invalidate.ledger(uid, accountId);
  return ok(undefined);
}

export async function saveStrategy(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = strategySchema.safeParse(raw);
  if (!parsed.success) return fail("Revisa la estrategia", "validation", zodFieldErrors(parsed.error.issues));
  const { id, ...values } = parsed.data;
  const { uid } = await requireUser();
  const r = refs(db(), uid);

  try {
    if (id) {
      await r.strategies.doc(id).update(values);
      invalidate.strategies(uid);
      return ok({ id });
    }
    const newId = randomUUID();
    const doc: StrategyDoc = { ...values, created_at: new Date().toISOString() };
    await r.strategies.doc(newId).set(doc);
    invalidate.strategies(uid);
    return ok({ id: newId });
  } catch (e) {
    console.error("[saveStrategy]", e);
    return fail("No pudimos guardar la estrategia", "unknown");
  }
}

export async function saveRule(raw: unknown): Promise<ActionResult> {
  const parsed = ruleSchema.safeParse(raw);
  if (!parsed.success) return fail("Revisa la regla", "validation", zodFieldErrors(parsed.error.issues));
  const rule = parsed.data;
  const { uid } = await requireUser();

  try {
    // Las reglas viven en el perfil, una por tipo: se reemplaza solo la de este tipo.
    await refs(db(), uid).user.set(
      { rules: { [rule.type]: { params: rule.params, action: rule.action, enabled: rule.enabled } } },
      { mergeFields: [`rules.${rule.type}`] },
    );
  } catch (e) {
    console.error("[saveRule]", e);
    return fail("No pudimos guardar la regla", "unknown");
  }
  invalidate.profile(uid);
  return ok(undefined);
}
