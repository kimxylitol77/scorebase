// 클라이언트(브라우저) + 서버 SSR 모두 사용 가능한 anon 키 클라이언트.
// SELECT 만 작동하도록 RLS 정책 설정됨.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function supabaseClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "[supabase/client] NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수가 필요합니다.",
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false },
  });
  return _client;
}
