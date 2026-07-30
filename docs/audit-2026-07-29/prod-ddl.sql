-- 감사 대응 신규 테이블 2개. 운영(Neon)에 적용한다.
--
-- 적용 방법 — 둘 중 아무거나.
--   npx prisma db push --skip-generate && npx prisma generate
--   npx prisma db execute --url "$DATABASE_URL" --file docs/audit-2026-07-29/prod-ddl.sql
--
-- main 기준으로 실측 검증했다(2026-07-30, prisma migrate diff --from-url).
-- db push 가 실행하는 것은 아래 CREATE TABLE 2개 + 인덱스 1개뿐이고 DROP 은 없다.
--
-- ⚠️ 단, 오래된 base 의 브랜치에서는 db push 를 돌리지 말 것.
--    즐겨찾기 텔레그램 알림 스키마(UserMatchFollow · User.alertOdds* · PageView.userId)는
--    2026-07-28 에 main 에 머지됐다. 그 이전 base 브랜치에서 db push 를 돌리면
--    prisma 가 "schema 에 없는 것" 으로 보고 DROP 해 회원 즐겨찾기·알림 설정이 날아간다.
--    반드시 main 최신을 머지한 상태에서 실행하라.
--
-- 적용 전 장기 트랜잭션 확인 (메모리 prod-ddl-lock-incident):
--   SELECT pid, state, now() - xact_start AS age FROM pg_stat_activity
--   WHERE xact_start IS NOT NULL AND now() - xact_start > interval '30 seconds';
--
-- 되돌리기: DROP TABLE "RateLimitCounter"; DROP TABLE "BasketballStandingsCache";

SET lock_timeout = '3s';

-- 분산 rate limit 카운터 (공개 챗봇 과금 방어)
CREATE TABLE IF NOT EXISTS "RateLimitCounter" (
    "key"         TEXT NOT NULL,
    "count"       INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "RateLimitCounter_updatedAt_idx"
    ON "RateLimitCounter"("updatedAt");

-- 농구 순위 마지막 정상 스냅샷 (ESPN 장애 시 폴백)
CREATE TABLE IF NOT EXISTS "BasketballStandingsCache" (
    "league"    TEXT NOT NULL,
    "rows"      JSONB NOT NULL DEFAULT '[]',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BasketballStandingsCache_pkey" PRIMARY KEY ("league")
);
