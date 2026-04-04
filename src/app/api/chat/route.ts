import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseFiltersFromText, type ParsedFilters } from "@/lib/chat-filters";
import {
  attachDemoPrice,
  buildSearchQuery,
  filterByMaxPrice,
  searchNaverLocal,
  type PlaceMarker,
} from "@/lib/naver-places";

function demoPlaces(lat: number, lng: number, keyword: string): PlaceMarker[] {
  const offsets = [
    [0.002, 0.001],
    [-0.001, 0.002],
    [0.0015, -0.001],
    [-0.002, -0.0015],
    [0.0005, 0.0025],
  ];
  return offsets.map(([dlat, dlng], i) => ({
    title: `${keyword} 데모 ${i + 1}`,
    category: "데모",
    roadAddress: "NAVER_CLIENT_ID 설정 시 실제 검색 결과로 대체됩니다",
    lat: lat + dlat!,
    lng: lng + dlng!,
  }));
}

async function maybeCallN8n(
  message: string,
  filters: ParsedFilters,
): Promise<string | null> {
  const url = process.env.N8N_CHAT_WEBHOOK_URL;
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, filters }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { reply?: string };
    return data.reply ?? null;
  } catch {
    return null;
  }
}

/**
 * POST /api/chat { message, lat?, lng?, region? }
 * — 메시지 저장 + 필터 파싱 + 장소 검색 + (선택) n8n 응답 문구
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    message?: string;
    lat?: number;
    lng?: number;
    region?: string;
  };
  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  const lat = body.lat ?? 37.5665;
  const lng = body.lng ?? 126.978;
  const region = body.region ?? "";

  const filters = parseFiltersFromText(message);
  const query = buildSearchQuery(filters, region || undefined);

  await supabase.from("chat_messages").insert({
    user_id: user.id,
    role: "user",
    content: message,
    filters: filters as unknown as Record<string, unknown>,
  });

  let places = await searchNaverLocal(query, 5);
  if (places.length === 0) {
    places = demoPlaces(lat, lng, filters.keyword);
  }

  let list = attachDemoPrice(places);
  list = filterByMaxPrice(list, filters.maxPriceKrw);

  const n8nReply = await maybeCallN8n(message, filters);
  const assistantText =
    n8nReply ??
    `「${filters.keyword}」 기준으로 검색했어요.${
      filters.maxPriceKrw
        ? ` 가격은 앱에서 데모 금액(건당 ${filters.maxPriceKrw.toLocaleString()}원 이하)으로 필터했습니다.`
        : ""
    } 결과 ${list.length}곳입니다.`;

  await supabase.from("chat_messages").insert({
    user_id: user.id,
    role: "assistant",
    content: assistantText,
    filters: { ...filters, query } as unknown as Record<string, unknown>,
  });

  return NextResponse.json({
    reply: assistantText,
    filters,
    query,
    places: list,
  });
}
