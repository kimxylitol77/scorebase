import "server-only";

// service_role 키 사용하는 supabaseAdmin — 서버 전용.
// 'server-only' import 로 클라이언트 번들 포함 시 빌드 에러 발생시켜 누출 방지.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "[supabase/admin] NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.",
    );
  }
  _admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: "public" },
  });
  return _admin;
}
