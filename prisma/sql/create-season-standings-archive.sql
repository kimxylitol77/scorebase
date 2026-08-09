-- SeasonStandingsArchive 테이블 생성 (db push 금지 정책 — raw SQL 직접 실행).
-- 순위 캐시 3종(ts·af·농구)이 리그당 1행이라 시즌 롤오버 때 최종 순위가 소멸하는 것을 막는
-- 시즌별 영구 아카이브. 매일 (league, seasonLabel) upsert — 롤오버로 라벨이 바뀌면
-- 이전 시즌 행이 자연히 동결돼 최종 순위가 된다.
--
-- 운영 적용:
--   npx prisma db execute --file prisma/sql/create-season-standings-archive.sql
--   npx prisma generate    # 적용 후 클라이언트 재생성
--
-- 신규 빈 테이블이라 기존 테이블 락 없음. 관례대로 lock_timeout 만 짧게 건다.
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS "SeasonStandingsArchive" (
    "id"          SERIAL       NOT NULL,
    "league"      TEXT         NOT NULL,
    "seasonLabel" TEXT         NOT NULL,
    "source"      TEXT         NOT NULL,
    "rows"        JSONB        NOT NULL DEFAULT '[]',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeasonStandingsArchive_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SeasonStandingsArchive_league_seasonLabel_key"
    ON "SeasonStandingsArchive"("league", "seasonLabel");

CREATE INDEX IF NOT EXISTS "SeasonStandingsArchive_league_idx"
    ON "SeasonStandingsArchive"("league");
