"use client";

import {
  loadTossPayments,
  type TossPaymentsPayment,
  type TossPaymentsWidgets,
} from "@tosspayments/tosspayments-sdk";
import { useEffect, useRef, useState } from "react";

type OrderSession = {
  orderId: string;
  amount: number;
  orderName: string;
  customerKey: string;
  clientKey: string;
  /** API 개별 키 → `payment()` 통합 결제창 / 결제위젯 키 → `widgets` UI */
  checkoutMode: "widget" | "payment";
};

/** 위젯에 API 개별 키를 넣었을 때 SDK가 내는 오류 — 결제창(payment)으로 자동 전환 */
function isApiKeyRejectedByWidgets(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes("API 개별 연동 키") ||
    msg.includes("NotSupportedAPIIndividualKey") ||
    msg.includes("결제위젯 연동 키의 클라이언트 키")
  );
}

/**
 * 토스 단건 결제
 * - `checkoutMode: payment` — API 개별 연동 키, `payment().requestPayment(CARD)` 로 결제창 오픈
 * - `checkoutMode: widget` — 결제위젯 연동 키, 결제수단·약관 UI 후 `requestPayment`
 * - 서버가 widget으로 응답했는데 클라이언트 키가 API 개별인 경우 → 위젯 초기화 실패 시 결제창으로 폴백
 */
export function PayCheckout() {
  const [amountInput, setAmountInput] = useState("1000");
  const [orderName, setOrderName] = useState("Kiki 단건 결제");
  const [session, setSession] = useState<OrderSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  /** 서버 모드와 다를 수 있음(API 키를 위젯 전용 env에 넣은 경우 폴백 후 `payment`) */
  const [effectiveMode, setEffectiveMode] = useState<"widget" | "payment" | null>(null);
  /** 위젯: render 완료 후 / 결제창: payment 인스턴스 준비 후 */
  const [checkoutReady, setCheckoutReady] = useState(false);
  const checkoutRef = useRef<TossPaymentsWidgets | TossPaymentsPayment | null>(null);

  const createOrder = async () => {
    setLoading(true);
    setError(null);
    setSession(null);
    checkoutRef.current = null;
    setCheckoutReady(false);
    setEffectiveMode(null);
    const amount = Number(amountInput);
    const res = await fetch("/api/payments/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, orderName: orderName.trim() || "Kiki 단건 결제" }),
    });
    const data = (await res.json()) as {
      error?: string;
      message?: string;
      checkoutMode?: "widget" | "payment";
    } & Partial<OrderSession>;
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
      checkoutMode: data.checkoutMode ?? "widget",
    });
  };

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    setCheckoutReady(false);
    checkoutRef.current = null;

    // API 개별 연동 키: 통합 결제창 (위젯 UI 없음)
    if (session.checkoutMode === "payment") {
      (async () => {
        try {
          const tossPayments = await loadTossPayments(session.clientKey);
          const payment = tossPayments.payment({ customerKey: session.customerKey });
          if (!cancelled) {
            checkoutRef.current = payment;
            setEffectiveMode("payment");
            setCheckoutReady(true);
          }
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "결제 SDK 초기화 실패");
            setCheckoutReady(false);
          }
        }
      })();
      return () => {
        cancelled = true;
        checkoutRef.current = null;
        setCheckoutReady(false);
      };
    }

    // 결제위젯 연동 키: 결제수단·약관 UI (실제 키가 API 개별이면 아래에서 결제창으로 폴백)
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
          checkoutRef.current = widgets;
          setEffectiveMode("widget");
          setCheckoutReady(true);
        }
      } catch (e) {
        if (cancelled) return;
        if (isApiKeyRejectedByWidgets(e)) {
          try {
            const tossPayments = await loadTossPayments(session.clientKey);
            const payment = tossPayments.payment({ customerKey: session.customerKey });
            if (!cancelled) {
              checkoutRef.current = payment;
              setEffectiveMode("payment");
              setCheckoutReady(true);
              setError(null);
            }
          } catch (e2) {
            if (!cancelled) {
              setError(e2 instanceof Error ? e2.message : "결제 SDK 초기화 실패");
              setCheckoutReady(false);
            }
          }
          return;
        }
        setError(e instanceof Error ? e.message : "결제 UI 로드 실패");
        setCheckoutReady(false);
      }
    })();

    return () => {
      cancelled = true;
      checkoutRef.current = null;
      setCheckoutReady(false);
    };
  }, [session]);

  const displayMode = effectiveMode ?? session?.checkoutMode ?? "widget";

  const requestPayment = async () => {
    const ref = checkoutRef.current;
    if (!session || !ref || !checkoutReady) {
      setError("결제 준비 중입니다. 잠시 후 다시 눌러 주세요.");
      return;
    }
    setPaying(true);
    setError(null);
    try {
      if (displayMode === "payment") {
        const payment = ref as TossPaymentsPayment;
        await payment.requestPayment({
          method: "CARD",
          amount: { currency: "KRW", value: session.amount },
          orderId: session.orderId,
          orderName: session.orderName,
          successUrl: `${window.location.origin}/pay/success`,
          failUrl: `${window.location.origin}/pay/fail`,
        });
      } else {
        const widgets = ref as TossPaymentsWidgets;
        await widgets.requestPayment({
          orderId: session.orderId,
          orderName: session.orderName,
          successUrl: `${window.location.origin}/pay/success`,
          failUrl: `${window.location.origin}/pay/fail`,
        });
      }
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
            {displayMode === "payment" && (
              <span className="ml-2 text-zinc-400">· API 개별 연동(통합 결제창)</span>
            )}
            {displayMode === "widget" && (
              <span className="ml-2 text-zinc-400">· 결제위젯 UI</span>
            )}
          </p>

          {displayMode === "widget" ? (
            <>
              <div id="pay-payment-method" className="min-h-[120px]" />
              <div id="pay-agreement" className="min-h-[80px]" />
              {!checkoutReady && (
                <p className="text-xs text-zinc-500" aria-live="polite">
                  결제 수단·약관 UI를 불러오는 중… (준비되면 결제하기가 활성화됩니다)
                </p>
              )}
            </>
          ) : (
            !checkoutReady && (
              <p className="text-xs text-zinc-500" aria-live="polite">
                결제창 연결 준비 중…
              </p>
            )
          )}

          {displayMode === "payment" && checkoutReady && (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              아래 버튼을 누르면 토스 카드·간편결제 통합 결제창이 열립니다.
            </p>
          )}

          <button
            type="button"
            onClick={() => void requestPayment()}
            disabled={paying || !checkoutReady}
            className="rounded-lg border border-zinc-900 dark:border-zinc-100 px-4 py-3 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {paying
              ? "결제창 여는 중…"
              : checkoutReady
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
