"use client";

import { createClient } from "@/lib/supabase/client";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { useCallback, useState } from "react";

/**
 * 카드 자동결제(빌링) — 결제위젯 연동 클라이언트 키로 SDK 초기화 (개별 연동 키는 SDK 미지원).
 * 인증 후 `/subscribe/success` 에서 빌링키 발급 API 호출.
 */
export function SubscribeBilling() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const registerCard = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("로그인이 필요합니다.");
      setLoading(false);
      return;
    }

    const { data: profile, error: pe } = await supabase
      .from("profiles")
      .select("toss_customer_key, email, full_name")
      .eq("id", user.id)
      .single();

    if (pe || !profile?.toss_customer_key) {
      setError("프로필 또는 toss_customer_key 를 찾을 수 없습니다.");
      setLoading(false);
      return;
    }

    const clientKey = process.env.NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY?.trim();
    if (!clientKey) {
      setError(
        "NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY 가 없습니다. (결제위젯 연동 클라이언트 키)",
      );
      setLoading(false);
      return;
    }

    try {
      const tossPayments = await loadTossPayments(clientKey);
      const payment = tossPayments.payment({ customerKey: profile.toss_customer_key });
      await payment.requestBillingAuth({
        method: "CARD",
        successUrl: `${window.location.origin}/subscribe/success`,
        failUrl: `${window.location.origin}/subscribe/fail`,
        customerEmail: profile.email ?? undefined,
        customerName: profile.full_name ?? "고객",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "빌링 등록 요청 실패");
      setLoading(false);
    }
  }, []);

  const runChargeDemo = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/billing/charge-demo", { method: "POST" });
    const json = (await res.json()) as { error?: string; message?: string };
    setLoading(false);
    if (!res.ok) {
      setError(json.message ?? json.error ?? "청구 실패");
      return;
    }
    alert("데모 정기결제(자동결제 승인)가 완료되었습니다. 콘솔·DB를 확인하세요.");
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        정기 구독형 서비스에 맞는 카드 자동결제 등록입니다. 테스트 키에서는 실제 출금되지 않습니다.
      </p>
      <button
        type="button"
        onClick={() => void registerCard()}
        disabled={loading}
        className="rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {loading ? "처리 중…" : "카드 등록 (빌링 인증)"}
      </button>
      <button
        type="button"
        onClick={() => void runChargeDemo()}
        disabled={loading}
        className="rounded-lg border border-zinc-400 px-4 py-3 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
      >
        데모: 등록된 카드로 즉시 1회 청구 (자동결제 승인 API)
      </button>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
