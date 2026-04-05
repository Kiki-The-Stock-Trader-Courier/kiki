import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  getTossAuthorizationHeader,
  getTossIndividualSecretKey,
} from "@/lib/toss/server";
import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

/**
 * 정기결제 데모: 저장된 빌링키로 즉시 자동결제 승인 1회 (실서비스는 Cron 등으로 next_billing_at 에 호출)
 * POST 본문 없음 — 활성 구독 1건을 찾아 청구
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json(
      { error: "server_misconfigured", message: "SUPABASE_SERVICE_ROLE_KEY 필요" },
      { status: 503 },
    );
  }

  const { data: sub, error: subErr } = await admin
    .from("billing_subscriptions")
    .select("id, amount, customer_key, billing_key_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subErr || !sub?.billing_key_id) {
    return NextResponse.json(
      { error: "no_active_subscription", message: "먼저 /subscribe 에서 카드를 등록하세요." },
      { status: 400 },
    );
  }

  const { data: bk, error: bkErr } = await admin
    .from("billing_keys")
    .select("billing_key, customer_key, is_active")
    .eq("id", sub.billing_key_id)
    .single();

  if (bkErr || !bk?.billing_key || !bk.is_active) {
    return NextResponse.json({ error: "billing_key_missing" }, { status: 400 });
  }

  let secretKey: string;
  try {
    secretKey = getTossIndividualSecretKey();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "secret key";
    return NextResponse.json({ error: "server_misconfigured", message: msg }, { status: 503 });
  }

  const orderId = `bill_${user.id.replace(/-/g, "").slice(0, 8)}_${Date.now()}_${randomBytes(3).toString("hex")}`.slice(0, 64);
  const orderName = "Kiki 월 구독";

  const { error: poErr } = await admin.from("payment_orders").insert({
    user_id: user.id,
    order_id: orderId,
    order_name: orderName,
    amount: sub.amount,
    status: "IN_PROGRESS",
    billing_subscription_id: sub.id,
  });

  if (poErr) {
    console.error(poErr);
    return NextResponse.json({ error: "order_insert_failed" }, { status: 500 });
  }

  const url = `https://api.tosspayments.com/v1/billing/${encodeURIComponent(bk.billing_key)}`;
  const tossRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: getTossAuthorizationHeader(secretKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customerKey: bk.customer_key,
      amount: sub.amount,
      orderId,
      orderName,
    }),
  });

  const tossJson = (await tossRes.json()) as Record<string, unknown>;

  if (!tossRes.ok) {
    await admin
      .from("payment_orders")
      .update({ status: "FAILED", metadata: { toss: tossJson } })
      .eq("order_id", orderId);

    return NextResponse.json(
      {
        error: "toss_billing_failed",
        details: tossJson,
      },
      { status: 400 },
    );
  }

  const payment = tossJson as {
    paymentKey?: string;
    type?: string;
    method?: string;
    lastTransactionKey?: string;
    approvedAt?: string;
    receipt?: { url?: string };
  };

  await admin
    .from("payment_orders")
    .update({
      status: "DONE",
      payment_key: payment.paymentKey,
      payment_type: payment.type ?? "BILLING",
      method: payment.method,
      last_transaction_key: payment.lastTransactionKey,
      approved_at: payment.approvedAt ?? new Date().toISOString(),
      receipt_url: payment.receipt?.url ?? null,
    })
    .eq("order_id", orderId);

  const next = new Date();
  next.setMonth(next.getMonth() + 1);
  await admin
    .from("billing_subscriptions")
    .update({
      next_billing_at: next.toISOString(),
      current_period_start: new Date().toISOString(),
      current_period_end: next.toISOString(),
    })
    .eq("id", sub.id);

  return NextResponse.json({ ok: true, orderId, payment: tossJson });
}
