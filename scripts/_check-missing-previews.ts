// SCHEDULED 매치 중 PREVIEW article 누락된 비율 — 리그별 카운트.
// 24시간 윈도우(앞으로 24h + 직전 6h) 매치만 봄 — 지난 매치는 PREVIEW 의미 없음.

import { prisma } from "../src/lib/db";

const NOW = new Date();
const WINDOW_START = new Date(NOW.getTime() - 6 * 3600 * 1000);
const WINDOW_END = new Date(NOW.getTime() + 24 * 3600 * 1000);

async function main() {
  // SCHEDULED 매치 + 시작 시간이 윈도우 내
  const matches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gte: WINDOW_START, lte: WINDOW_END },
    },
    select: { id: true, league: true, startTime: true, externalId: true },
  });

  // 각 매치의 preview article 존재 여부
  const matchIds = matches.map((m) => m.id);
  const previews = await prisma.article.findMany({
    where: {
      type: "PREVIEW",
      matchId: { in: matchIds },
    },
    select: { matchId: true, status: true },
  });
  const previewByMatch = new Map<number, string>();
  for (const p of previews) {
    if (p.matchId != null) previewByMatch.set(p.matchId, p.status);
  }

  // 리그별 집계
  const byLeague = new Map<
    string,
    { total: number; published: number; draft: number; missing: number }
  >();
  for (const m of matches) {
    const row = byLeague.get(m.league) ?? {
      total: 0,
      published: 0,
      draft: 0,
      missing: 0,
    };
    row.total++;
    const status = previewByMatch.get(m.id);
    if (status === "PUBLISHED") row.published++;
    else if (status) row.draft++;
    else row.missing++;
    byLeague.set(m.league, row);
  }

  const rows = Array.from(byLeague.entries())
    .map(([league, r]) => ({ league, ...r, missingPct: (r.missing / r.total) * 100 }))
    .sort((a, b) => b.missing - a.missing);

  console.log(
    `\n시간 윈도우: ${WINDOW_START.toISOString()} ~ ${WINDOW_END.toISOString()}\n`,
  );
  console.log(
    `리그          전체  PUBLISHED  DRAFT  누락  누락%`,
  );
  console.log("─".repeat(60));
  for (const r of rows) {
    console.log(
      `${r.league.padEnd(13)} ${String(r.total).padStart(4)}  ${String(r.published).padStart(8)}  ${String(r.draft).padStart(5)}  ${String(r.missing).padStart(4)}  ${r.missingPct.toFixed(0).padStart(4)}%`,
    );
  }
  const tot = rows.reduce((s, r) => s + r.total, 0);
  const miss = rows.reduce((s, r) => s + r.missing, 0);
  console.log("─".repeat(60));
  console.log(
    `합계          ${String(tot).padStart(4)}              ${String(miss).padStart(4)}  ${((miss / tot) * 100).toFixed(0)}%\n`,
  );

  // 누락 매치 상세 (최대 30개)
  const missingMatches = matches.filter((m) => !previewByMatch.has(m.id));
  console.log(`누락 매치 (앞 30개):`);
  for (const m of missingMatches.slice(0, 30)) {
    console.log(
      `  ${m.league.padEnd(12)} ${m.startTime.toISOString().slice(0, 16)}  match#${m.id}  ${m.externalId ?? ""}`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
