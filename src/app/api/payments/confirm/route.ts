import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  getTossAuthorizationHeader,
  getTossIndividualSecretKey,
} from "@/lib/toss/server";
import { NextResponse } from "next/server";

type TossPayment = {
  paymentKey: string;
  orderId: string;
  status: string;
  type?: string;
  method?: string;
  lastTransactionKey?: string;
  approvedAt?: string;
  receipt?: { url?: string };
};

/**
 * 결제위젯 성공 리다이렉트 후 서버에서 토스 결제 승인 API 호출 + DB 반영
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { paymentKey?: string; orderId?: string; amount?: number };
  try {
    body = (await request.json()) as {
      paymentKey?: string;
      orderId?: string;
      amount?: number;
    };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { paymentKey, orderId, amount } = body;
  if (!paymentKey || !orderId || typeof amount !== "number") {
    return NextResponse.json(
      { error: "invalid_body", message: "paymentKey, orderId, amount 가 필요합니다." },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json(
      { error: "server_misconfigured", message: "SUPABASE_SERVICE_ROLE_KEY 필요" },
      { status: 503 },
    );
  }

  const { data: row, error: fetchError } = await admin
    .from("payment_orders")
    .select("id, amount, user_id")
    .eq("order_id", orderId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !row) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }

  if (row.amount !== amount) {
    return NextResponse.json(
      { error: "amount_mismatch", message: "주문 금액과 결제 금액이 일치하지 않습니다." },
      { status: 400 },
    );
  }

  let secretKey: string;
  try {
    secretKey = getTossIndividualSecretKey();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "secret key";
    return NextResponse.json({ error: "server_misconfigured", message: msg }, { status: 503 });
  }

  const tossRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: {
      Authorization: getTossAuthorizationHeader(secretKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });

  const tossJson = (await tossRes.json()) as TossPayment & { code?: string; message?: string };

  if (!tossRes.ok) {
    await admin
      .from("payment_orders")
      .update({ status: "FAILED", metadata: { tossError: tossJson } })
      .eq("order_id", orderId);

    return NextResponse.json(
      {
        error: "toss_confirm_failed",
        code: tossJson.code,
        message: tossJson.message,
      },
      { status: 400 },
    );
  }

  const payment = tossJson as TossPayment;

  const { error: updateError } = await admin
    .from("payment_orders")
    .update({
      status: "DONE",
      payment_key: payment.paymentKey,
      payment_type: payment.type ?? "NORMAL",
      method: payment.method,
      last_transaction_key: payment.lastTransactionKey,
      approved_at: payment.approvedAt ?? new Date().toISOString(),
      receipt_url: payment.receipt?.url ?? null,
    })
    .eq("order_id", orderId);

  if (updateError) {
    console.error(updateError);
    return NextResponse.json(
      { error: "db_update_failed", payment: tossJson },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, payment: tossJson });
}
