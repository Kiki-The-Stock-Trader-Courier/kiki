import { NextResponse } from "next/server";

/**
 * GET /api/integrations/status
 * — 비밀 값은 노출하지 않고, 서버에 키가 설정됐는지 여부만 반환합니다.
 */
export async function GET() {
  const naver =
    Boolean(process.env.NAVER_CLIENT_ID?.trim()) &&
    Boolean(process.env.NAVER_CLIENT_SECRET?.trim());
  const n8nChat = Boolean(process.env.N8N_CHAT_WEBHOOK_URL?.trim());
  const siteUrl = Boolean(process.env.NEXT_PUBLIC_SITE_URL?.trim());
  const supabase =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());

  return NextResponse.json({
    supabase,
    naver,
    n8nChat,
    siteUrl,
  });
}
