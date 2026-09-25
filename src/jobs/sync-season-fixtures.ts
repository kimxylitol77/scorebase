// ts 축구 리그 시즌 전체 일정 동기화 — 워커 diary 는 7일 앞까지만 보여 A매치 휴식기엔 "다가오는 경기 0" 이 된다.
//
// 2026-09-25 전수 실측: 74개 리그가 향후 30일 예정 0건(J1·K리그2·에크스트라클라사 …). ts 시즌 목록에는
// 전 일정이 이미 있다(J1 300·에크스트라클라사 226경기). 리그당 season/recent 1콜로 받아, DB 에 없거나
// 킥오프가 바뀐 미래 경기만 매치 수신 라우트(/api/internal/thesports-matches)로 보낸다 — 워커와 같은 경로라
// 팀 해석·중복 가드·자리표시자 가드를 그대로 탄다. 라운드(stage·round_num)도 워커와 같은 형식으로 싣는다.
//
// 건너뛰는 리그
//  - 이미 다른 소스(af·fd)가 시즌 일정을 싣는 리그: DB 에 21일 넘게 앞선 예정 경기가 있으면 — 소스가 둘이면
//    킥오프가 어긋난 크로스소스 중복이 생긴다(빅5 등).
//  - ts 대회 id 를 다른 리그와 나눠 쓰는 리그: 한 대회를 stage 로 가르는 경우(핀란드 카코넨) 잘못 들어간다.
//  - 워커가 제외하는 국가대표 대회(football-match-collector SKIP_LEAGUES 와 같은 목록).
//
// 농구(NBA·WNBA·KBL·WKBL)도 같은 이유로 — 새 시즌 일정이 개막 7일 전에야 들어와 리그 페이지 일정·예측이 비었다.
//  농구는 대회 목록(competition/list)의 cur_season_id 로 시즌을 찾는다(대회 id 는 워커 COMP_TO_LEAGUE 와 같은 값).
//  배구는 ts 시즌 일정 API 가 미인가라 여기서 다루지 않는다(워커 diary 가 맡는다).
//
//   실행: npx tsx --env-file=.env.local src/jobs/sync-season-fixtures.ts [--league EKSTRAKLASA,J1_LEAGUE] [--dry]
import "@/lib/env";
import { prisma } from "@/lib/db";
import { thesportsGet } from "@/lib/sports/thesports/client";
import { tsStageName } from "@/lib/sports/thesports/stage-names";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import tsLeagueMap from "@/lib/sports/thesports/league-id-mapping.json";

const SKIP_LEAGUES = new Set(["CLUB_WORLD_CUP", "WC_QUAL", "EURO_QUAL", "UEFA_NL", "INTL_FRIENDLY"]);
/** 이보다 먼 예정 경기가 이미 있으면 다른 소스가 시즌 일정을 싣는 리그로 본다 */
const OTHER_SOURCE_HORIZON_DAYS = 21;
/** 이보다 가까운 경기는 워커 diary(7일)가 맡는다 */
const WORKER_HORIZON_MS = 86400_000;
const POST_CHUNK = 25;
/** lightsail-worker/basketball-match-collector.js COMP_TO_LEAGUE 와 같은 값(정규 리그만) */
const BASKETBALL_COMPS: Record<string, string> = {
  NBA: "49vjxm8xt4q6odg",
  WNBA: "0gx7lm73tor2wdk",
  KBL: "9d23xmv1t4mg8ny",
  WKBL: "kn54ql7t28rvy9d",
};

interface TsSeasonMatch {
  id: string;
  status_id: number;
  match_time: number;
  home_team_id?: string;
  away_team_id?: string;
  round?: { stage_id?: string; round_num?: number; group_num?: number };
}

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DRY = process.argv.includes("--dry");

export async function syncSeasonFixtures(opts: { leagues?: string[]; dry?: boolean } = {}) {
  const entries = (tsLeagueMap as Array<{ code: string; tsId?: string; tsSeasonId?: string }>).filter(
    (e) => e.tsId && e.tsSeasonId && SOCCER_LEAGUES.has(e.code) && !SKIP_LEAGUES.has(e.code),
  );
  const tsIdCount = new Map<string, number>();
  for (const e of entries) tsIdCount.set(e.tsId!, (tsIdCount.get(e.tsId!) ?? 0) + 1);
  const targets = entries.filter((e) => (opts.leagues ? opts.leagues.includes(e.code) : true));

  const now = Date.now();
  const site = (process.env.SITE_URL || "https://www.scorebase.kr").replace("://scorebase.kr", "://www.scorebase.kr");
  const summary: string[] = [];
  let totalSent = 0;

  for (const e of targets) {
    if (tsIdCount.get(e.tsId!)! > 1) { summary.push(`${e.code}: 대회 id 공유 — 건너뜀`); continue; }
    const far = await prisma.match.count({
      where: { league: e.code, status: "SCHEDULED", startTime: { gt: new Date(now + OTHER_SOURCE_HORIZON_DAYS * 86400_000) }, NOT: { externalId: { startsWith: "ts-" } } },
    });
    if (far > 0) { summary.push(`${e.code}: 다른 소스가 시즌 일정 보유(${far}) — 건너뜀`); continue; }

    let rows: TsSeasonMatch[];
    try {
      rows = (await thesportsGet<{ code: number; results?: TsSeasonMatch[] }>("/v1/football/match/season/recent", { uuid: e.tsSeasonId! })).results ?? [];
    } catch (err) {
      summary.push(`${e.code}: ts 조회 실패 ${(err as Error).message.slice(0, 60)}`);
      continue;
    }
    const future = rows.filter(
      (m) => m.status_id === 1 && m.match_time * 1000 > now + WORKER_HORIZON_MS && m.home_team_id && m.away_team_id,
    );
    if (future.length === 0) { summary.push(`${e.code}: 미래 경기 0`); continue; }

    // 이미 같은 킥오프로 있는 경기는 다시 보내지 않는다(매일 돌려도 새 일정·시간 변경만 오간다).
    const have = await prisma.match.findMany({
      where: { league: e.code, externalId: { in: future.map((m) => `ts-${m.id}`) } },
      select: { externalId: true, startTime: true, raw: true },
    });
    const haveBy = new Map(have.map((h) => [h.externalId, h]));
    const todo = future.filter((m) => {
      const h = haveBy.get(`ts-${m.id}`);
      return !h || h.startTime.getTime() !== m.match_time * 1000 || !h.raw;
    });
    if (todo.length === 0) { summary.push(`${e.code}: 최신(${future.length})`); continue; }

    const payload = [];
    for (const m of todo) {
      const stageName = m.round?.stage_id ? await tsStageName(m.round.stage_id) : null;
      payload.push({
        league: e.code,
        tsMatchId: m.id,
        tsHomeTeamId: m.home_team_id!,
        tsAwayTeamId: m.away_team_id!,
        startTime: new Date(m.match_time * 1000).toISOString(),
        status: "SCHEDULED" as const,
        ...(m.round
          ? { round: { stageId: m.round.stage_id ?? null, roundNum: Number(m.round.round_num) || 0, groupNum: Number(m.round.group_num) || 0, stageName } }
          : {}),
      });
    }
    if (opts.dry) { summary.push(`${e.code}: 보낼 경기 ${payload.length} (dry)`); continue; }

    let upserted = 0, noTeam = 0, dup = 0, placeholder = 0, failed = 0;
    for (let i = 0; i < payload.length; i += POST_CHUNK) {
      const r = await fetch(`${site}/api/internal/thesports-matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}` },
        body: JSON.stringify({ sport: "football", matches: payload.slice(i, i + POST_CHUNK) }),
      });
      if (!r.ok) { failed += Math.min(POST_CHUNK, payload.length - i); continue; }
      const j = (await r.json()) as { upserted?: number; skippedNoTeam?: number; skippedDuplicate?: number; skippedPlaceholder?: number };
      upserted += j.upserted ?? 0;
      noTeam += j.skippedNoTeam ?? 0;
      dup += j.skippedDuplicate ?? 0;
      placeholder += j.skippedPlaceholder ?? 0;
    }
    totalSent += upserted;
    summary.push(
      `${e.code}: 보냄 ${payload.length} · 저장 ${upserted}` +
        (noTeam ? ` · 팀 미매핑 ${noTeam}` : "") + (dup ? ` · 중복 ${dup}` : "") +
        (placeholder ? ` · 자리표시자 ${placeholder}` : "") + (failed ? ` · 실패 ${failed} ⚠` : ""),
    );
  }
  totalSent += await syncBasketball(opts, now, site, summary);
  for (const s of summary) console.log(`  ${s}`);
  console.log(`[sync-season-fixtures] ${targets.length}개 축구 리그 + 농구 · 저장 ${totalSent}경기${opts.dry ? " (dry)" : ""}`);
}

async function syncBasketball(opts: { leagues?: string[]; dry?: boolean }, now: number, site: string, summary: string[]): Promise<number> {
  let saved = 0;
  for (const [league, comp] of Object.entries(BASKETBALL_COMPS)) {
    if (opts.leagues && !opts.leagues.includes(league)) continue;
    let rows: TsSeasonMatch[];
    try {
      const c = await thesportsGet<{ code: number; results?: Array<{ cur_season_id?: string }> }>("/v1/basketball/competition/list", { uuid: comp });
      const sid = c.results?.[0]?.cur_season_id;
      if (!sid) { summary.push(`${league}: 현재 시즌 id 없음`); continue; }
      rows = (await thesportsGet<{ code: number; results?: TsSeasonMatch[] }>("/v1/basketball/match/season/recent", { uuid: sid })).results ?? [];
    } catch (err) {
      summary.push(`${league}: ts 조회 실패 ${(err as Error).message.slice(0, 60)}`);
      continue;
    }
    // 농구 status: 0=숨김·15=시간 미정(워커와 같이 제외), 1=예정
    const future = rows.filter((m) => m.status_id === 1 && m.match_time * 1000 > now + WORKER_HORIZON_MS && m.home_team_id && m.away_team_id);
    if (future.length === 0) { summary.push(`${league}: 미래 경기 0`); continue; }
    const have = await prisma.match.findMany({
      where: { league, externalId: { in: future.map((m) => `ts-${m.id}`) } },
      select: { externalId: true, startTime: true },
    });
    const haveBy = new Map(have.map((h) => [h.externalId, h.startTime.getTime()]));
    const todo = future.filter((m) => haveBy.get(`ts-${m.id}`) !== m.match_time * 1000);
    if (todo.length === 0) { summary.push(`${league}: 최신(${future.length})`); continue; }
    const payload = todo.map((m) => ({
      league,
      tsMatchId: m.id,
      tsHomeTeamId: m.home_team_id!,
      tsAwayTeamId: m.away_team_id!,
      startTime: new Date(m.match_time * 1000).toISOString(),
      status: "SCHEDULED" as const,
    }));
    if (opts.dry) { summary.push(`${league}: 보낼 경기 ${payload.length} (dry)`); continue; }
    let upserted = 0, noTeam = 0, failed = 0;
    for (let i = 0; i < payload.length; i += POST_CHUNK) {
      const r = await fetch(`${site}/api/internal/thesports-matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}` },
        body: JSON.stringify({ sport: "basketball", matches: payload.slice(i, i + POST_CHUNK) }),
      });
      if (!r.ok) { failed += Math.min(POST_CHUNK, payload.length - i); continue; }
      const j = (await r.json()) as { upserted?: number; skippedNoTeam?: number };
      upserted += j.upserted ?? 0;
      noTeam += j.skippedNoTeam ?? 0;
    }
    saved += upserted;
    summary.push(`${league}: 보냄 ${payload.length} · 저장 ${upserted}` + (noTeam ? ` · 팀 미매핑 ${noTeam}` : "") + (failed ? ` · 실패 ${failed} ⚠` : ""));
  }
  return saved;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncSeasonFixtures({ leagues: arg("league")?.split(",").filter(Boolean), dry: DRY })
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
