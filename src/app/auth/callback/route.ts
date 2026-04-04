import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Google OAuth 등 PKCE 코드를 세션으로 교환
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/setup";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    const details = encodeURIComponent(error.message);
    return NextResponse.redirect(
      `${origin}/login?error=exchange&details=${details}`,
    );
  }

  const oauthErr = searchParams.get("error_description") ?? searchParams.get("error");
  if (oauthErr) {
    const details = encodeURIComponent(oauthErr);
    return NextResponse.redirect(`${origin}/login?error=oauth&details=${details}`);
  }

  return NextResponse.redirect(`${origin}/login?error=no_code`);
}
