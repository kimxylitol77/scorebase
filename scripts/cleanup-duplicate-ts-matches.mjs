// scripts/cleanup-duplicate-ts-matches.mjs
// "ts:" prefix 매치 row 중 같은 league + 시각 윈도우 + 양 팀 이름 normalize 매칭되는
// non-ts 매치 (api-football / ESPN / football-data 등) 가 있으면 중복 — ts 매치 정리.
//
// 처리:
//   1. ts 매치의 TheSportsMatchCache 가 있으면 → non-ts 매치로 cache.matchId 이전
//      (non-ts 에 이미 cache 있으면 그건 keep, ts cache 삭제)
//   2. ts 매치 row 삭제
//
// 배경 (2026-05-25): commit f6f60ca 의 SKIP_LEAGUES 60+ → 8 축소 후 endpoint dedup
// 가드가 Team 중복 row (EPL/LALIGA Barcelona 4 row 등) 때문에 ts/non-ts 매치를 같은
// 경기로 인식 못해 ts: 매치 row 가 추가로 만들어졌음. EPL 8 + COPA_LIB 10 + 등.
// route.ts 의 dedup 가드는 이번 fix 로 강화. 기존 중복은 이 스크립트가 cleanup.
//
// 사용:
//   node --env-file=.env.local scripts/cleanup-duplicate-ts-matches.mjs           # dry-run
//   node --env-file=.env.local scripts/cleanup-duplicate-ts-matches.mjs --apply   # 실행

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// 매칭 윈도우 — 야구만 넓다.
// 2026-09-05: MLB·NPB 중복 7건이 ±90분 밖이라 이 잡이 전부 놓치고 있었다(간격 220~360분).
//   원인 둘. ① 더블헤더 2차전은 "1차전 끝나고 시작" 이라 ESPN 예정 시각과 ts 실제 시각이 3~6시간
//   벌어진다. ② ts 가 예정 시각을 아예 다르게 잡는 경기가 있다.
//   실측 사례: DET@CLE 2차전이 ESPN 23:10 · ts 02:15(+3h5m), CHC@NYM 이 6시간 차.
// ⚠ 넓힌 만큼 더블헤더 1차전에 잘못 붙을 수 있어 **가장 가까운 시각** 후보 하나만 고른다.
//   1·2차전이 둘 다 non-ts(ESPN)면 서로 짝지어지지 않는다 — 이 잡은 ts↔non-ts 만 본다.
const BASEBALL = new Set(["MLB", "KBO", "NPB", "CPBL", "LMB", "KBO_FUTURES", "NPB_MINOR"]);
const windowMs = (league) => (BASEBALL.has(league) ? 8 : 1.5) * 60 * 60 * 1000;

function normalizeTeamName(s) {
  return s
    .toLowerCase()
    .replace(/\b(fc|cf|ac|afc|sc|cd|rcd|sv|ss|ssc|nk|hsv|fk|club)\b/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}
function sameTeamName(a, b) {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

async function main() {
  console.log(`▶ ts: 중복 매치 cleanup (${APPLY ? "APPLY" : "dry-run"})\n`);

  const tsMatches = await prisma.match.findMany({
    where: { externalId: { startsWith: "ts-" } },
    select: {
      id: true,
      league: true,
      externalId: true,
      startTime: true,
      status: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  console.log(`총 ts: 매치 ${tsMatches.length}건 검사\n`);

  let dupFound = 0;
  let cacheMigrated = 0;
  let cacheDropped = 0;
  let matchDeleted = 0;
  const dupByLeague = new Map();

  // ── 1단계: 스캔 (읽기 전용, 트랜잭션 밖) ──────────────────────────────
  // 종전엔 스캔까지 한 인터랙티브 트랜잭션 안에서 돌렸는데, Neon 이 긴 트랜잭션을 끊어
  // P2028("Transaction not found")로 죽었다 — Prisma timeout 을 600s 로 올려도 그대로였다
  // (2026-09-05 야구 창 확대 후 실측). 읽기는 밖에서, 쓰기만 쌍마다 짧은 트랜잭션으로 나눈다.
  const plan = [];
  {
      for (const ts of tsMatches) {
        const startMs = ts.startTime.getTime();
        const candidates = await prisma.match.findMany({
          where: {
            league: ts.league,
            startTime: {
              gte: new Date(startMs - windowMs(ts.league)),
              lte: new Date(startMs + windowMs(ts.league)),
            },
            NOT: { externalId: { startsWith: "ts-" } },
          },
          select: {
            id: true,
            externalId: true,
            startTime: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        });
        // 이름이 맞는 후보 중 **시각이 가장 가까운** 하나. find() 로 아무거나 집으면
        // 더블헤더에서 2차전 ts 행이 1차전에 붙는다(2026-09-05 DET@CLE 실측).
        const original = candidates
          .filter(
            (c) =>
              (sameTeamName(c.homeTeam.name, ts.homeTeam.name) &&
                sameTeamName(c.awayTeam.name, ts.awayTeam.name)) ||
              (sameTeamName(c.homeTeam.name, ts.awayTeam.name) &&
                sameTeamName(c.awayTeam.name, ts.homeTeam.name)),
          )
          .sort(
            (a, b) =>
              Math.abs(a.startTime.getTime() - startMs) - Math.abs(b.startTime.getTime() - startMs),
          )[0];
        if (!original) continue; // ts only 매치 (COPA_LIB 등) — keep

        dupFound++;
        dupByLeague.set(ts.league, (dupByLeague.get(ts.league) ?? 0) + 1);
        console.log(
          `  [${ts.league}] dup: ts ${ts.externalId} (#${ts.id}) → 원본 ${original.externalId} (#${original.id}) — ${ts.awayTeam.name}@${ts.homeTeam.name}`,
        );
        plan.push({ ts, original });
      }
  }

  // ── 2단계: 적용 (쌍마다 짧은 트랜잭션) ────────────────────────────────
  if (APPLY) {
    for (const { ts, original } of plan) {
      await prisma.$transaction(async (tx) => {
        // ts 매치의 cache 가 있으면 원본으로 이전
        const tsCache = await tx.theSportsMatchCache.findUnique({
          where: { matchId: ts.id },
        });
        if (tsCache) {
          const originalCache = await tx.theSportsMatchCache.findUnique({
            where: { matchId: original.id },
            select: { id: true },
          });
          if (originalCache) {
            // 원본에 이미 cache 있음 → ts cache 그냥 삭제
            await tx.theSportsMatchCache.delete({ where: { matchId: ts.id } });
            cacheDropped++;
          } else {
            // 원본에 cache 없음 → ts cache 의 matchId 만 원본으로 update
            await tx.theSportsMatchCache.update({
              where: { matchId: ts.id },
              data: { matchId: original.id },
            });
            cacheMigrated++;
          }
        }
        // MatchVote 는 Match 에 FK 가 없다(스키마 확인) — cascade 가 안 걸려 명시 삭제해야
        // 고아 투표가 남는다. 2026-09-05 중복 정리 때 확인.
        await tx.matchVote.deleteMany({ where: { matchId: ts.id } });
        await tx.match.delete({ where: { id: ts.id } });
        matchDeleted++;
      });
    }
  }

  console.log("\n=== 요약 ===");
  console.log(`중복 발견: ${dupFound}`);
  for (const [lg, cnt] of [...dupByLeague].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${lg.padEnd(20)} ${cnt}`);
  }
  if (APPLY) {
    console.log(`\ncache 이전: ${cacheMigrated}, cache 삭제(원본에 이미 있음): ${cacheDropped}`);
    console.log(`매치 삭제: ${matchDeleted}`);
    console.log("\n✓ 완료");
  } else {
    console.log("\n[dry-run] 실제 변경 없음. --apply 로 실행.");
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
