import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  getTossAuthorizationHeader,
  getTossWidgetSecretKey,
} from "@/lib/toss/server";
import { NextResponse } from "next/server";

type IssueResponse = {
  billingKey: string;
  customerKey: string;
  method?: string;
  card?: unknown;
};

/**
 * 카드 자동결제: successUrl 의 authKey 로 빌링키 발급 후 DB 저장 + 구독 행 생성
 * @see https://docs.tosspayments.com/reference#issue-billing-key
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { authKey?: string; customerKey?: string };
  try {
    body = (await request.json()) as { authKey?: string; customerKey?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { authKey, customerKey } = body;
  if (!authKey || !customerKey) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json(
      { error: "server_misconfigured", message: "SUPABASE_SERVICE_ROLE_KEY 필요" },
      { status: 503 },
    );
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("toss_customer_key")
    .eq("id", user.id)
    .single();

  if (!profile?.toss_customer_key || profile.toss_customer_key !== customerKey) {
    return NextResponse.json({ error: "customer_key_mismatch" }, { status: 403 });
  }

  let secretKey: string;
  try {
    secretKey = getTossWidgetSecretKey();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "secret key";
    return NextResponse.json({ error: "server_misconfigured", message: msg }, { status: 503 });
  }

  const issueRes = await fetch("https://api.tosspayments.com/v1/billing/authorizations/issue", {
    method: "POST",
    headers: {
      Authorization: getTossAuthorizationHeader(secretKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ authKey, customerKey }),
  });

  const issueJson = (await issueRes.json()) as IssueResponse & { code?: string; message?: string };

  if (!issueRes.ok) {
    return NextResponse.json(
      {
        error: "toss_issue_failed",
        code: issueJson.code,
        message: issueJson.message,
      },
      { status: 400 },
    );
  }

  const billingKey = issueJson.billingKey;

  await admin
    .from("billing_keys")
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("is_active", true);

  const { data: keyRow, error: keyErr } = await admin
    .from("billing_keys")
    .insert({
      user_id: user.id,
      customer_key: customerKey,
      billing_key: billingKey,
      method: issueJson.method ?? "카드",
      is_active: true,
    })
    .select("id")
    .single();

  if (keyErr || !keyRow) {
    console.error(keyErr);
    return NextResponse.json({ error: "db_insert_billing_key_failed" }, { status: 500 });
  }

  const amount = 4900;
  const nextBilling = new Date();
  nextBilling.setMonth(nextBilling.getMonth() + 1);

  const { data: sub, error: subErr } = await admin
    .from("billing_subscriptions")
    .insert({
      user_id: user.id,
      customer_key: customerKey,
      plan_code: "kiki_monthly",
      amount,
      billing_interval: "month",
      interval_count: 1,
      status: "active",
      current_period_start: new Date().toISOString(),
      current_period_end: nextBilling.toISOString(),
      next_billing_at: nextBilling.toISOString(),
      billing_key_id: keyRow.id,
    })
    .select("id, next_billing_at, amount")
    .single();

  if (subErr || !sub) {
    console.error(subErr);
    return NextResponse.json({ error: "db_insert_subscription_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    subscriptionId: sub.id,
    nextBillingAt: sub.next_billing_at,
    amount: sub.amount,
  });
}
