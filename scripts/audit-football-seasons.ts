// 축구 시즌 전환 감사 CLI — 운영 DB 읽기 전용.
//
//   npm run audit:football-seasons
//   npm run audit:football-seasons -- --json
//   npm run audit:football-seasons -- --all          # 일정 없는 리그까지 전부
//   npm run audit:football-seasons -- --league EPL,UCL
//   npm run audit:football-seasons -- --full         # 예외 없는 리그도 표에 포함
//
// 외부 API 를 부르지 않는다. 운영 DB write 도 하지 않는다 — 이 스크립트에는 write 경로 자체가 없다.

import { prisma } from "../src/lib/db";
import {
  auditFootballSeasons,
  formatAuditTable,
  tournamentIdFor,
  type LeagueAudit,
} from "../src/lib/sports/season-watch";

/** 결과에 반드시 포함해 보는 리그 — 사용자가 지목한 점검 대상. */
const WATCHLIST = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1",
  "CHAMPIONSHIP", "LALIGA_2", "BUNDESLIGA_2", "SERIE_B", "LIGUE_2",
  "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "JUPILER_PL", "SPL",
  "UCL", "UEL", "UECL",
  "CZECH_2", "DENMARK_2", "AUSTRIA_2", "IRELAND_2", "HUNGARY_2",
  "UKRAINE_PL", "YKKONEN", "VENEZUELA_PD",
  "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE",
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) {
    return process.argv[i + 1];
  }
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

function fmtRow(l: LeagueAudit): string {
  const parts = [
    l.league.padEnd(20),
    l.kind.padEnd(8),
    l.state.padEnd(15),
    `src=${l.standingsSource}`.padEnd(20),
    `repo=${(l.repoSeasonId ?? "-").slice(0, 10)}`.padEnd(18),
    `active=${(l.activeSeasonId ?? "-").slice(0, 10)}`.padEnd(20),
    `cache=${(l.cacheSeasonId ?? "-").slice(0, 10)}`.padEnd(19),
    `age=${l.cacheAgeH == null ? "-" : `${l.cacheAgeH.toFixed(0)}h`}`.padEnd(10),
    `map=${l.mappingRate == null ? "-" : `${(l.mappingRate * 100).toFixed(0)}%`}`.padEnd(9),
    `af=${l.afSeason ?? "-"}`.padEnd(9),
    `45d=${l.fixtures45d}`.padEnd(8),
    `D-${l.daysToFirstFixture == null ? "?" : l.daysToFirstFixture.toFixed(0)}`,
  ];
  return parts.join(" ");
}

async function main() {
  const leaguesArg = arg("league");
  const explicit = leaguesArg ? leaguesArg.split(",").map((s) => s.trim().toUpperCase()) : undefined;

  const result = await auditFootballSeasons({
    leagues: explicit,
    all: has("all"),
  });

  // 워치리스트 중 자동 선정에서 빠진 리그는 따로 한 번 더 검사해 결과에 합친다.
  if (!explicit) {
    const missing = WATCHLIST.filter((l) => !result.leagues.some((r) => r.league === l));
    if (missing.length > 0) {
      const extra = await auditFootballSeasons({ leagues: missing, now: result.generatedAt });
      result.leagues.push(...extra.leagues);
      result.exceptions.push(...extra.exceptions);
      for (const [k, v] of Object.entries(extra.summary)) {
        if (k === "checked") result.summary.checked += v;
        else if (k === "total") result.summary.total += v;
        else {
          const key = k as keyof typeof result.summary;
          result.summary[key] = (result.summary[key] ?? 0) + v;
        }
      }
      result.leagues.sort((a, b) => a.league.localeCompare(b.league));
      result.exceptions.sort((a, b) => a.league.localeCompare(b.league));
    }
  }

  if (has("json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const p = result.poller;
  console.log("=".repeat(100));
  console.log(`축구 시즌 전환 감사 — ${result.generatedAt.toISOString()}`);
  console.log("=".repeat(100));
  console.log(
    `\n[워커] ${p.name}: ${
      p.lastAt ? `마지막 ping ${p.ageMin?.toFixed(0)}분 전` : "heartbeat 기록 없음(미배포 또는 중단)"
    }` +
      `${p.ok === null ? "" : ` · 마지막 실행 ${p.ok ? "성공" : "실패"}`}` +
      `${p.consecutiveFailures ? ` · 연속 실패 ${p.consecutiveFailures}회` : ""}` +
      `${p.lastLeagues ? ` · 대상 ${p.lastLeagues}리그(실패 ${p.lastErrCount ?? 0})` : ""}`,
  );
  if (p.failedLeagues.length > 0) {
    console.log(`        실패 리그: ${p.failedLeagues.slice(0, 10).join(", ")}`);
  }

  console.log(`\n[요약] 검사 ${result.summary.checked}리그 · 예외 ${result.exceptions.length}리그`);
  for (const [k, v] of Object.entries(result.summary)) {
    if (k === "checked" || k === "total" || !v) continue;
    console.log(`        ${k}: ${v}`);
  }

  const kinds: Array<[string, LeagueAudit["kind"]]> = [
    ["리그", "LEAGUE"],
    ["컵·단계 대회", "CUP"],
    ["친선", "FRIENDLY"],
  ];
  const shown = has("full") ? result.leagues : result.exceptions;
  for (const [label, kind] of kinds) {
    const rows = shown.filter((l) => l.kind === kind);
    if (rows.length === 0) continue;
    console.log(`\n── ${label} (${rows.length}) ${"─".repeat(60)}`);
    for (const l of rows) {
      console.log(fmtRow(l));
      for (const i of l.issues) console.log(`${" ".repeat(4)}↳ [${i.severity}] ${i.code}: ${i.detail}`);
    }
  }

  // 매핑 자체가 없는 리그 — 시즌 문제 이전의 문제라 따로 알려준다.
  const noMapping = shown.filter((l) => !tournamentIdFor(l.league));
  if (noMapping.length > 0) {
    console.log(`\n⚠ TheSports 대회 매핑(tsId) 자체가 없는 리그: ${noMapping.map((l) => l.league).join(", ")}`);
  }

  console.log(`\n${"─".repeat(100)}`);
  console.log("압축 표 (예외만):");
  console.log(formatAuditTable(result));
  console.log(
    "\n다음 단계: npm run discover:football-seasons -- --league <CODE>   (외부 API 조회, 기본 dry-run)",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
