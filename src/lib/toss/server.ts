/**
 * 토스페이먼츠 **결제위젯 연동 키** (개발자센터 → 내 API 키 → **결제위젯 연동 키**)
 *
 * `loadTossPayments` / `widgets` / `payment()` 등 **JavaScript SDK**는 이 클라이언트 키만 지원합니다.
 * **API 개별 연동 키**로 SDK를 쓰면 "결제위젯 연동 키의 클라이언트 키로…" 오류가 납니다.
 *
 * 서버의 결제 승인·빌링 API는 **같은 상점 키 세트의 시크릿 키**를 사용해야 클라이언트와 짝이 맞습니다.
 *
 * @see https://docs.tosspayments.com/reference/authorization
 */
export function getTossAuthorizationHeader(secretKey: string): string {
  const token = Buffer.from(`${secretKey}:`).toString("base64");
  return `Basic ${token}`;
}

/** 결제위젯 연동 시크릿 키 (서버 전용) */
export function getTossWidgetSecretKey(): string {
  const k = process.env.TOSS_WIDGET_SECRET_KEY?.trim();
  if (!k) {
    throw new Error(
      "TOSS_WIDGET_SECRET_KEY 가 설정되지 않았습니다. (개발자센터 → 결제위젯 연동 키 → 시크릿 키)",
    );
  }
  return k;
}

/** 결제위젯 연동 클라이언트 키 (NEXT_PUBLIC — 브라우저 SDK) */
export function getTossWidgetClientKey(): string {
  const k = process.env.NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY?.trim();
  if (!k) {
    throw new Error(
      "NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY 가 설정되지 않았습니다. (개발자센터 → 결제위젯 연동 키 → 클라이언트 키)",
    );
  }
  return k;
}
