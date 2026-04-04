"use client";

import { useCallback, useEffect, useState } from "react";
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
      text: "원하는 음식 종류(예: 카페, 한식)나 가격(예: 2만원 이하)을 말해 주세요.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  /** 네이버 지역 검색 연결 여부·마커가 실제 검색인지 데모인지 */
  const [naverApiConfigured, setNaverApiConfigured] = useState<boolean | null>(
    null,
  );
  const [placesSource, setPlacesSource] = useState<"naver" | "demo" | null>(
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
      const data = (await res.json()) as {
        places: MapPlace[];
        placesSource?: "naver" | "demo";
        naverApiConfigured?: boolean;
      };
      setPlaces(data.places ?? []);
      if (data.placesSource) setPlacesSource(data.placesSource);
      if (data.naverApiConfigured != null) {
        setNaverApiConfigured(data.naverApiConfigured);
      }
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
        places: MapPlace[];
        placesSource?: "naver" | "demo";
        naverApiConfigured?: boolean;
      };
      setLines((prev) => [...prev, { role: "assistant", text: data.reply }]);
      if (data.places?.length) setPlaces(data.places);
      if (data.placesSource) setPlacesSource(data.placesSource);
      if (data.naverApiConfigured != null) {
        setNaverApiConfigured(data.naverApiConfigured);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col min-h-0 h-[100dvh]">
      {naverApiConfigured === false && (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
          <strong>지도는 표시 중입니다.</strong> 실제 매장 검색을 쓰려면 Vercel
          환경 변수에{" "}
          <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/80">
            NAVER_CLIENT_ID
          </code>
          ,{" "}
          <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/80">
            NAVER_CLIENT_SECRET
          </code>
          를 넣고 재배포하세요. (네이버 개발자센터 검색·지역 API)
        </div>
      )}
      {naverApiConfigured === true && placesSource === "naver" && (
        <div className="shrink-0 border-b border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
          네이버 지역 검색 API로 주변 장소를 불러왔습니다.
        </div>
      )}
      {naverApiConfigured === true && placesSource === "demo" && (
        <div className="shrink-0 border-b border-zinc-200 bg-zinc-100 px-3 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          검색 결과가 없어 데모 마커를 표시했습니다. 검색어를 바꿔 보세요.
        </div>
      )}
      <div className="flex flex-1 flex-col md:flex-row min-h-0">
      <section className="relative flex-1 min-h-[45vh] md:min-h-0 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800">
        <MapView userLat={userLat} userLng={userLng} places={places} />
        {geoError && (
          <p className="absolute bottom-2 left-2 right-2 rounded bg-black/60 text-white text-xs px-2 py-1">
            {geoError}
          </p>
        )}
      </section>
      <aside className="flex w-full md:w-[400px] flex-col border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
        <header className="flex items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 px-3 py-2">
          <h1 className="text-sm font-semibold">맛집 챗봇</h1>
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-xs rounded border border-zinc-300 dark:border-zinc-600 px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            로그아웃
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
          {lines.map((line, i) => (
            <div
              key={`${i}-${line.text.slice(0, 12)}`}
              className={
                line.role === "user"
                  ? "ml-6 rounded-lg bg-blue-600 text-white px-3 py-2"
                  : "mr-6 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 py-2"
              }
            >
              {line.text}
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
    </div>
  );
}
