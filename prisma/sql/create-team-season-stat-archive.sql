-- TeamSeasonStatArchive 테이블 생성 (db push 금지 정책 — raw SQL 직접 실행).
-- 팀 페이지 "팀 시즌 통계"(ts season/recent/team/stat 집계)의 시즌별 영구 아카이브.
-- data/team-season-stats.json 이 단일 스냅샷이라 시즌이 바뀌면 25-26 집계가 소멸하는 것을 막는다.
-- 매일 (teamId, seasonLabel) upsert — 롤오버로 라벨이 바뀌면 이전 시즌 행이 자연 동결.
--
-- 운영 적용:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/sql/create-team-season-stat-archive.sql
--   npx prisma generate
--
-- 신규 빈 테이블이라 기존 테이블 락 없음. 관례대로 lock_timeout 만 짧게 건다.
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS "TeamSeasonStatArchive" (
    "id"          SERIAL       NOT NULL,
    "teamId"      INTEGER      NOT NULL,
    "league"      TEXT         NOT NULL,
    "seasonLabel" TEXT         NOT NULL,
    "stat"        JSONB        NOT NULL DEFAULT '{}',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamSeasonStatArchive_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeamSeasonStatArchive_teamId_seasonLabel_key"
    ON "TeamSeasonStatArchive"("teamId", "seasonLabel");

CREATE INDEX IF NOT EXISTS "TeamSeasonStatArchive_league_seasonLabel_idx"
    ON "TeamSeasonStatArchive"("league", "seasonLabel");
