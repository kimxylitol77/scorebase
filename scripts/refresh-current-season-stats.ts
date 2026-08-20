// 선수 페이지 "시즌 상세 기록" 현재 시즌 일간 갱신 — ts season player stat(리그당 1콜) →
// data/player-season-stats.json 병합. build-kleague-player-stats 의 전 리그 일반화.
//
// 왜. 이 JSON 은 주간 정적 갱신(af ~1,100콜)이라 시즌 개막·경기 다음 날에도 지난 시즌이
// 그대로 보였다(2026-08-20 이강인 실측 — 새벽 출전 후에도 레이더가 25-26 PSG). TheSports 는
// 리그당 1콜로 현재 시즌 전 선수 스탯을 주므로(해외파 잡 실증) 15콜이면 매일 돌 수 있다.
//
// 병합 규칙 (기존 af 주간 빌드와 공존).
//  - 뛴 선수만 덮어쓴다(minutes>0) — 개막 전 빈 행이 지난 시즌 확정 기록을 지우지 않게.
//  - 같은 리그의 더 새 시즌이거나 같은 시즌일 때만 덮어쓴다 — stale ts 시즌 id 가 역행 못 하게.
//  - 페이지 렌더 가능한 선수만(TheSportsPlayer 존재) — 도달 불가 스탯으로 JSON 비대 방지.
//
//   npx tsx --env-file=.env.local scripts/refresh-current-season-stats.ts
//   npx tsx --env-file=.env.local scripts/refresh-current-season-stats.ts --dry
import "../src/lib/env";
import * as fs from "fs";
import { PrismaClient } from "@prisma/client";
import { fetchFootballSeasonPlayerStat } from "../src/lib/sports/thesports/football-collector";
import type { TsSeasonPlayerRow } from "./_external-api-types";
import rawLeagueMap from "../src/lib/sports/thesports/league-id-mapping.json";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");
const STATS_PATH = "data/player-season-stats.json";
const PHOTOS_PATH = "data/player-photos.json";

// 유럽 시즌제 vs 캘린더제 — 시즌 라벨 형식이 기존 JSON 관례와 같아야 비교·표시가 맞는다.
const EURO = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "CHAMPIONSHIP", "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "SAUDI_PL"];
const CALENDAR = ["K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "MLS", "BRASILEIRAO"];

function seasonLabel(code: string, now = new Date()): string {
  if (CALENDAR.includes(code)) return String(now.getUTCFullYear());
  const y = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1; // 7월 경계
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

// "2025-26" < "2026" < "2026-27" — 시즌 라벨 사전순 비교가 시간순과 일치(같은 리그 내 형식 동일).
const newerOrSame = (a: string, b: string) => a >= b;

// TheSports row → SeasonStat (build-kleague-player-stats 와 동일 변환).
// passes_accuracy 는 '정확한 패스 개수'(퍼센트 아님) → passes 로 나눠 백분율화.
function toSeasonStat(code: string, season: string, r: TsSeasonPlayerRow) {
  const passes = r.passes ?? 0;
  const passAcc = passes > 0 ? Math.round(((r.passes_accuracy ?? 0) / passes) * 100) : null;
  return {
    lg: code,
    season,
    team: r.team?.name ?? null,
    pos: r.player?.position ?? null,
    matches: r.matches ?? null,
    starts: r.first ?? null,
    goals: r.goals ?? null,
    assists: r.assists ?? null,
    minutes: r.minutes_played ?? null,
    shots: r.shots ?? null,
    sot: r.shots_on_target ?? null,
    keyPasses: r.key_passes ?? null,
    passAcc,
    tackles: r.tackles ?? null,
    interceptions: r.interceptions ?? null,
    yellow: r.yellow_cards ?? null,
    red: r.red_cards ?? null,
    saves: r.saves ?? 0,
    cleanSheets: null,
    conceded: null,
  };
}

async function main() {
  const leagueMap = rawLeagueMap as Array<{ code: string; tsSeasonId?: string }>;
  const stats: Record<string, { season?: string; lg?: string }> = JSON.parse(fs.readFileSync(STATS_PATH, "utf8"));
  const photos: Record<string, string> = JSON.parse(fs.readFileSync(PHOTOS_PATH, "utf8"));

  let updated = 0, added = 0, kept = 0, failed = 0;
  for (const code of [...EURO, ...CALENDAR]) {
    const seasonId = leagueMap.find((e) => e.code === code)?.tsSeasonId;
    if (!seasonId) { console.warn(`${code}: tsSeasonId 없음 — skip`); continue; }
    const season = seasonLabel(code);
    let rows: TsSeasonPlayerRow[] = [];
    try {
      const res = (await fetchFootballSeasonPlayerStat(seasonId)) as { results?: TsSeasonPlayerRow[] } | null;
      rows = res?.results ?? [];
    } catch (e) {
      // J1 등 시즌 uuid stale 이면 405 — 리그 하나 실패가 나머지를 막지 않는다
      console.warn(`${code}: 조회 실패(${(e as Error).message}) — skip`);
      failed++;
      continue;
    }
    const played = rows.filter((r) => r.player?.id && (r.minutes_played ?? 0) > 0);
    const ids = played.map((r) => r.player!.id!);
    const exist = new Set(
      (await prisma.theSportsPlayer.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((p) => p.id),
    );
    let lgUpd = 0;
    for (const r of played) {
      const pid = r.player!.id!;
      if (!exist.has(pid)) continue;
      const cur = stats[pid];
      // 다른 리그의 더 새 시즌 항목(여름 이적 등)을 옛 리그 행으로 되돌리지 않는다
      if (cur?.season && !newerOrSame(season, cur.season)) { kept++; continue; }
      if (cur) updated++; else added++;
      lgUpd++;
      stats[pid] = toSeasonStat(code, season, r);
      const logo = r.player?.logo;
      if (logo && !photos[pid]) photos[pid] = logo;
    }
    console.log(`${code} ${season}: 응답 ${rows.length} · 출전 ${played.length} · 반영 ${lgUpd}`);
  }

  if (DRY) {
    console.log(`[dry] 갱신 ${updated} · 신규 ${added} · 보존 ${kept} · 리그 실패 ${failed}`);
    return;
  }
  fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 0));
  fs.writeFileSync(PHOTOS_PATH, JSON.stringify(photos, null, 0));
  console.log(`완료 — 갱신 ${updated} · 신규 ${added} · 보존 ${kept} · 리그 실패 ${failed} · 총 ${Object.keys(stats).length}`);
}

main().finally(() => prisma.$disconnect());
