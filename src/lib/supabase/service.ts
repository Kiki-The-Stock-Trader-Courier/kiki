import { createClient } from "@supabase/supabase-js";

/**
 * 서버 전용 — RLS 우회하여 payment_orders, billing_keys 등 기록
 * SUPABASE_SERVICE_ROLE_KEY 는 절대 클라이언트에 노출하지 마세요.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
