"use client";

import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/map";
  const err = searchParams.get("error");
  const [pending, setPending] = useState(false);

  async function signInWithGoogle() {
    setPending(true);
    const supabase = createClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setPending(false);
      alert(error.message);
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
      {err && (
        <p className="text-sm text-red-600">
          로그인에 실패했습니다. Supabase URL·리다이렉트 설정을 확인하세요.
        </p>
      )}
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
