/**
 * 토스페이먼츠 키 종류 (개발자센터 → 내 API 키)
 *
 * - **결제위젯 연동 키** → SDK `widgets()` (결제수단·약관 UI). `payment()` 에는 사용 불가.
 * - **API 개별 연동 키** → SDK `payment()` (통합 결제창). `widgets()` 에 넣으면 "결제위젯 연동 키로…" 오류.
 *
 * 단건 `/pay` 는 `NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY` 가 있으면 결제창, 없으면 위젯 키로 위젯 UI.
 * 서버 승인·빌링은 **클라이언트와 같은 키 세트의 시크릿**을 써야 합니다.
 *
 * @see https://docs.tosspayments.com/reference/authorization
 */
export function getTossAuthorizationHeader(secretKey: string): string {
  const token = Buffer.from(`${secretKey}:`).toString("base64");
  return `Basic ${token}`;
}

export type TossCheckoutMode = "widget" | "payment";

/**
 * 브라우저 SDK용 클라이언트 키와 연동 방식.
 * API 개별 키가 우선 (많은 사용자가 위젯 대신 개별 키만 발급받는 경우).
 */
export function getTossCheckoutClientKeyAndMode(): {
  mode: TossCheckoutMode;
  clientKey: string;
} {
  const paymentsKey = process.env.NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY?.trim();
  if (paymentsKey) {
    return { mode: "payment", clientKey: paymentsKey };
  }
  const widgetKey = process.env.NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY?.trim();
  if (widgetKey) {
    return { mode: "widget", clientKey: widgetKey };
  }
  throw new Error(
    "토스 클라이언트 키가 없습니다. API 개별 연동이면 NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY, 결제위젯이면 NEXT_PUBLIC_TOSS_WIDGET_CLIENT_KEY 를 설정하세요.",
  );
}

/** 결제 승인 API(`/v1/payments/confirm`) — 클라이언트 키 종류와 짝이 맞는 시크릿 */
export function getTossSecretKeyForConfirm(): string {
  if (process.env.NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY?.trim()) {
    const k = process.env.TOSS_PAYMENTS_SECRET_KEY?.trim();
    if (!k) {
      throw new Error(
        "NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY 를 쓰는 경우 TOSS_PAYMENTS_SECRET_KEY 가 필요합니다. (API 개별 연동 시크릿 키)",
      );
    }
    return k;
  }
  return getTossWidgetSecretKey();
}

/** 결제위젯 연동 시크릿 키 (서버 전용) — 빌링·위젯 전용 흐름 */
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
