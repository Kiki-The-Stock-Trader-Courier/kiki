/**
 * OAuth redirect 등에 쓸 공개 사이트 URL.
 * Vercel 등에서 브라우저 origin 이 잘못 잡히는 경우를 막기 위해
 * NEXT_PUBLIC_SITE_URL 이 있으면 우선합니다.
 */
export function getPublicSiteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}
