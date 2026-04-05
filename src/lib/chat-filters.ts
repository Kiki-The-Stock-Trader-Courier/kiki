/**
 * 사용자 한국어 메시지에서 검색 키워드·가격·지역 힌트를 추출합니다.
 * (긴 키워드 우선 매칭, 동의어 보강 — LLM 없이 규칙 기반)
 */
export type ParsedFilters = {
  /** 네이버 지역 검색 query 에 넣을 키워드 */
  keyword: string;
  /** 원 단위 상한 (예: 15000). 없으면 가격 필터 생략 */
  maxPriceKrw?: number;
  /**
   * 사용자 문장에 직접 나온 지역·상권 이름 (예: 강남, 홍대).
   * GPS 역지오코딩과 별개로, "강남 중식"처럼 말한 경우 검색어에 붙입니다.
   */
  locationHint?: string;
};

/** 긴 문자열을 먼저 매칭 (부분 문자열 오인 방지, 예: "회식" → 회(X)) */
const CATEGORY_WORDS: { w: string; k: string }[] = [
  { w: "중국집", k: "중식" },
  { w: "짜장면", k: "중식" },
  { w: "짜장", k: "중식" },
  { w: "탕수육", k: "중식" },
  { w: "초밥", k: "일식" },
  { w: "라멘", k: "일식" },
  { w: "돈까스", k: "일식" },
  { w: "우동", k: "일식" },
  { w: "파스타", k: "양식" },
  { w: "스테이크", k: "양식" },
  { w: "떡볶이", k: "분식" },
  { w: "순대", k: "분식" },
  { w: "족발", k: "한식" },
  { w: "보쌈", k: "한식" },
  { w: "횟집", k: "회" },
  { w: "회집", k: "회" },
  { w: "생선회", k: "회" },
  { w: "한식", k: "한식" },
  { w: "중식", k: "중식" },
  { w: "일식", k: "일식" },
  { w: "양식", k: "양식" },
  { w: "카페", k: "카페" },
  { w: "치킨", k: "치킨" },
  { w: "피자", k: "피자" },
  { w: "베이커리", k: "베이커리" },
  { w: "술집", k: "술집" },
  { w: "고기", k: "고기집" },
  { w: "분식", k: "분식" },
  { w: "디저트", k: "디저트" },
  { w: "브런치", k: "브런치" },
].sort((a, b) => b.w.length - a.w.length);

/** 문장에 포함되면 검색어에 붙이는 지역·상권 (긴 이름 우선) */
const AREA_HINTS: string[] = [
  "강남역",
  "홍대입구",
  "건대입구",
  "잠실역",
  "영등포역",
  "신촌역",
  "강남",
  "서초",
  "송파",
  "잠실",
  "홍대",
  "신촌",
  "마포",
  "연남",
  "성수",
  "건대",
  "신사",
  "압구정",
  "명동",
  "을지로",
  "종로",
  "이태원",
  "한남",
  "여의도",
  "영등포",
  "구로",
  "신림",
  "관악",
  "수원",
  "분당",
  "판교",
  "부산",
  "해운대",
  "광안리",
  "대구",
  "제주",
  "서귀포",
].sort((a, b) => b.length - a.length);

function extractLocationHint(text: string): string | undefined {
  const t = text.trim();
  for (const area of AREA_HINTS) {
    if (t.includes(area)) return area;
  }
  return undefined;
}

export function parseFiltersFromText(text: string): ParsedFilters {
  const t = text.trim();
  let maxPriceKrw: number | undefined;

  // N만 원 / N만원
  const man = t.match(/(\d{1,2})\s*만\s*원/);
  if (man) {
    maxPriceKrw = parseInt(man[1]!, 10) * 10000;
  }

  // N천 원
  const eok = t.match(/(\d+)\s*천\s*원/);
  if (eok && maxPriceKrw == null) {
    maxPriceKrw = parseInt(eok[1]!, 10) * 1000;
  }

  // 숫자+원 (연도 오인 방지: 반드시 '원' 포함)
  const numWon = t.match(/(\d{4,6})\s*원/);
  if (numWon && maxPriceKrw == null) {
    const n = parseInt(numWon[1]!, 10);
    if (n >= 1000 && n <= 500000) {
      maxPriceKrw = n;
    }
  }

  let keyword = "맛집";
  for (const { w, k } of CATEGORY_WORDS) {
    if (t.includes(w)) {
      keyword = k;
      break;
    }
  }

  if (keyword === "맛집" && /식당|음식점|먹을|먹고|밥/.test(t)) {
    keyword = "식당";
  }

  const locationHint = extractLocationHint(t);

  return { keyword, maxPriceKrw, locationHint };
}
