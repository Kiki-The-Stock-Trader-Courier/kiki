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

/** OSM 역지오코딩 — 네이버 키워드 검색을 동·구 단위로 좁히기 위한 힌트 */
export type RegionHints = {
  /** 구·시 등 넓은 행정구역 */
  district?: string;
  /** 동·읍·면 등 (가능할 때만) */
  neighbourhood?: string;
};

/**
 * 좌표 기준 동·구 단서 (검색어 보강용).
 * zoom 17로 세부 지역을 우선하고, 실패 시 넓은 구만 사용합니다.
 */
export async function reverseGeocodeRegionHints(
  lat: number,
  lng: number,
): Promise<RegionHints> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "json");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("accept-language", "ko");
    url.searchParams.set("zoom", "17");
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "KikiMap/1.0 (restaurant search)" },
      signal: controller.signal,
      next: { revalidate: 3600 },
    });
    if (!res.ok) return {};
    const d = (await res.json()) as {
      address?: {
        neighbourhood?: string;
        quarter?: string;
        suburb?: string;
        village?: string;
        city_district?: string;
        borough?: string;
        town?: string;
        county?: string;
        city?: string;
      };
    };
    const a = d.address;
    if (!a) return {};

    const neighbourhood =
      a.neighbourhood?.trim() ||
      a.quarter?.trim() ||
      a.village?.trim() ||
      (a.suburb?.trim() && a.suburb.length <= 20 ? a.suburb.trim() : undefined) ||
      (a.town?.trim() && a.town.length <= 20 ? a.town.trim() : undefined);

    const district =
      a.city_district?.trim() ||
      a.borough?.trim() ||
      a.county?.trim() ||
      a.city?.trim();

    const out: RegionHints = {};
    if (district) out.district = district;
    if (neighbourhood && neighbourhood !== district) out.neighbourhood = neighbourhood;
    return out;
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

/** @deprecated 내부적으로 `reverseGeocodeRegionHints`의 district/neighbourhood 우선 사용 */
export async function reverseGeocodeDistrictHint(
  lat: number,
  lng: number,
): Promise<string | undefined> {
  const h = await reverseGeocodeRegionHints(lat, lng);
  return h.district ?? h.neighbourhood;
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
 * 지역 검색 후 **내 위치 기준 반경 안** 장소만 거리순으로 반환합니다.
 * 네이버 API는 좌표 반경이 없어 여러 쿼리·여러 페이지를 합친 뒤 거리로 걸러요.
 * 반경 밖(예: 수 km) 장소를 “가까운 순”으로 보여 주던 폴백은 제거했습니다 — 잘못된 추천을 막기 위함입니다.
 */
export async function searchNaverLocalNearby(
  queryOrQueries: string | string[],
  originLat: number,
  originLng: number,
  options?: { maxResults?: number; radiusMeters?: number },
): Promise<PlaceMarker[]> {
  const queries = (Array.isArray(queryOrQueries) ? queryOrQueries : [queryOrQueries])
    .map((q) => q.trim())
    .filter((q) => q.length > 0);
  const radiusMeters = options?.radiusMeters ?? getNearbyRadiusMeters();
  const maxResults = Math.min(options?.maxResults ?? 5, 10);

  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret || queries.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const allItems: NaverLocalItem[] = [];
  // 쿼리 변형이 많을수록 페이지 수를 줄여 API 호출 폭주를 완화합니다.
  const maxPagesPerQuery = queries.length > 2 ? 4 : 6;

  for (const query of queries) {
    for (let page = 0; page < maxPagesPerQuery; page++) {
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
  }

  if (allItems.length === 0) return [];

  const withDistance: PlaceMarker[] = allItems.map((item) => {
    const m = itemToMarker(item);
    const d = haversineDistanceMeters(originLat, originLng, m.lat, m.lng);
    return { ...m, distanceMeters: Math.round(d) };
  });

  const inRadius = withDistance.filter((p) => (p.distanceMeters ?? 0) <= radiusMeters);
  inRadius.sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  return inRadius.slice(0, maxResults);
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

/**
 * 네이버 지역 검색용 쿼리 조립 (단일 문자열).
 * - keyword: 음식 종류 등
 * - filters.locationHint: 사용자가 문장에 쓴 지역 (예: 강남)
 * - regionHint: GPS 역지오코딩 구·동 (중복 시 한 번만)
 */
export function buildSearchQuery(filters: ParsedFilters, regionHint?: string): string {
  const parts: string[] = [filters.keyword];
  if (filters.locationHint?.trim()) {
    parts.push(filters.locationHint.trim());
  }
  if (regionHint?.trim()) {
    const g = regionHint.trim();
    if (g !== filters.locationHint?.trim()) {
      parts.push(g);
    }
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const s = p.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out.join(" ").trim();
}

/**
 * 네이버 지역 검색용 쿼리 후보 (세부 → 넓은 순).
 * 사용자 문장에 지역이 있으면 그걸 우선하고, 없으면 `RegionHints`로 동·구를 붙입니다.
 */
export function buildSearchQueryVariants(
  filters: ParsedFilters,
  hints?: RegionHints,
  regionParam?: string,
): string[] {
  const kw = (filters.keyword || "맛집").trim();
  const loc = filters.locationHint?.trim();
  const manual = regionParam?.trim();

  const addUnique = (acc: string[], s: string) => {
    const t = s.replace(/\s+/g, " ").trim();
    if (t && !acc.includes(t)) acc.push(t);
  };

  const out: string[] = [];

  if (manual) {
    addUnique(out, `${kw} ${manual}`);
    addUnique(out, kw);
    return out;
  }

  if (loc) {
    addUnique(out, `${kw} ${loc}`);
    const d = hints?.district?.trim();
    if (d && !loc.includes(d)) addUnique(out, `${kw} ${loc} ${d}`);
    addUnique(out, kw);
    return out;
  }

  const neigh = hints?.neighbourhood?.trim();
  const dist = hints?.district?.trim();

  if (neigh && dist) addUnique(out, `${kw} ${neigh} ${dist}`);
  if (neigh) addUnique(out, `${kw} ${neigh}`);
  if (dist) addUnique(out, `${kw} ${dist}`);
  addUnique(out, kw);

  return out;
}
