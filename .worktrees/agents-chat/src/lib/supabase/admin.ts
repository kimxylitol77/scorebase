// service_role 키 사용하는 supabaseAdmin — 서버 전용 (Next.js server + cron 잡 모두).
// SERVICE_ROLE_KEY 는 NEXT_PUBLIC_ 접두사 없어서 클라이언트 번들에 자동 포함 안 됨.
// (server-only 패키지는 cron tsx 환경과 호환 안 돼 제거했지만 클라이언트 import 시도 시
//  process.env.SUPABASE_SERVICE_ROLE_KEY 가 undefined 라 throw 됨)

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
