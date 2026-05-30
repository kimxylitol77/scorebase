// /api/cron/standings-collect — 일 1회 (또는 12시간).
// api-football /standings endpoint 로 모든 SOCCER 리그의 순위를 fetch + 우리 DB ApiFootballStandingsCache 저장.
// 매핑 dictionary 없이 Team.externalId 로 매칭 — TheSports mapping 누락 회피 + 신규 리그도 즉시 cover.

import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { API_FOOTBALL_LEAGUE_ID } from "@/lib/sports/api-football-pro";
import { SOCCER_LEAGUES } from "@/lib/sports/types";
import tsLeagueMap from "@/lib/sports/thesports/league-id-mapping.json";

// Phase 4 (2026-05-25): TheSports standings-poller 가 cover 하는 리그는
// api-football standings 호출 skip. ts standings-poller (Lightsail) 가 1h
// 주기로 TheSportsStandingsCache 채움. getFullStandings/getStandingsPositions
// 가 ts 우선 사용 (commit 091c42d). api-football quota 큰 절약.
// ⚠ TheSports = 데이터 1순위 원칙: ts cover 리그는 af 로 보강하지 않음. ts 순위가
//   안 뜨면(팀매핑 누락) af 가 아니라 ts 팀매핑을 추가해 해결한다(예: BELARUS_PL stat-bridge).
const TS_STANDINGS_COVERED = new Set(
  (tsLeagueMap as Array<{ code: string; tsSeasonId?: string }>)
    .filter((e) => e.tsSeasonId)
    .map((e) => e.code),
);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AF_BASE = "https://v3.football.api-sports.io";

interface AfStandingsResp {
  response?: Array<{
    league?: {
      standings?: Array<
        Array<{
          rank: number;
          team: { id: number; name: string };
          points: number;
          all?: { played?: number; win?: number; draw?: number; lose?: number };
          group?: string;
        }>
      >;
    };
  }>;
}

interface RowOut {
  teamExternalId: string;
  position: number;
  points: number;
  won: number;
  draw: number;
  loss: number;
  group?: string;
}

function seasonFor(league: string, year: number, month: number): number {
  const european = new Set([
    "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "UCL", "UEL", "UECL",
    "CHAMPIONSHIP", "LALIGA_2", "BUNDESLIGA_2", "SERIE_B", "LIGUE_2",
    "SAUDI_PL", "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "JUPILER_PL", "SPL", "GREEK_SL",
    "EKSTRAKLASA", "POLAND_1L", "BULGARIA_PL", "LIGA_I", "SWISS_SL", "CHALLENGE_LEAGUE", "ARMENIA_PL",
    "AUSTRIA_BL", "CZECH_L", "HNL", "UKRAINE_PL", "HUNGARY_NB1",
    "SERBIA_SL", "SLOVAKIA_SL", "SLOVENIA_SNL", "CYPRUS_1D", "DENMARK_SL",
    "BOSNIA_PL", "ALBANIA_SL", "MOLDOVA_SL",
    "EGYPT_PL", "ISRAEL_PL", "INDIA_ISL", "INDONESIA_L1",
    "UAE_PL", "QATAR_SL", "MOROCCO_BP", "SOUTHAFRICA_PSL",
    "SINGAPORE_PL", "A_LEAGUE", "LIGA_MX", "AFC_CL", "AFC_CL_TWO",
    "THAI_L1", "WSL", "UEFA_WCL", "A_LEAGUE_W", "UEFA_NL", "EURO_QUAL",
    // 2026-05-24 추가 — 유럽 8~5월 시즌
    "SUI_CUP", "LEAGUE_ONE",
    // 2026-05-24 (2차) — 유럽 8~5월 시즌
    "AZERBAIJAN_PL", "EREDIVISIE_2", "PRIMEIRA_LIGA_2",
  ]);
  if (european.has(league)) return month >= 7 ? year : year - 1;
  if (league === "WORLD_CUP" || league === "WC_QUAL") return 2026;
  if (league === "CLUB_WORLD_CUP") return 2025;
  if (league === "AFC_U23") return 2025;
  if (league === "AFCON" || league === "CONCACAF_GOLD" || league === "U20_WC" || league === "U17_WC") return 2025;
  if (league === "UEFA_U21_Q" || league === "UEFA_U21" || league === "UEFA_U19" || league === "UEFA_U17") return 2025;
  if (league === "OLYMPICS_FOOTBALL") return 2024;
  return year;
}

async function fetchStandings(
  apiKey: string,
  leagueId: number,
  season: number,
): Promise<RowOut[] | null> {
  try {
    const res = await fetch(
      `${AF_BASE}/standings?league=${leagueId}&season=${season}`,
      {
        headers: { "x-apisports-key": apiKey },
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as AfStandingsResp;
    const standings = data.response?.[0]?.league?.standings;
    if (!standings || standings.length === 0) return null;
    const out: RowOut[] = [];
    for (const table of standings) {
      for (const r of table) {
        out.push({
          teamExternalId: String(r.team.id),
          position: r.rank,
          points: r.points,
          won: r.all?.win ?? 0,
          draw: r.all?.draw ?? 0,
          loss: r.all?.lose ?? 0,
          group: r.group,
        });
      }
    }
    return out;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const ua = req.headers.get("user-agent") ?? "";
  const cronOk =
    process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  const vercelCron = ua.includes("vercel-cron");
  if (!cronOk && !vercelCron) {
    const intOk =
      process.env.INTERNAL_API_TOKEN &&
      auth === `Bearer ${process.env.INTERNAL_API_TOKEN}`;
    if (!intOk) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API_FOOTBALL_KEY missing" }, { status: 500 });
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const out: { ok: number; skip: number; fail: string[] } = { ok: 0, skip: 0, fail: [] };
  const leagues = (SOCCER_LEAGUES as readonly string[]).filter(
    (l) =>
      API_FOOTBALL_LEAGUE_ID[l as keyof typeof API_FOOTBALL_LEAGUE_ID] &&
      !TS_STANDINGS_COVERED.has(l), // Phase 4: ts cover 리그 skip (TheSports 1순위)
  );

  for (const league of leagues) {
    const leagueId = API_FOOTBALL_LEAGUE_ID[league as keyof typeof API_FOOTBALL_LEAGUE_ID];
    if (!leagueId) {
      out.skip++;
      continue;
    }
    const season = seasonFor(league, year, month);
    const rows = await fetchStandings(apiKey, leagueId, season);
    if (!rows || rows.length === 0) {
      out.fail.push(`${league}(s${season})`);
      continue;
    }
    await prisma.apiFootballStandingsCache.upsert({
      where: { league },
      create: { league, season, rows: rows as unknown as Prisma.InputJsonValue },
      update: { season, rows: rows as unknown as Prisma.InputJsonValue, fetchedAt: new Date() },
    });
    out.ok++;
    await new Promise((r) => setTimeout(r, 200));
  }

  return NextResponse.json({ success: true, ...out });
}
