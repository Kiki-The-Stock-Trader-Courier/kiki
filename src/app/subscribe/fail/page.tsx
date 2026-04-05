"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SubscribeFailInner() {
  const sp = useSearchParams();
  const code = sp.get("code");
  const message = sp.get("message");

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">카드 등록 실패</h1>
      {code && (
        <p className="text-sm">
          코드: <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1">{code}</code>
        </p>
      )}
      {message && <p className="text-sm">{message}</p>}
      <Link href="/subscribe" className="text-sm text-zinc-500 hover:underline">
        다시 시도
      </Link>
    </main>
  );
}

export default function SubscribeFailPage() {
  return (
    <Suspense fallback={<main className="p-6">…</main>}>
      <SubscribeFailInner />
    </Suspense>
  );
}
