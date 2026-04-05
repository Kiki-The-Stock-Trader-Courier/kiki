import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  attachDemoPrice,
  buildSearchQuery,
  reverseGeocodeDistrictHint,
  searchNaverLocalNearby,
  type PlaceMarker,
} from "@/lib/naver-places";
import { parseFiltersFromText } from "@/lib/chat-filters";

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
    roadAddress: "네이버 API 키를 넣으면 실제 결과가 표시됩니다",
    lat: lat + dlat!,
    lng: lng + dlng!,
  }));
}

/**
 * GET /api/places?q=...&lat=&lng=&region=
 * — 지역 검색 (네이버 키 없으면 데모 마커)
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "맛집";
  const lat = parseFloat(searchParams.get("lat") ?? "37.5665");
  const lng = parseFloat(searchParams.get("lng") ?? "126.978");
  const region = searchParams.get("region") ?? "";

  const filters = parseFiltersFromText(q);
  const districtHint = region ? undefined : await reverseGeocodeDistrictHint(lat, lng);
  const query = buildSearchQuery(
    { ...filters, keyword: filters.keyword || q },
    (region || districtHint) || undefined,
  );

  let places = await searchNaverLocalNearby(query, lat, lng, { maxResults: 5 });
  if (places.length === 0) {
    places = demoPlaces(lat, lng, filters.keyword || "맛집");
  }

  const withPrice = attachDemoPrice(places);
  return NextResponse.json({ places: withPrice, query });
}
