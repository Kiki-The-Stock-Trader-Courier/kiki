"use client";

import { loadTossPayments, type TossPaymentsWidgets } from "@tosspayments/tosspayments-sdk";
import { useEffect, useRef, useState } from "react";

type OrderSession = {
  orderId: string;
  amount: number;
  orderName: string;
  customerKey: string;
  clientKey: string;
};

/**
 * 토스 결제위젯 v2 — 주문 생성 후 결제 UI 렌더링 및 requestPayment.
 * `clientKey` 는 결제위젯 연동 클라이언트 키(서버 `/api/payments/orders` 응답). 개별 연동 키는 사용 불가.
 */
export function PayCheckout() {
  const [amountInput, setAmountInput] = useState("1000");
  const [orderName, setOrderName] = useState("Kiki 단건 결제");
  const [session, setSession] = useState<OrderSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  /** renderPaymentMethods / renderAgreement 완료 후에만 true — 그 전에 결제하기 누르면 ref 가 비어 있음 */
  const [widgetsReady, setWidgetsReady] = useState(false);
  const widgetsRef = useRef<TossPaymentsWidgets | null>(null);

  const createOrder = async () => {
    setLoading(true);
    setError(null);
    setSession(null);
    widgetsRef.current = null;
    setWidgetsReady(false);
    const amount = Number(amountInput);
    const res = await fetch("/api/payments/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, orderName: orderName.trim() || "Kiki 단건 결제" }),
    });
    const data = (await res.json()) as { error?: string; message?: string } & Partial<OrderSession>;
    setLoading(false);
    if (!res.ok) {
      setError(data.message ?? data.error ?? "주문 생성 실패");
      return;
    }
    setSession({
      orderId: data.orderId!,
      amount: data.amount!,
      orderName: data.orderName!,
      customerKey: data.customerKey!,
      clientKey: data.clientKey!,
    });
  };

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    setWidgetsReady(false);
    widgetsRef.current = null;

    (async () => {
      try {
        const tossPayments = await loadTossPayments(session.clientKey);
        const widgets = tossPayments.widgets({ customerKey: session.customerKey });
        await widgets.setAmount({ currency: "KRW", value: session.amount });
        await widgets.renderPaymentMethods({
          selector: "#pay-payment-method",
        });
        await widgets.renderAgreement({
          selector: "#pay-agreement",
        });
        if (!cancelled) {
          widgetsRef.current = widgets;
          setWidgetsReady(true);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "결제 UI 로드 실패");
          setWidgetsReady(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      widgetsRef.current = null;
      setWidgetsReady(false);
    };
  }, [session]);

  const requestPayment = async () => {
    const w = widgetsRef.current;
    if (!session || !w || !widgetsReady) {
      setError(
        "결제 UI를 불러오는 중입니다. 잠시 후 다시 눌러 주세요.",
      );
      return;
    }
    setPaying(true);
    setError(null);
    try {
      await w.requestPayment({
        orderId: session.orderId,
        orderName: session.orderName,
        successUrl: `${window.location.origin}/pay/success`,
        failUrl: `${window.location.origin}/pay/fail`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "결제 요청 실패");
      setPaying(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">금액 (원)</label>
        <input
          type="number"
          min={100}
          step={100}
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
          className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">주문명</label>
        <input
          type="text"
          value={orderName}
          onChange={(e) => setOrderName(e.target.value)}
          className="rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="button"
        onClick={() => void createOrder()}
        disabled={loading}
        className="rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {loading ? "주문 만드는 중…" : "1. 주문 만들기 (서버에 orderId 저장)"}
      </button>

      {session && (
        <>
          <p className="text-xs text-zinc-500">
            주문번호 <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1">{session.orderId}</code>
          </p>
          <div id="pay-payment-method" className="min-h-[120px]" />
          <div id="pay-agreement" className="min-h-[80px]" />
          {!widgetsReady && (
            <p className="text-xs text-zinc-500" aria-live="polite">
              결제 수단·약관 UI를 불러오는 중… (준비되면 결제하기가 활성화됩니다)
            </p>
          )}
          <button
            type="button"
            onClick={() => void requestPayment()}
            disabled={paying || !widgetsReady}
            className="rounded-lg border border-zinc-900 dark:border-zinc-100 px-4 py-3 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {paying
              ? "결제창 여는 중…"
              : widgetsReady
                ? "2. 결제하기"
                : "2. 결제하기 (준비 중)"}
          </button>
        </>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
