import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getTossIndividualClientKey } from "@/lib/toss/server";
import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

/**
 * 단건 결제 전 주문 행 생성 (orderId = 토스 orderId)
 * 클라이언트는 이 orderId로 결제위젯 requestPayment 호출 (API 개별 연동 클라이언트 키 사용)
 */
export async function POST(request: Request) {
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
      {
        error: "server_misconfigured",
        message: "SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.",
      },
      { status: 503 },
    );
  }

  let body: { amount?: number; orderName?: string };
  try {
    body = (await request.json()) as { amount?: number; orderName?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const amount = body.amount;
  const orderName = body.orderName?.trim() || "Kiki 결제";
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 100) {
    return NextResponse.json(
      { error: "invalid_amount", message: "금액은 100원 이상 숫자여야 합니다." },
      { status: 400 },
    );
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("toss_customer_key")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.toss_customer_key) {
    return NextResponse.json(
      {
        error: "no_customer_key",
        message: "프로필에 toss_customer_key 가 없습니다. DB 마이그레이션을 확인하세요.",
      },
      { status: 400 },
    );
  }

  const orderId = `kiki_${user.id.replace(/-/g, "").slice(0, 12)}_${Date.now()}_${randomBytes(4).toString("hex")}`.slice(0, 64);

  const { error: insertError } = await admin.from("payment_orders").insert({
    user_id: user.id,
    order_id: orderId,
    order_name: orderName,
    amount,
    status: "READY",
  });

  if (insertError) {
    console.error(insertError);
    return NextResponse.json({ error: "db_insert_failed" }, { status: 500 });
  }

  let clientKey: string;
  try {
    clientKey = getTossIndividualClientKey();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "client key";
    return NextResponse.json(
      { error: "server_misconfigured", message: msg },
      { status: 503 },
    );
  }

  return NextResponse.json({
    orderId,
    amount,
    orderName,
    customerKey: profile.toss_customer_key,
    clientKey,
  });
}
