-- CoachTenureArchive 테이블 생성 (db push 금지 정책 — raw SQL 직접 실행).
-- 팀별 감독 재임 이력 영구 아카이브 — data/team-coaches.json 은 "현 감독" 스냅샷이라
-- 교체되면 이전 감독의 재임 기록이 어디에도 안 남는다. 일일 diff 로 부임·이임을 축적한다.
-- endedAt null = 현직. 위키형 데이터 축적 (감독 축).
--
-- 운영 적용:
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/sql/create-coach-tenure-archive.sql
--   npx prisma generate
--
-- 신규 빈 테이블이라 기존 테이블 락 없음. 관례대로 lock_timeout 만 짧게 건다.
SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS "CoachTenureArchive" (
    "id"          SERIAL       NOT NULL,
    "teamId"      INTEGER      NOT NULL,
    "league"      TEXT         NOT NULL,
    "coachId"     TEXT,
    "name"        TEXT         NOT NULL,
    "nameKo"      TEXT,
    "joinedAt"    TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt"     TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachTenureArchive_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CoachTenureArchive_teamId_endedAt_idx"
    ON "CoachTenureArchive"("teamId", "endedAt");
