"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function SubscribeSuccessInner() {
  const sp = useSearchParams();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [detail, setDetail] = useState<string>("");

  useEffect(() => {
    const customerKey = sp.get("customerKey");
    const authKey = sp.get("authKey");

    if (!customerKey || !authKey) {
      setStatus("error");
      setDetail("customerKey 또는 authKey 가 없습니다. 빌링 인증을 다시 진행해 주세요.");
      return;
    }

    void (async () => {
      const res = await fetch("/api/billing/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerKey, authKey }),
      });
      const json = (await res.json()) as {
        error?: string;
        message?: string;
        subscriptionId?: string;
        nextBillingAt?: string;
      };
      if (!res.ok) {
        setStatus("error");
        setDetail(json.message ?? json.error ?? "빌링키 발급 실패");
        return;
      }
      setStatus("ok");
      setDetail(
        `구독이 등록되었습니다. 다음 결제 예정: ${json.nextBillingAt ?? "-"}`,
      );
    })();
  }, [sp]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">카드 등록 완료</h1>
      {status === "loading" && <p className="text-sm text-zinc-600">빌링키 발급 중…</p>}
      {status === "ok" && <p className="text-green-600 dark:text-green-400">{detail}</p>}
      {status === "error" && <p className="text-red-600 dark:text-red-400">{detail}</p>}
      <Link href="/subscribe" className="text-sm text-zinc-500 hover:underline">
        구독 페이지로
      </Link>
    </main>
  );
}

export default function SubscribeSuccessPage() {
  return (
    <Suspense fallback={<main className="p-6">불러오는 중…</main>}>
      <SubscribeSuccessInner />
    </Suspense>
  );
}
