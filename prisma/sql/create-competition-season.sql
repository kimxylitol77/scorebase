-- CompetitionSeason 테이블 생성 (db push 금지 정책 — raw SQL 직접 실행).
-- 리그의 고정 정보와 매년 바뀌는 시즌 정보를 분리하는 레지스트리.
-- 신규 빈 테이블이라 기존 테이블 락 없음.
--
-- 운영 적용 (본 작업에서는 실행하지 않음):
--   psql "$DATABASE_URL" -f prisma/sql/create-competition-season.sql
--   npx prisma generate    # 적용 후 클라이언트 재생성
--
-- 장기 트랜잭션이 물고 있으면 DDL 이 큐를 막으므로 lock_timeout 을 짧게 건다
-- (2026 prod DDL 락 사고 이후 정착된 관례).
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS "CompetitionSeason" (
    "id"               SERIAL       NOT NULL,
    "league"           TEXT         NOT NULL,
    "provider"         TEXT         NOT NULL,
    "providerLeagueId" TEXT         NOT NULL,
    "providerSeasonId" TEXT         NOT NULL,
    "seasonLabel"      TEXT         NOT NULL,
    "seasonYear"       INTEGER      NOT NULL,
    "startsAt"         TIMESTAMP(3),
    "endsAt"           TIMESTAMP(3),
    "status"           TEXT         NOT NULL DEFAULT 'DISCOVERED',
    "discoveredAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt"       TIMESTAMP(3),
    "activatedAt"      TIMESTAMP(3),
    "lastCheckedAt"    TIMESTAMP(3),
    "teamCount"        INTEGER,
    "mappedTeamCount"  INTEGER,
    "metadata"         JSONB,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionSeason_pkey" PRIMARY KEY ("id")
);

-- 같은 provider 에서 같은 시즌 uuid 는 리그당 하나만.
CREATE UNIQUE INDEX IF NOT EXISTS "CompetitionSeason_league_provider_providerSeasonId_key"
    ON "CompetitionSeason" ("league", "provider", "providerSeasonId");

CREATE INDEX IF NOT EXISTS "CompetitionSeason_league_status_idx"
    ON "CompetitionSeason" ("league", "status");

CREATE INDEX IF NOT EXISTS "CompetitionSeason_provider_status_idx"
    ON "CompetitionSeason" ("provider", "status");

CREATE INDEX IF NOT EXISTS "CompetitionSeason_status_seasonYear_idx"
    ON "CompetitionSeason" ("status", "seasonYear");

-- 핵심 불변식: 같은 league/provider 에 ACTIVE 는 최대 하나.
-- Prisma schema 로는 부분 unique index 를 표현할 수 없어 여기서 raw 로 만든다.
-- 애플리케이션(activateSeason)도 트랜잭션으로 같은 불변식을 지킨다 — 이중 방어.
CREATE UNIQUE INDEX IF NOT EXISTS "CompetitionSeason_active_unique"
    ON "CompetitionSeason" ("league", "provider")
    WHERE "status" = 'ACTIVE';
