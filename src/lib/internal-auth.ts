// 내부 워커 전용 엔드포인트의 Bearer 인증 — INTERNAL_API_TOKEN.
//
// 기존 내부 라우트들은 같은 3줄을 각자 인라인으로 갖고 있다. 여기서는 새로 추가되는
// 라우트만 이 헬퍼를 쓴다 (기존 라우트를 건드릴 이유가 없어 그대로 둔다).

/** 토큰이 설정돼 있고 헤더가 정확히 일치할 때만 true. 토큰 미설정이면 항상 false(fail-closed). */
export function bearerOk(authHeader: string | null, token: string | undefined): boolean {
  if (!token) return false;
  if (!authHeader) return false;
  return authHeader === `Bearer ${token}`;
}

/** Request 의 Authorization 헤더를 INTERNAL_API_TOKEN 과 대조. */
export function internalAuthorized(req: { headers: { get(name: string): string | null } }): boolean {
  return bearerOk(req.headers.get("authorization"), process.env.INTERNAL_API_TOKEN);
}
