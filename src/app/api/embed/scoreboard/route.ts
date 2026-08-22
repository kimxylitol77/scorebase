// 방송 오버레이용 경량 스코어보드 API — /embed/scoreboard 가 5초 폴링. 점수·상태·시간만 (배당·통계 없음).
// 라이브는 fetchAllLiveScores(종목별 캐시)에서, 아니면 DB Match 의 최종/예정값.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { fetchAllLiveScores, parseTsFootballScore } from "@/lib/sports/live-scores";
import { tsFootballLiveLabel, tsFootballLiveState } from "@/lib/sports/ts-football-live-label";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import { toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";

export const dynamic = "force-dynamic";

export interface ScoreboardPayload {
  league: string;
  leagueLabel: string;
  status: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED";
  /** "전반 32'", "HT", "종료", "20:30" 등 표시용 */
  statusLabel: string;
  startTime: string;
  home: { name: string; short: string; logo: string | null; score: number | null };
  away: { name: string; short: string; logo: string | null; score: number | null };
  updatedAt: number;
}

function kstHHMM(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600_000);
  return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

/** 약칭 — Team.shortName 우선, 없으면 한글명 앞 4자 */
function shortOf(shortName: string | null, nameKo: string): string {
  if (shortName && shortName.length <= 6) return shortName;
  return nameKo.length > 5 ? nameKo.slice(0, 4) : nameKo;
}

export async function GET(req: NextRequest) {
  const league = req.nextUrl.searchParams.get("league") ?? "";
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!league || !id) return NextResponse.json({ error: "league/id required" }, { status: 400 });

  const match = await prisma.match.findFirst({
    where: { league, externalId: id },
    select: {
      league: true,
      status: true,
      startTime: true,
      homeScore: true,
      awayScore: true,
      homeTeam: { select: { name: true, nameKo: true, shortName: true, logoUrl: true } },
      awayTeam: { select: { name: true, nameKo: true, shortName: true, logoUrl: true } },
      theSportsCache: { select: { detailLive: true, updatedAt: true } },
    },
  });
  if (!match) return NextResponse.json({ error: "not found" }, { status: 404 });

  // 사이트 표준 한글명(toKoreanTeamName) 우선 — Team.nameKo 는 표기가 갈린다("브렌트포드" vs 사이트 "브렌트퍼드")
  const homeKo = toKoreanTeamName(match.homeTeam.name, league) || match.homeTeam.nameKo || match.homeTeam.name;
  const awayKo = toKoreanTeamName(match.awayTeam.name, league) || match.awayTeam.nameKo || match.awayTeam.name;

  // 라이브 — 종목별 캐시된 집계에서 이 경기만 추출 (id 접두사 af-/ts- 제거)
  let live: { homeScore: number; awayScore: number; statusLabel: string } | null = null;
  // 1순위: TheSports 캐시 (MQTT 푸시, 분 라벨 정확) — /scores 행의 "후반 64'" 과 같은 경로.
  //  캐시가 10분 넘게 안 움직였으면 stale 로 보고 아래 집계로 넘어간다.
  if (match.status !== "FINISHED" && SOCCER_LEAGUES.has(league) && match.theSportsCache?.detailLive) {
    const cache = match.theSportsCache;
    const fresh = Date.now() - cache.updatedAt.getTime() < 10 * 60_000;
    const st = tsFootballLiveState(cache.detailLive);
    const label = st && fresh ? tsFootballLiveLabel(st.sid, st.pts, Date.now()) : null;
    if (label) {
      const fs = parseTsFootballScore(cache.detailLive as Parameters<typeof parseTsFootballScore>[0]);
      live = {
        homeScore: fs?.mainHome ?? match.homeScore ?? 0,
        awayScore: fs?.mainAway ?? match.awayScore ?? 0,
        statusLabel: label,
      };
    }
  }
  if (!live && match.status !== "FINISHED") {
    try {
      const all = await fetchAllLiveScores();
      const hit = all.find((m) => m.id.replace(/^[a-z]+-/i, "") === id);
      // 집계엔 오늘 일정(라이브 아님, 라벨이 킥오프 시각 "01:30")도 섞인다 — 시각 형태 라벨은 라이브로 안 친다.
      if (hit && !/^\d{1,2}:\d{2}$/.test(hit.statusLabel))
        live = { homeScore: hit.homeScore, awayScore: hit.awayScore, statusLabel: hit.statusLabel };
    } catch {
      // 라이브 집계 실패 — DB 값으로 응답
    }
  }

  // DB 가 LIVE 로 고착된 유령(킥오프 3h 경과·라이브 집계 없음)은 진행 중이라 말하지 않는다.
  const staleLive = !live && match.status === "LIVE" && Date.now() - match.startTime.getTime() > 3 * 3600_000;
  const status = (live ? "LIVE" : staleLive ? "FINISHED" : match.status) as ScoreboardPayload["status"];
  const statusLabel =
    live?.statusLabel ||
    (staleLive
      ? "결과 갱신 대기"
      : match.status === "FINISHED"
        ? "종료"
        : match.status === "POSTPONED"
          ? "연기"
          : match.status === "LIVE"
            ? "진행 중"
            : kstHHMM(match.startTime));

  const body: ScoreboardPayload = {
    league,
    leagueLabel: LEAGUE_DISPLAY[league] ?? league,
    status,
    statusLabel,
    startTime: match.startTime.toISOString(),
    home: {
      name: homeKo,
      short: shortOf(match.homeTeam.shortName, homeKo),
      logo: match.homeTeam.logoUrl ?? null,
      score: live ? live.homeScore : match.status === "SCHEDULED" ? null : match.homeScore,
    },
    away: {
      name: awayKo,
      short: shortOf(match.awayTeam.shortName, awayKo),
      logo: match.awayTeam.logoUrl ?? null,
      score: live ? live.awayScore : match.status === "SCHEDULED" ? null : match.awayScore,
    },
    updatedAt: Date.now(),
  };
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=10",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
