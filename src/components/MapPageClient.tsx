"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MapView from "@/components/MapView";
import type { MapPlace } from "@/components/MapInner";
import { createClient } from "@/lib/supabase/client";

type ChatLine = { role: "user" | "assistant"; text: string };

const DEFAULT_LAT = 37.5665;
const DEFAULT_LNG = 126.978;

/**
 * 지도 + 챗봇(필터) UI — /api/chat 이 Supabase에 대화를 저장합니다.
 */
export default function MapPageClient() {
  const router = useRouter();
  const [userLat, setUserLat] = useState(DEFAULT_LAT);
  const [userLng, setUserLng] = useState(DEFAULT_LNG);
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<ChatLine[]>([
    {
      role: "assistant",
      text: "입력한 내용은 이 사이트 서버의 /api/chat 으로 전달됩니다. 키워드·가격을 읽고 지도 장소를 바꿉니다. Vercel에 N8N_CHAT_WEBHOOK_URL을 넣으면 답 문장을 n8n이 만들 수 있습니다.\n\n원하는 음식 종류(예: 카페, 한식)나 가격(예: 2만원 이하)을 말해 주세요.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [n8nConfigured, setN8nConfigured] = useState<boolean | null>(null);
  const [lastReplySource, setLastReplySource] = useState<"n8n" | "server" | null>(
    null,
  );

  const loadPlaces = useCallback(
    async (q: string) => {
      const params = new URLSearchParams({
        q,
        lat: String(userLat),
        lng: String(userLng),
      });
      const res = await fetch(`/api/places?${params}`);
      if (!res.ok) return;
      const data = (await res.json()) as { places: MapPlace[] };
      setPlaces(data.places ?? []);
    },
    [userLat, userLng],
  );

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError("이 브라우저는 위치를 지원하지 않습니다.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(pos.coords.latitude);
        setUserLng(pos.coords.longitude);
        setGeoError(null);
      },
      () => {
        setGeoError("위치 권한이 없어 서울 시청 좌표를 기본으로 씁니다.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  useEffect(() => {
    void loadPlaces("맛집");
  }, [loadPlaces]);

  useEffect(() => {
    void fetch("/api/integrations/status")
      .then((r) => r.json() as Promise<{ n8nChat?: boolean }>)
      .then((j) => setN8nConfigured(Boolean(j.n8nChat)))
      .catch(() => setN8nConfigured(null));
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLines((prev) => [...prev, { role: "user", text }]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          lat: userLat,
          lng: userLng,
        }),
      });
      if (!res.ok) {
        setLines((prev) => [
          ...prev,
          { role: "assistant", text: "요청에 실패했습니다. 다시 시도해 주세요." },
        ]);
        return;
      }
      const data = (await res.json()) as {
        reply: string;
        replySource?: "n8n" | "server";
        places: MapPlace[];
      };
      setLastReplySource(data.replySource ?? "server");
      setLines((prev) => [...prev, { role: "assistant", text: data.reply }]);
      if (data.places?.length) setPlaces(data.places);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col md:flex-row h-[calc(100vh-0px)] min-h-0">
      <section className="relative flex-1 min-h-[45vh] md:min-h-0 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800">
        <MapView userLat={userLat} userLng={userLng} places={places} />
        {geoError && (
          <p className="absolute bottom-2 left-2 right-2 rounded bg-black/60 text-white text-xs px-2 py-1">
            {geoError}
          </p>
        )}
      </section>
      <aside className="flex w-full md:w-[400px] flex-col border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
        <header className="border-b border-zinc-200 dark:border-zinc-800 px-3 py-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-sm font-semibold">맛집 챗봇</h1>
            <div className="flex items-center gap-2">
            <Link
              href="/setup"
              className="text-xs rounded border border-zinc-300 dark:border-zinc-600 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              연결
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="text-xs rounded border border-zinc-300 dark:border-zinc-600 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              로그아웃
            </button>
            </div>
          </div>
          <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
            연결: 채팅 → <code className="rounded bg-zinc-200/60 dark:bg-zinc-800 px-1">POST /api/chat</code>
            {n8nConfigured === true && " · n8n Webhook URL 설정됨"}
            {n8nConfigured === false && " · n8n 미설정(답은 서버 기본 문장)"}
            {lastReplySource && (
              <>
                {" "}
                · 마지막 답변:{" "}
                <strong>
                  {lastReplySource === "n8n" ? "n8n" : "서버"}
                </strong>
              </>
            )}
          </p>
        </header>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3 text-sm min-h-0">
          {lines.map((line, i) => (
            <div
              key={`chat-${i}-${line.role}`}
              className={
                line.role === "user" ? "flex justify-end" : "flex justify-start"
              }
            >
              <div
                className={
                  line.role === "user"
                    ? "max-w-[min(100%,18rem)] rounded-2xl rounded-br-md bg-blue-600 text-white px-3 py-2.5 shadow-sm break-words whitespace-pre-wrap"
                    : "max-w-[min(100%,20rem)] rounded-2xl rounded-bl-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 py-2.5 shadow-sm break-words whitespace-pre-wrap"
                }
              >
                <span className="sr-only">
                  {line.role === "user" ? "나: " : "챗봇: "}
                </span>
                {line.text}
              </div>
            </div>
          ))}
          {loading && (
            <p className="text-xs text-zinc-500">응답 생성 중…</p>
          )}
        </div>
        <div className="flex gap-2 border-t border-zinc-200 dark:border-zinc-800 p-2">
          <input
            className="flex-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-2 text-sm"
            placeholder="예: 강남 근처 카페, 1만5천원 이하"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void send()}
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => void send()}
            className="rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-3 py-2 text-sm disabled:opacity-50"
          >
            전송
          </button>
        </div>
      </aside>
    </div>
  );
}
