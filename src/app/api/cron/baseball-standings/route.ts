// GET /api/cron/baseball-standings
// api-baseball (api-sports) 의 야구 standings 일 1회 fetch → ApiFootballStandingsCache 재활용.
// (rows JSON 구조가 동일해 별도 모델 불필요. league key 로 KBO/NPB/MLB/CPBL 구분.)
//
// Vercel cron 등록 (vercel.json) 또는 수동 호출.
// auth: CRON_SECRET 또는 INTERNAL_API_TOKEN bearer.
//
// 응답: { ok, leagues: [{ league, rows, error? }] }

import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { recordCronRun } from "@/lib/cron-registry";
import { calcStandings } from "@/lib/predict/standings";
import { currentSeasonStart } from "@/lib/predict/season-window";
import { isAllStarMatchRow } from "@/lib/sports/baseball/allstar";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AB_BASE = "https://v1.baseball.api-sports.io";

// 우리 league code → api-baseball league id.
const LEAGUE_AB_ID: Record<string, number> = {
  KBO: 5,
  NPB: 2,
  MLB: 1,
  CPBL: 29,
  // LMB 추가 가능 (확인 시): id 미정 — 별도 확인 후 etend.
};

interface AbStandingRow {
  position?: number;
  team?: { id?: number; name?: string };
  points?: number;
  games?: {
    win?: { total?: number };
    lose?: { total?: number };
  };
}

interface AbResponse {
  results?: number;
  response?: AbStandingRow[][];
  errors?: unknown;
}

async function fetchStandings(apiKey: string, leagueId: number, season: number): Promise<AbStandingRow[] | null> {
  try {
    const r = await fetch(
      `${AB_BASE}/standings?league=${leagueId}&season=${season}`,
      { headers: { "x-apisports-key": apiKey }, signal: AbortSignal.timeout(20_000) },
    );
    if (!r.ok) return null;
    const d = (await r.json()) as AbResponse;
    const g = d.response?.[0];
    if (!Array.isArray(g)) return null;
    return g;
  } catch (e) {
    console.warn(`[baseball-standings] fetch fail league=${leagueId}:`, (e as Error).message);
    return null;
  }
}

// ApiFootballStandingsCache 에 저장하는 공통 행 형식.
interface LightRow {
  position: number;
  teamExternalId: string | null;
  teamName: string | null | undefined;
  points: number;
  won: number;
  draw: number;
  loss: number;
}

// 야구 카드·순위표는 승수를 노출하므로 points = 승수로 통일 (KBO af 응답과 동일 관례).
function toLightRow(
  position: number,
  externalId: string | null,
  name: string | null | undefined,
  won: number,
  loss: number,
  draw = 0,
): LightRow {
  return { position, teamExternalId: externalId, teamName: name, points: won, won, draw, loss };
}

// MLB — api-baseball 이 standings 를 빈 껍데기(team.id=0·name=null)로 주므로 MLB Stats API
// (무료 공식) 사용. team.id 는 우리 Team.externalId(ESPN) 와 다른 체계라 팀명으로 이어붙인다.
const MLB_STATS_BASE = "https://statsapi.mlb.com/api/v1";

function normalizeTeamName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function fetchMlbStandings(season: number): Promise<LightRow[] | null> {
  try {
    // 1) id → full name (standings 응답의 team.name 은 "Rays" 같은 축약형이라 매칭 불가)
    const tRes = await fetch(`${MLB_STATS_BASE}/teams?sportId=1&season=${season}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!tRes.ok) return null;
    const tJson = (await tRes.json()) as { teams?: Array<{ id: number; name: string }> };
    const fullNameById = new Map((tJson.teams ?? []).map((t) => [t.id, t.name]));

    const sRes = await fetch(
      `${MLB_STATS_BASE}/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason`,
      { signal: AbortSignal.timeout(20_000) },
    );
    if (!sRes.ok) return null;
    const sJson = (await sRes.json()) as {
      records?: Array<{
        teamRecords?: Array<{ team?: { id?: number }; wins?: number; losses?: number }>;
      }>;
    };

    // 디비전별 응답을 합쳐 전체 승률 순위로 재산출 (카드는 리그 통합 Top3 를 보여준다)
    const flat = (sJson.records ?? []).flatMap((r) => r.teamRecords ?? []);
    if (flat.length === 0) return null;

    const ourTeams = await prisma.team.findMany({
      where: { league: "MLB" },
      select: { name: true, externalId: true },
    });
    const extByName = new Map(ourTeams.map((t) => [normalizeTeamName(t.name), t.externalId]));

    const ranked = flat
      .map((t) => {
        const full = t.team?.id != null ? fullNameById.get(t.team.id) : undefined;
        return {
          name: full ?? null,
          externalId: full ? (extByName.get(normalizeTeamName(full)) ?? null) : null,
          won: t.wins ?? 0,
          loss: t.losses ?? 0,
        };
      })
      .sort((a, b) => winPct(b.won, b.loss) - winPct(a.won, a.loss) || b.won - a.won);

    return ranked.map((t, i) => toLightRow(i + 1, t.externalId, t.name, t.won, t.loss));
  } catch (e) {
    console.warn(`[baseball-standings] MLB Stats API fail:`, (e as Error).message);
    return null;
  }
}

// 야구 순위는 승점이 아니라 승률(승/(승+패), 무승부 제외) 기준 — NPB·MLB 공식 방식.
function winPct(won: number, loss: number): number {
  const g = won + loss;
  return g === 0 ? 0 : won / g;
}

// DB 종료 매치로 순위 산출 — 소스가 죽었을 때의 공통 fallback.
// NPB 는 상시 경로(공식 API 없음 + ts team-id-mapping 야구 0건이라 매핑 불가),
// KBO·CPBL 은 api-baseball 이 빈 응답을 줄 때만 쓴다. 리그 통합 순위라 디비전 구분은 없다.
async function computeStandingsFromMatches(league: string): Promise<LightRow[] | null> {
  try {
    const seasonStart = currentSeasonStart(league);
    const matches = await prisma.match.findMany({
      where: {
        league,
        status: "FINISHED",
        ...(seasonStart ? { startTime: { gte: seasonStart } } : {}),
      },
      select: {
        id: true, league: true, status: true, startTime: true,
        homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true,
      },
    });
    // 올스타전 제외 — 소스가 올스타를 정규 리그로 내려줘 1경기 승률 1.000 으로 1위를
    // 가로챈다 (NPB "Central/Pacific league", KBO "Dream/Nanum").
    const regularMatches = matches.filter((m) => !isAllStarMatchRow(m));
    if (regularMatches.length === 0) return null;

    const { rows: regular } = calcStandings(regularMatches as never);
    const teams = await prisma.team.findMany({
      where: { league, id: { in: regular.map((r) => r.teamId) } },
      select: { id: true, name: true, externalId: true },
    });
    const byId = new Map(teams.map((t) => [t.id, t]));

    // calcStandings 는 승점(3점제) 정렬이라 야구 관례와 어긋난다 — 승률로 재정렬.
    return regular
      .map((r) => ({ r, t: byId.get(r.teamId) }))
      .filter((x) => x.t != null)
      .sort((a, b) => winPct(b.r.wins, b.r.losses) - winPct(a.r.wins, a.r.losses) || b.r.wins - a.r.wins)
      .map((x, i) =>
        toLightRow(i + 1, x.t!.externalId, x.t!.name, x.r.wins, x.r.losses, x.r.draws),
      );
  } catch (e) {
    console.warn(`[baseball-standings] ${league} 자체 산출 실패:`, (e as Error).message);
    return null;
  }
}

function unauthorized(msg = "Unauthorized") {
  return NextResponse.json({ error: msg }, { status: 401 });
}

// 예외도 실행 기록으로 남긴다 — 안 남기면 cron-freshness 가 "N시간째 미실행"으로
// 오보한다(2026-08-07 fetch-transactions 실측과 동일 구조).
export async function GET(req: NextRequest) {
  try {
    return await handle(req);
  } catch (e) {
    await recordCronRun("baseball-standings", { ok: false, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

async function handle(req: NextRequest) {
  if (!isCronAuthorized(req)) return unauthorized();

  const apiKey = process.env.API_BASEBALL_KEY;
  if (!apiKey) return NextResponse.json({ error: "API_BASEBALL_KEY 미설정" }, { status: 500 });

  const year = new Date().getUTCFullYear();
  const results: Array<{ league: string; saved?: number; source?: string; error?: string }> = [];

  for (const [league, leagueId] of Object.entries(LEAGUE_AB_ID)) {
    // 유효 행 = 팀이 실제로 매칭된 행. teamExternalId 가 null 이면 표시 단계에서
    // `in: [null]` prisma 예외를 일으켜 순위가 통째로 빈다 (2026-07-29 MLB·NPB 사고).
    const onlyValid = (rows: LightRow[] | null) =>
      rows?.filter((r) => r.teamExternalId && r.position > 0) ?? [];

    // 1순위 — MLB 는 공식 MLB Stats API, 나머지는 api-baseball.
    // api-baseball standings 는 전 야구 리그가 동시에 빈 껍데기(team.id=0·name=null)를
    // 반환하는 장애가 관측됐다 (2026-07-29 KBO 포함 실측) → 비면 아래로 fallback.
    let lightRows: LightRow[];
    let source: string;
    if (league === "MLB") {
      lightRows = onlyValid(await fetchMlbStandings(year));
      source = "mlb-stats-api";
    } else {
      const rows = await fetchStandings(apiKey, leagueId, year);
      // ApiFootballStandingsCache 형식에 맞춰 가벼운 rows 로 변환.
      // draw=0 + points number 강제 (호출 측 JSX throw 방지 — 2026-05-27 사고).
      lightRows = onlyValid(
        rows?.map((r) =>
          toLightRow(
            r.position ?? 0,
            r.team?.id ? String(r.team.id) : null,
            r.team?.name,
            r.games?.win?.total ?? 0,
            r.games?.lose?.total ?? 0,
          ),
        ) ?? null,
      );
      source = "api-baseball";
    }

    // 2순위 — DB 종료 매치로 자체 산출. NPB 는 애초에 이 경로만 가능(공식 API 부재 +
    // ts standings 는 야구 team-id-mapping 이 0건이라 매핑 불가).
    if (lightRows.length === 0) {
      lightRows = onlyValid(await computeStandingsFromMatches(league));
      source = "db-computed";
    }

    // 둘 다 비면 기존 캐시를 지킨다 — 쓰레기로 덮어쓰느니 어제 값이 낫다.
    if (lightRows.length === 0) {
      results.push({ league, error: "유효 행 0 — 기존 캐시 유지" });
      continue;
    }
    try {
      await prisma.apiFootballStandingsCache.upsert({
        where: { league },
        create: {
          league,
          season: year,
          rows: lightRows as unknown as Prisma.InputJsonValue,
        },
        update: {
          season: year,
          rows: lightRows as unknown as Prisma.InputJsonValue,
        },
      });
      results.push({ league, saved: lightRows.length, source });
    } catch (e) {
      results.push({ league, error: (e as Error).message });
    }
  }

  await recordCronRun("baseball-standings");
  return NextResponse.json({ ok: true, leagues: results });
}
