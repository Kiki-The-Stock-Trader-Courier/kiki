"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Status = {
  supabase: boolean;
  naver: boolean;
  n8nChat: boolean;
  siteUrl: boolean;
};

function Row({
  ok,
  label,
  hint,
}: {
  ok: boolean;
  label: string;
  hint: string;
}) {
  return (
    <li className="flex gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-3 py-2 text-sm">
      <span className={ok ? "text-green-600" : "text-amber-600"} aria-hidden>
        {ok ? "●" : "○"}
      </span>
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{hint}</p>
      </div>
    </li>
  );
}

/**
 * 로그인 후 연동 상태 확인 → 지도로 이동 (API 키는 Vercel 환경 변수에만 둡니다)
 */
export default function SetupPage() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    void fetch("/api/integrations/status")
      .then((r) => r.json() as Promise<Status>)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">연결 설정</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          네이버·n8n 키는 <strong>앱 화면에 입력하지 않습니다.</strong> Vercel
          환경 변수에만 넣으면 서버에서 안전하게 사용합니다.
        </p>
      </div>

      {!status && (
        <p className="text-sm text-zinc-500">상태를 불러오는 중…</p>
      )}

      {status && (
        <ul className="flex flex-col gap-2">
          <Row
            ok={status.supabase}
            label="Supabase (로그인)"
            hint="NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY"
          />
          <Row
            ok={status.siteUrl}
            label="공개 사이트 URL"
            hint="NEXT_PUBLIC_SITE_URL — OAuth 후 localhost로 가지 않게 할 때 권장"
          />
          <Row
            ok={status.naver}
            label="네이버 지역 검색"
            hint="NAVER_CLIENT_ID, NAVER_CLIENT_SECRET — 지도에 실제 장소 표시"
          />
          <Row
            ok={status.n8nChat}
            label="n8n 챗봇 Webhook (선택)"
            hint="N8N_CHAT_WEBHOOK_URL — 채팅 응답을 n8n에서 가공할 때"
          />
        </ul>
      )}

      <div className="rounded-lg bg-zinc-100 dark:bg-zinc-900 p-4 text-xs text-zinc-600 dark:text-zinc-400 space-y-2">
        <p>
          <strong>Vercel:</strong> Project → Settings → Environment Variables 에
          위 이름으로 추가 후 <strong>Redeploy</strong> 하세요.
        </p>
        <p>
          <strong>네이버 개발자센터</strong> WEB URL에는 배포 주소(
          <code className="rounded bg-white/50 dark:bg-black/30 px-1">
            https://…vercel.app
          </code>
          )를 등록하세요.
        </p>
        <p>
          <strong>n8n:</strong> 워크플로를 배포한 뒤 Webhook URL 전체를{" "}
          <code className="rounded bg-white/50 dark:bg-black/30 px-1">
            N8N_CHAT_WEBHOOK_URL
          </code>
          에 넣습니다. 저장소의 <code className="rounded px-1">n8n/kiki-chat.workflow.json</code> 을
          가져오면 됩니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/pay"
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-600 px-4 py-3 text-sm"
        >
          단건 결제 (토스 테스트)
        </Link>
        <Link
          href="/subscribe"
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-600 px-4 py-3 text-sm"
        >
          정기결제·빌링 (토스 테스트)
        </Link>
        <Link
          href="/map"
          className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          지도 화면으로 이동
        </Link>
        <a
          href="https://vercel.com/dashboard"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-600 px-4 py-3 text-sm"
        >
          Vercel 대시보드
        </a>
      </div>
    </main>
  );
}
