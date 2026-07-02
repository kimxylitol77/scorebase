// cron 라우트 공용 인증 — Bearer CRON_SECRET(Vercel cron 이 자동 전송) 또는
// Bearer INTERNAL_API_TOKEN(맥미니·Lightsail 등 자체 워커) 만 허용.
//
// fail-closed: env 미설정이면 전부 거부한다. 과거엔 "CRON_SECRET 미설정 시 전면 개방"
// 패턴이 35개 라우트에 복붙돼 있어 env 누락 한 번이면 유료 API 잡이 무인증 공개됐다
// (2026-07 감사 C1). 로컬 수동 실행은 .env.local 의 CRON_SECRET 를 Bearer 로 보내면 된다.
export function isCronAuthorized(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  const internal = process.env.INTERNAL_API_TOKEN;
  return Boolean(
    (secret && auth === `Bearer ${secret}`) ||
      (internal && auth === `Bearer ${internal}`),
  );
}
