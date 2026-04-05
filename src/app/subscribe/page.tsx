import Link from "next/link";
import { SubscribeBilling } from "@/components/SubscribeBilling";

export default function SubscribePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">정기결제 (빌링) 테스트</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          카드 등록 후 서버에 빌링키를 저장하고, 데모 버튼으로 자동결제 승인을 한 번 호출할 수 있습니다.
        </p>
      </div>
      <SubscribeBilling />
      <Link href="/setup" className="text-sm text-zinc-500 hover:underline">
        ← 연결 설정으로
      </Link>
    </main>
  );
}
