// 축구 리그 일정 공백 전수 점검 — "원천(TheSports·api-football)엔 경기가 있는데 우리 DB 엔 없는" 리그를 찾는다.
//   npx tsx --env-file=.env.local scripts/audit-league-schedule-gaps.ts            # 향후 30일
//   npx tsx --env-file=.env.local scripts/audit-league-schedule-gaps.ts --days=21
// 배경(2026-10-03): ISL 새 시즌이 ts 에 0건인데 TS_COVERED 라 af 도 skip → 일정 통째 공백. 시즌 자동 탐지는
// "DB 에 다가오는 경기가 있는 리그"만 보므로 이런 리그를 원리상 못 찾는다. 원천 쪽에서 거꾸로 훑어야 잡힌다.
import "@/lib/env";
import fs from "node:fs";
import { prisma } from "@/lib/db";
import { thesportsGet } from "@/lib/sports/thesports/client";
import { TS_FOOTBALL_COMPETITION_ID } from "@/lib/sports/thesports/football-competitions";
import { TS_COVERED_EXCEPTIONS } from "@/lib/sports/ts-covered-exceptions";
import { API_FOOTBALL_LEAGUE_ID } from "@/lib/sports/api-football-pro";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import tsLeagueMap from "@/lib/sports/thesports/league-id-mapping.json";

const DAYS = Number(process.argv.find((a) => a.startsWith("--days="))?.split("=")[1] ?? 30);
const DAY = 86400;

// collect cron 의 ALL_LEAGUES 는 route 파일 안 상수라 import 할 수 없어 소스에서 읽는다(라우트는 임의 export 불가).
function collectLeagues(): Set<string> {
  const src = fs.readFileSync("src/app/api/cron/collect/route.ts", "utf8");
  const body = src.slice(src.indexOf("const ALL_LEAGUES"), src.indexOf("];", src.indexOf("const ALL_LEAGUES")));
  return new Set([...body.matchAll(/"([A-Z0-9_]+)"/g)].map((m) => m[1]));
}

async function tsCounts(): Promise<Map<string, number>> {
  const byComp = new Map<string, number>();
  const { start, end } = window();
  const t0 = Math.floor(start.getTime() / 1000) + DAY / 2; // 각 UTC 날짜 정오 — diary 는 그 날짜 경기를 준다
  for (let i = 0; i <= DAYS; i++) {
    const d = await thesportsGet<{ code: number; results?: Array<{ competition_id?: string; match_time?: number }> }>("/v1/football/match/diary", { tsp: t0 + i * DAY } as never).catch(() => null);
    for (const m of d?.results ?? []) {
      if (!m.competition_id || !m.match_time) continue;
      const t = m.match_time * 1000;
      if (t < start.getTime() || t > end.getTime()) continue;
      byComp.set(m.competition_id, (byComp.get(m.competition_id) ?? 0) + 1);
    }
  }
  return byComp;
}

// 세 원천(DB·ts·af)을 같은 UTC 날짜 경계로 센다 — 시각으로 자르면 경계 날 경기가 한쪽에만 잡혀 오탐이 난다
// (2026-10-03 A매치 휴식기: 다음 경기가 정확히 7일 뒤라 세리에A 가 "DB 0·af 3" 으로 잘못 나왔다).
function window() {
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + DAYS * DAY * 1000).toISOString().slice(0, 10);
  return { from, to, start: new Date(`${from}T00:00:00Z`), end: new Date(`${to}T23:59:59Z`) };
}

async function afCount(afId: number): Promise<number> {
  const { from, to } = window();
  const y = new Date().getUTCFullYear();
  let best = 0;
  for (const season of [y, y - 1]) {
    const r = await fetch(`https://v3.football.api-sports.io/fixtures?league=${afId}&season=${season}&from=${from}&to=${to}`, {
      headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY ?? "" },
    }).then((x) => x.json()).catch(() => null);
    best = Math.max(best, Number(r?.results ?? 0));
  }
  return best;
}

async function main() {
  const inCollect = collectLeagues();
  const mapping = tsLeagueMap as Array<{ code: string; tsId?: string; tsSeasonId?: string }>;
  const tsCovered = new Set(mapping.filter((e) => e.tsSeasonId).map((e) => e.code));
  const leagues = [...SOCCER_LEAGUES].sort();
  console.log(`축구 ${leagues.length}개 리그 · 향후 ${DAYS}일 — ts diary 수집 중…`);
  const ts = await tsCounts();
  const { start, end } = window();
  const db = new Map(
    (await prisma.match.groupBy({ by: ["league"], where: { startTime: { gte: start, lte: end } }, _count: true })).map((g) => [g.league, g._count]),
  );

  const rows: string[] = [];
  let gaps = 0;
  for (const lg of leagues) {
    const tsComp = TS_FOOTBALL_COMPETITION_ID[lg as keyof typeof TS_FOOTBALL_COMPETITION_ID] ?? mapping.find((e) => e.code === lg)?.tsId;
    // ts 대회 하나를 여러 리그가 조로 나눠 쓰면(카코넨 A·B·C + 위카코넨) ts 수는 합계라 리그별 비교가 안 된다 → af 로만 본다
    const shared = !!tsComp && mapping.filter((e) => e.tsId === tsComp).length > 1;
    const tsN = tsComp && !shared ? ts.get(tsComp) ?? 0 : 0;
    const dbN = db.get(lg) ?? 0;
    const tsCollects = !!TS_FOOTBALL_COMPETITION_ID[lg as keyof typeof TS_FOOTBALL_COMPETITION_ID];
    const afSkip = tsCovered.has(lg) && !TS_COVERED_EXCEPTIONS.has(lg as never);
    const afCollects = inCollect.has(lg) && !afSkip;
    // af 는 DB 가 비었거나 ts 대비 크게 모자랄 때만 묻는다(쿼터 절약)
    const afId = API_FOOTBALL_LEAGUE_ID[lg];
    const afN = afId && (dbN === 0 || dbN < tsN * 0.5) ? await afCount(afId) : -1;
    const src = Math.max(tsN, afN);
    // af 로 수집하는 리그는 collect 가 7일 앞까지만 받는다 — DB 에 경기가 있으면 먼 날짜 부족은 정상(리드타임)
    const leadTimeOnly = afCollects && dbN > 0 && DAYS > 7;
    const gap = !leadTimeOnly && src > 0 && dbN < Math.max(1, src * 0.5);
    if (!gap) continue;
    gaps++;
    const why =
      !tsCollects && !afCollects ? "아무도 수집 안 함(ts 수집 목록 밖 + af skip/미등록)"
      : tsCollects && tsN === 0 && !afCollects ? "ts 수집 대상인데 ts 에 경기 0 + af skip"
      : !afCollects && afN > 0 && tsN === 0 ? "af 에만 경기 있음 + af 수집 꺼짐"
      : "수집은 켜져 있는데 DB 부족(매핑·dedup 확인)";
    rows.push(`${lg.padEnd(22)} DB ${String(dbN).padStart(3)} · ts ${String(tsN).padStart(3)} · af ${afN < 0 ? "  -" : String(afN).padStart(3)} | ts수집 ${tsCollects ? "O" : "X"} af수집 ${afCollects ? "O" : inCollect.has(lg) ? "skip" : "미등록"} | ${why}`);
  }
  console.log(`\n공백 의심 ${gaps}개`);
  for (const r of rows) console.log(r);
  await prisma.$disconnect();
}
main();
