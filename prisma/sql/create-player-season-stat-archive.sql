-- PlayerSeasonStatArchive 테이블 생성 (db push 금지 정책 — raw SQL 직접 실행).
-- 선수 시즌통계 JSON 2종(data/player-season-stats.json=ts · af-player-season-stats.json=af)이
-- 선수당 현재 시즌 1행 스냅샷이라 주간 리빌드가 시즌을 넘기면 지난 시즌 최종 스탯
-- (슈팅·키패스·태클 등 경기로그로 재계산 불가 지표)이 소멸하는 것을 막는다.
-- 매일 (source, playerId, seasonLabel) upsert — 롤오버 시 이전 시즌 행 자연 동결.
--
-- 운영 적용:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/sql/create-player-season-stat-archive.sql
--   npx prisma generate
--
-- 신규 빈 테이블이라 기존 테이블 락 없음. 관례대로 lock_timeout 만 짧게 건다.
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS "PlayerSeasonStatArchive" (
    "id"          SERIAL       NOT NULL,
    "source"      TEXT         NOT NULL,
    "playerId"    TEXT         NOT NULL,
    "league"      TEXT         NOT NULL,
    "seasonLabel" TEXT         NOT NULL,
    "stat"        JSONB        NOT NULL DEFAULT '{}',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerSeasonStatArchive_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlayerSeasonStatArchive_source_playerId_seasonLabel_key"
    ON "PlayerSeasonStatArchive"("source", "playerId", "seasonLabel");

CREATE INDEX IF NOT EXISTS "PlayerSeasonStatArchive_playerId_idx"
    ON "PlayerSeasonStatArchive"("playerId");

CREATE INDEX IF NOT EXISTS "PlayerSeasonStatArchive_league_seasonLabel_idx"
    ON "PlayerSeasonStatArchive"("league", "seasonLabel");
