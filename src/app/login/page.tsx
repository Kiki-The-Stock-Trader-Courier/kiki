"use client";

import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/map";
  const err = searchParams.get("error");
  const details = searchParams.get("details");
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const hasSupabaseEnv = useMemo(() => {
    const u = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const k = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return Boolean(u?.trim() && k?.trim());
  }, []);

  const errorHint = useMemo(() => {
    if (!err) return null;
    const d = details ? decodeURIComponent(details) : null;
    switch (err) {
      case "exchange":
        return d
          ? `세션 교환 실패: ${d}`
          : "인증 코드를 세션으로 바꾸지 못했습니다. Supabase URL/키와 리다이렉트 URL을 확인하세요.";
      case "oauth":
        return d ? `OAuth: ${d}` : "Google OAuth 단계에서 오류가 났습니다.";
      case "no_code":
        return "인증 코드가 없습니다. 다시 시도하거나 리다이렉트 URL을 확인하세요.";
      case "auth":
      default:
        return "로그인에 실패했습니다. 아래 설정을 확인하세요.";
    }
  }, [err, details]);

  async function signInWithGoogle() {
    setActionError(null);
    if (!hasSupabaseEnv) {
      setActionError(
        "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 없습니다. Vercel 환경 변수에 넣고 다시 배포하세요.",
      );
      return;
    }
    setPending(true);
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) {
        setActionError(`${error.message}${error.status ? ` (${error.status})` : ""}`);
        setPending(false);
        return;
      }
      if (!data?.url) {
        setActionError("OAuth 시작 URL을 받지 못했습니다. Supabase에서 Google 로그인을 켰는지 확인하세요.");
        setPending(false);
      }
      // 성공 시 브라우저가 data.url 로 이동 — pending 유지
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "알 수 없는 오류");
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-8 shadow-sm">
      <div>
        <h1 className="text-xl font-semibold">Kiki 로그인</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Google 계정으로 로그인한 뒤 지도와 챗봇을 사용합니다.
        </p>
      </div>
      {!hasSupabaseEnv && (
        <p className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          Supabase 환경 변수가 빌드에 포함되지 않았습니다. Vercel → Settings → Environment
          Variables에 URL·anon 키를 넣은 뒤 Redeploy 하세요.
        </p>
      )}
      {errorHint && (
        <p className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">
          {errorHint}
        </p>
      )}
      {actionError && (
        <p className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">
          {actionError}
        </p>
      )}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Supabase → Authentication → URL에{" "}
        <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1 break-all">
          {origin ? `${origin}/auth/callback` : "(배포 주소)/auth/callback"}
        </code>{" "}
        를 Redirect URLs에 추가하세요. Google Cloud OAuth 리다이렉트 URI에는 Supabase가 안내하는{" "}
        <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1 break-all">
          https://(프로젝트).supabase.co/auth/v1/callback
        </code>{" "}
        만 등록합니다.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => void signInWithGoogle()}
        className="flex items-center justify-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-600 py-3 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-60"
      >
        {pending ? "이동 중…" : "Google로 계속하기"}
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <Suspense fallback={<p className="text-sm text-zinc-500">로딩…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
