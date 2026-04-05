"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function PaySuccessInner() {
  const sp = useSearchParams();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [detail, setDetail] = useState<string>("");

  useEffect(() => {
    const paymentKey = sp.get("paymentKey");
    const orderId = sp.get("orderId");
    const amountStr = sp.get("amount");
    const amount = amountStr ? Number(amountStr) : NaN;

    if (!paymentKey || !orderId || !Number.isFinite(amount)) {
      setStatus("error");
      setDetail("필수 파라미터(paymentKey, orderId, amount)가 없습니다.");
      return;
    }

    void (async () => {
      const res = await fetch("/api/payments/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentKey, orderId, amount }),
      });
      const json = (await res.json()) as { error?: string; message?: string; ok?: boolean };
      if (!res.ok) {
        setStatus("error");
        setDetail(json.message ?? json.error ?? "승인 실패");
        return;
      }
      setStatus("ok");
      setDetail("결제가 완료되었습니다.");
    })();
  }, [sp]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">결제 결과</h1>
      {status === "loading" && <p className="text-sm text-zinc-600">승인 처리 중…</p>}
      {status === "ok" && <p className="text-green-600 dark:text-green-400">{detail}</p>}
      {status === "error" && <p className="text-red-600 dark:text-red-400">{detail}</p>}
      <Link href="/setup" className="text-sm text-zinc-500 hover:underline">
        설정으로 돌아가기
      </Link>
    </main>
  );
}

export default function PaySuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto p-6">
          <p className="text-sm text-zinc-500">불러오는 중…</p>
        </main>
      }
    >
      <PaySuccessInner />
    </Suspense>
  );
}
