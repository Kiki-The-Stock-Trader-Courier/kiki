/**
 * 토스페이먼츠 **API 개별 연동 키** (개발자센터 → 내 API 키 → API 개별 연동 키)
 * - 클라이언트 키: 브라우저 SDK 초기화 (`loadTossPayments` 등)
 * - 시크릿 키: 서버에서 결제 승인·빌링 API 호출 시 Basic 인증
 *
 * 결제위젯 전용 연동 키와는 다른 항목에서 발급됩니다. 이 프로젝트는 개별 연동 키만 사용합니다.
 *
 * @see https://docs.tosspayments.com/reference/authorization
 */
export function getTossAuthorizationHeader(secretKey: string): string {
  const token = Buffer.from(`${secretKey}:`).toString("base64");
  return `Basic ${token}`;
}

/** API 개별 연동 시크릿 키 (서버 전용, 절대 클라이언트에 노출 금지) */
export function getTossIndividualSecretKey(): string {
  const k = process.env.TOSS_INDIVIDUAL_SECRET_KEY?.trim();
  if (!k) {
    throw new Error(
      "TOSS_INDIVIDUAL_SECRET_KEY 가 설정되지 않았습니다. (개발자센터 → API 개별 연동 키 → 시크릿 키)",
    );
  }
  return k;
}

/** API 개별 연동 클라이언트 키 (NEXT_PUBLIC — 브라우저 SDK용) */
export function getTossIndividualClientKey(): string {
  const k = process.env.NEXT_PUBLIC_TOSS_INDIVIDUAL_CLIENT_KEY?.trim();
  if (!k) {
    throw new Error(
      "NEXT_PUBLIC_TOSS_INDIVIDUAL_CLIENT_KEY 가 설정되지 않았습니다. (개발자센터 → API 개별 연동 키 → 클라이언트 키)",
    );
  }
  return k;
}
