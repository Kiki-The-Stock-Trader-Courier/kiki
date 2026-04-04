import type { ParsedFilters } from "@/lib/chat-filters";

export type PlaceMarker = {
  title: string;
  category: string;
  roadAddress: string;
  lat: number;
  lng: number;
  link?: string;
};

/** 네이버 지역 검색 API: mapx/mapy 는 정수 문자열 (1e7 스케일) */
function toLatLng(mapx: string, mapy: string): { lat: number; lng: number } {
  const lng = parseInt(mapx, 10) / 10000000;
  const lat = parseInt(mapy, 10) / 10000000;
  return { lat, lng };
}

/**
 * 네이버 지역 검색 (서버 전용 — Client ID/Secret 은 서버 env)
 */
export async function searchNaverLocal(
  query: string,
  display = 5,
): Promise<PlaceMarker[]> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) {
    return [];
  }

  const url = new URL("https://openapi.naver.com/v1/search/local.json");
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(Math.min(display, 5)));
  url.searchParams.set("sort", "random");

  const res = await fetch(url.toString(), {
    headers: {
      "X-Naver-Client-Id": id,
      "X-Naver-Client-Secret": secret,
    },
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    return [];
  }

  const data = (await res.json()) as {
    items?: {
      title: string;
      category: string;
      roadAddress: string;
      mapx: string;
      mapy: string;
      link: string;
    }[];
  };

  const items = data.items ?? [];
  return items.map((item) => {
    const { lat, lng } = toLatLng(item.mapx, item.mapy);
    return {
      title: item.title.replace(/<[^>]+>/g, ""),
      category: item.category,
      roadAddress: item.roadAddress,
      lat,
      lng,
      link: item.link,
    };
  });
}

/** API 응답에 가격 정보가 거의 없으므로, 데모용으로 랜덤 가격 태그를 붙여 필터 시연 */
export function attachDemoPrice(places: PlaceMarker[]): (PlaceMarker & { priceKrw?: number })[] {
  return places.map((p, i) => ({
    ...p,
    priceKrw: 8000 + ((i * 3700) % 25000),
  }));
}

export function filterByMaxPrice<T extends { priceKrw?: number }>(
  places: T[],
  max?: number,
): T[] {
  if (max == null || max <= 0) return places;
  return places.filter((p) => (p.priceKrw ?? 999999) <= max);
}

export function buildSearchQuery(filters: ParsedFilters, regionHint?: string): string {
  const parts = [filters.keyword];
  if (regionHint) parts.push(regionHint);
  return parts.join(" ").trim();
}
