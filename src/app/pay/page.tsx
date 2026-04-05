import Link from "next/link";
import { PayCheckout } from "@/components/PayCheckout";

export default function PayPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">단건 결제 (테스트)</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          토스 결제위젯 v2 — 주문은 서버에만 기록되고, 승인은 성공 페이지에서 처리합니다.
        </p>
      </div>
      <PayCheckout />
      <Link href="/setup" className="text-sm text-zinc-500 hover:underline">
        ← 연결 설정으로
      </Link>
    </main>
  );
}
