// 북메이커 클로징 배당 아카이브 — 종료 경기의 킥오프 직전 마지막 스냅샷을 (경기, 북) 1행으로 영구 보존.
// OddsBookSnapshot 은 보존 14일(odds-mover-alert 가 정리)이라 그냥 두면 "북메이커 정확도 랭킹"의
// 표본이 영원히 안 찬다. 랭킹 공개는 표본이 찬 뒤(수개월)지만 적재는 지금부터 돌아야 한다.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isCronAuthorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 스캔 범위 — 원본 보존이 14일이므로 그 안쪽만 본다. 13일로 잡아 삭제 경계에 여유를 둔다.
// 하루 놓쳐도 다음 실행이 같은 구간을 다시 훑으므로 자가 복구된다.
const SCAN_DAYS = 13;
const INSERT_CHUNK = 500;

interface ClosingRow {
  matchId: number;
  book: string;
  league: string;
  startTime: Date;
  capturedAt: Date;
  homeOdds: number;
  drawOdds: number | null;
  awayOdds: number;
  result: string;
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - SCAN_DAYS * 86400_000);

  let rows: ClosingRow[];
  try {
    // 경기×북 조합마다 킥오프 이전 마지막 스냅샷 한 행(DISTINCT ON).
    // 이미 적재된 (matchId, book) 은 NOT EXISTS 로 잘라 매 실행의 삽입량을 줄인다.
    // 결과는 Match.homeScore/awayScore 기준 — 축구 연장·승부차기가 포함된 스코어라면
    // 정규시간 기준 배당과 어긋날 수 있다(리그전에는 연장이 없어 현재는 영향 없음).
    rows = await prisma.$queryRaw<ClosingRow[]>`
      SELECT DISTINCT ON (s."matchId", s.book)
        s."matchId"          AS "matchId",
        s.book               AS "book",
        m.league             AS "league",
        m."startTime"        AS "startTime",
        s."fetchedAt"        AS "capturedAt",
        s."homeOdds"         AS "homeOdds",
        s."drawOdds"         AS "drawOdds",
        s."awayOdds"         AS "awayOdds",
        CASE
          WHEN m."homeScore" > m."awayScore" THEN 'HOME'
          WHEN m."homeScore" < m."awayScore" THEN 'AWAY'
          ELSE 'DRAW'
        END                  AS "result"
      FROM "OddsBookSnapshot" s
      JOIN "Match" m ON m.id = s."matchId"
      WHERE m.status = 'FINISHED'
        AND m."startTime" >= ${since}
        AND m."homeScore" IS NOT NULL
        AND m."awayScore" IS NOT NULL
        AND s."fetchedAt" <= m."startTime"
        AND NOT EXISTS (
          SELECT 1 FROM "BookClosingOdds" b
          WHERE b."matchId" = s."matchId" AND b.book = s.book
        )
      ORDER BY s."matchId", s.book, s."fetchedAt" DESC
    `;
  } catch (e) {
    // OddsBookSnapshot 또는 BookClosingOdds 미생성 상태 — 조용히 skip.
    await recordCronRun("closing-odds", { ok: false, error: String(e).slice(0, 200) });
    return NextResponse.json({ ok: true, skipped: "table missing", detail: String(e).slice(0, 120) });
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const res = await prisma.bookClosingOdds.createMany({
      data: rows.slice(i, i + INSERT_CHUNK),
      skipDuplicates: true,
    });
    inserted += res.count;
  }

  const total = await prisma.bookClosingOdds.count();
  await recordCronRun("closing-odds", { count: inserted });
  return NextResponse.json({ ok: true, candidates: rows.length, inserted, total });
}
