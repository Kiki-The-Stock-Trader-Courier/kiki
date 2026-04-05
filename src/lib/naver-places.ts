import type { ParsedFilters } from "@/lib/chat-filters";
import { haversineDistanceMeters } from "@/lib/geo";

export type PlaceMarker = {
  title: string;
  category: string;
  roadAddress: string;
  lat: number;
  lng: number;
  link?: string;
  /** 내 위치 기준 거리(미터) — 반경 검색 시 설정 */
  distanceMeters?: number;
};

/** 네이버 지역 검색 API: mapx/mapy 는 정수 문자열 (1e7 스케일) */
function toLatLng(mapx: string, mapy: string): { lat: number; lng: number } {
  const lng = parseInt(mapx, 10) / 10000000;
  const lat = parseInt(mapy, 10) / 10000000;
  return { lat, lng };
}

/** UI·답변 문구용 — 기본 2.5km, `NAVER_NEARBY_RADIUS_METERS`로 변경 가능 */
export function getConfiguredNearbyRadiusMeters(): number {
  const raw = process.env.NAVER_NEARBY_RADIUS_METERS?.trim();
  const n = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n > 100 && n <= 50000) return n;
  return 2500;
}

function getNearbyRadiusMeters(): number {
  return getConfiguredNearbyRadiusMeters();
}

/**
 * 좌표 기준 행정동/구 단서 (검색어 보강용).
 * OSM Nominatim — 가벼운 호출, 실패 시 무시.
 */
export async function reverseGeocodeDistrictHint(
  lat: number,
  lng: number,
): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "json");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("accept-language", "ko");
    url.searchParams.set("zoom", "14");
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "KikiMap/1.0 (restaurant search)" },
      signal: controller.signal,
      next: { revalidate: 3600 },
    });
    if (!res.ok) return undefined;
    const d = (await res.json()) as {
      address?: {
        suburb?: string;
        city_district?: string;
        town?: string;
        county?: string;
        city?: string;
        borough?: string;
      };
    };
    const a = d.address;
    if (!a) return undefined;
    return (
      a.suburb ||
      a.borough ||
      a.city_district ||
      a.town ||
      a.county ||
      a.city ||
      undefined
    );
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

type NaverLocalItem = {
  title: string;
  category: string;
  roadAddress: string;
  mapx: string;
  mapy: string;
  link: string;
};

/** 단일 페이지 지역 검색 (display 최대 5) */
async function fetchNaverLocalPage(
  query: string,
  start: number,
  display: number,
): Promise<NaverLocalItem[]> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) {
    return [];
  }

  const url = new URL("https://openapi.naver.com/v1/search/local.json");
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(Math.min(Math.max(display, 1), 5)));
  url.searchParams.set("start", String(Math.max(1, start)));
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

  const data = (await res.json()) as { items?: NaverLocalItem[] };
  return data.items ?? [];
}

function itemToMarker(item: NaverLocalItem): PlaceMarker {
  const { lat, lng } = toLatLng(item.mapx, item.mapy);
  return {
    title: item.title.replace(/<[^>]+>/g, ""),
    category: item.category,
    roadAddress: item.roadAddress,
    lat,
    lng,
    link: item.link,
  };
}

/**
 * 네이버 지역 검색 (단일 페이지, 하위 호환).
 * 반경 필터 없음 — `searchNaverLocalNearby` 사용을 권장합니다.
 */
export async function searchNaverLocal(
  query: string,
  display = 5,
): Promise<PlaceMarker[]> {
  const items = await fetchNaverLocalPage(query, 1, display);
  return items.map(itemToMarker);
}

/**
 * 지역 검색 후 **내 위치 기준 반경** 안의 장소만 남기고 거리순 정렬.
 * 네이버 API는 반경 파라미터가 없어, 최대 5페이지(25건)까지 받아 후보를 넓힌 뒤 필터합니다.
 */
export async function searchNaverLocalNearby(
  query: string,
  originLat: number,
  originLng: number,
  options?: { maxResults?: number; radiusMeters?: number },
): Promise<PlaceMarker[]> {
  const radiusMeters = options?.radiusMeters ?? getNearbyRadiusMeters();
  const maxResults = Math.min(options?.maxResults ?? 5, 10);

  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) {
    return [];
  }

  const seen = new Set<string>();
  const allItems: NaverLocalItem[] = [];

  for (let page = 0; page < 5; page++) {
    const start = page * 5 + 1;
    const items = await fetchNaverLocalPage(query, start, 5);
    if (items.length === 0) break;
    for (const it of items) {
      const key = `${it.mapx}:${it.mapy}:${it.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allItems.push(it);
    }
    if (items.length < 5) break;
  }

  if (allItems.length === 0) return [];

  const withDistance: PlaceMarker[] = allItems.map((item) => {
    const m = itemToMarker(item);
    const d = haversineDistanceMeters(originLat, originLng, m.lat, m.lng);
    return { ...m, distanceMeters: Math.round(d) };
  });

  const inRadius = withDistance.filter((p) => (p.distanceMeters ?? 0) <= radiusMeters);
  const pool = inRadius.length > 0 ? inRadius : [...withDistance].sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));

  pool.sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  return pool.slice(0, maxResults);
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
