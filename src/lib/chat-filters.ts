/**
 * 사용자 한국어 메시지에서 검색 키워드·가격 상한을 추출 (간단 휴리스틱)
 * n8n/LLM 연동 시 이 결과를 보강하거나 대체할 수 있습니다.
 */
export type ParsedFilters = {
  /** 네이버 지역 검색 query 에 넣을 키워드 */
  keyword: string;
  /** 원 단위 상한 (예: 15000). 없으면 가격 필터 생략 */
  maxPriceKrw?: number;
};

const CATEGORY_WORDS: { w: string; k: string }[] = [
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
  { w: "회", k: "회" },
  { w: "분식", k: "분식" },
  { w: "디저트", k: "디저트" },
  { w: "브런치", k: "브런치" },
];

export function parseFiltersFromText(text: string): ParsedFilters {
  const t = text.trim();
  let maxPriceKrw: number | undefined;

  // N만 원 / N만원
  const man = t.match(/(\d{1,2})\s*만\s*원/);
  if (man) {
    maxPriceKrw = parseInt(man[1]!, 10) * 10000;
  }

  // 이만오천원, 만오천원 등 (간단 케이스)
  const eok = t.match(/(\d+)\s*천\s*원/);
  if (eok && !maxPriceKrw) {
    maxPriceKrw = parseInt(eok[1]!, 10) * 1000;
  }

  // 숫자만 (15000, 12000원)
  const num = t.match(/(\d{4,6})\s*원?/);
  if (num && !maxPriceKrw) {
    maxPriceKrw = parseInt(num[1]!, 10);
  }

  let keyword = "맛집";
  for (const { w, k } of CATEGORY_WORDS) {
    if (t.includes(w)) {
      keyword = k;
      break;
    }
  }

  // "식당 추천" 같이 카테고리만 애매하면 맛집 유지
  if (keyword === "맛집" && /식당|음식|먹/.test(t)) {
    keyword = "식당";
  }

  return { keyword, maxPriceKrw };
}
