// NBA 플레이오프 브라켓 — DB 소스 (TheSports stage 라벨 경유).
//
// 데이터 흐름:
//   lightsail basketball-match-collector → /v1/basketball/stage/list 로 stage_id→라운드 매핑 →
//   NBA 플레이오프 매치에 playoffRound/playoffConference/playoffStageId 부착 →
//   /api/internal/thesports-matches 가 Match row 에 저장.
//
// 여기서는 그 라벨이 붙은 Match row 만 읽어 시리즈로 그룹화. TheSports API 직접 호출 X
// (Vercel 은 creds 없음 + IP 미화이트리스트 — 직접 호출하면 항상 빈 결과였음).
//
// 출력은 nba-playoffs.ts 의 NbaPlayoffSeries[] 와 동일 — 컴포넌트/시뮬레이션 그대로 재사용.

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import type {
  NbaPlayoffSeries,
  NbaRound,
  NbaConference,
  NbaSeriesGame,
} from "./nba-playoffs";

const ROUND_VALUES: ReadonlySet<string> = new Set([
  "FIRST_ROUND",
  "CONF_SEMIS",
  "CONF_FINALS",
  "FINALS",
]);

async function buildBracket(): Promise<NbaPlayoffSeries[]> {
  // 라벨 붙은 NBA 플레이오프 매치만 (마지막 플레이오프 매치 기준 75일 — 1라운드~파이널 전체 커버).
  // 윈도우 앵커를 "지금"으로 잡으면 비시즌에 앞 라운드부터 하나씩 사라진다
  // (2026-08 실측 — 브라켓에 파이널 한 시리즈만 남음). 새 시즌 플레이오프가 시작되면
  // 앵커가 자동으로 새 매치를 따라가 직전 시즌 브라켓은 밀려난다.
  const latest = await prisma.match.aggregate({
    where: {
      league: "NBA",
      playoffRound: { not: null },
      playoffStageId: { not: null },
    },
    _max: { startTime: true },
  });
  if (!latest._max.startTime) return [];
  const since = new Date(latest._max.startTime.getTime() - 75 * 86400 * 1000);
  const matches = await prisma.match.findMany({
    where: {
      league: "NBA",
      playoffRound: { not: null },
      playoffStageId: { not: null },
      startTime: { gte: since },
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "asc" },
  });
  if (matches.length === 0) return [];

  interface SeriesAcc {
    round: NbaRound;
    conference: NbaConference;
    k1: string; // 정규화된 팀 이름 (사전순 앞)
    k2: string;
    t1Wins: number;
    t2Wins: number;
    team1: NbaPlayoffSeries["team1"];
    team2: NbaPlayoffSeries["team2"];
    games: NbaSeriesGame[];
  }

  // 시리즈 키 — round + conference + 정규화 팀이름 쌍. Team.id 가 아닌 이름으로 묶는 이유:
  // 같은 실제 팀이 중복 Team row (예: NYK id 543·521, CLE id 545·532) 로 존재해
  // 경기마다 다른 id 를 참조 → id 로 묶으면 한 시리즈가 쪼개짐 (NYK-CLE 3+1). stage_id 도
  // 일부 경기에서 달라지므로 키로 못 씀. 두 팀은 한 라운드에 한 번만 맞붙으므로 이름쌍이 안정 키.
  const seriesMap = new Map<string, SeriesAcc>();
  for (const m of matches) {
    const round = m.playoffRound as NbaRound;
    if (!ROUND_VALUES.has(round)) continue;
    const conference = (m.playoffConference as NbaConference) ?? null;

    const homeKey = m.homeTeam.name.trim().toLowerCase();
    const awayKey = m.awayTeam.name.trim().toLowerCase();
    const [k1, k2] = homeKey <= awayKey ? [homeKey, awayKey] : [awayKey, homeKey];
    const team1Src = homeKey === k1 ? m.homeTeam : m.awayTeam;
    const team2Src = homeKey === k1 ? m.awayTeam : m.homeTeam;
    const key = `${round}:${conference}:${k1}|${k2}`;

    let acc = seriesMap.get(key);
    if (!acc) {
      acc = {
        round,
        conference,
        k1,
        k2,
        t1Wins: 0,
        t2Wins: 0,
        team1: { id: team1Src.id, name: team1Src.name, shortName: team1Src.shortName, logoUrl: team1Src.logoUrl, wins: 0 },
        team2: { id: team2Src.id, name: team2Src.name, shortName: team2Src.shortName, logoUrl: team2Src.logoUrl, wins: 0 },
        games: [],
      };
      seriesMap.set(key, acc);
    }
    // 중복 row 중 로고 있는 쪽 우선.
    if (!acc.team1.logoUrl && team1Src.logoUrl) acc.team1.logoUrl = team1Src.logoUrl;
    if (!acc.team2.logoUrl && team2Src.logoUrl) acc.team2.logoUrl = team2Src.logoUrl;
    acc.games.push({
      matchId: m.id,
      date: m.startTime,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: m.status,
    });
    // 승수 — FINISHED + 점수 있음 + 무승부 아님. 승자를 이름키로 판정.
    if (
      m.status === "FINISHED" &&
      m.homeScore != null &&
      m.awayScore != null &&
      m.homeScore !== m.awayScore
    ) {
      const winnerKey = m.homeScore > m.awayScore ? homeKey : awayKey;
      if (winnerKey === acc.k1) acc.t1Wins++;
      else acc.t2Wins++;
    }
  }

  // NbaPlayoffSeries[] 로 변환
  const result: NbaPlayoffSeries[] = [];
  for (const acc of seriesMap.values()) {
    acc.games.sort((a, b) => a.date.getTime() - b.date.getTime());
    acc.team1.wins = acc.t1Wins;
    acc.team2.wins = acc.t2Wins;
    const completed = acc.t1Wins >= 4 || acc.t2Wins >= 4;
    const hi = Math.max(acc.t1Wins, acc.t2Wins);
    const lo = Math.min(acc.t1Wins, acc.t2Wins);
    const lead =
      acc.t1Wins === acc.t2Wins ? null : acc.t1Wins > acc.t2Wins ? acc.team1 : acc.team2;
    const leadShort = lead?.shortName || lead?.name || "";
    const summary = completed
      ? `${leadShort} 시리즈 승리 ${hi}-${lo}`
      : lead
        ? `${leadShort} ${hi}-${lo} 리드`
        : acc.t1Wins > 0
          ? `${acc.t1Wins}-${acc.t2Wins} 동률`
          : "";
    result.push({
      round: acc.round,
      conference: acc.conference,
      team1: acc.team1,
      team2: acc.team2,
      completed,
      totalGames: 7,
      summary,
      games: acc.games,
    });
  }

  // 정렬 — round 순서 + 컨퍼런스 (East 먼저)
  const roundIdx: Record<NbaRound, number> = {
    FIRST_ROUND: 0,
    CONF_SEMIS: 1,
    CONF_FINALS: 2,
    FINALS: 3,
  };
  result.sort((a, b) => {
    const r = roundIdx[a.round] - roundIdx[b.round];
    if (r !== 0) return r;
    const cv = (c: NbaConference) => (c === "EAST" ? 0 : c === "WEST" ? 1 : 2);
    return cv(a.conference) - cv(b.conference);
  });
  return result;
}

/** DB 기반 NBA 플레이오프 브라켓 (5분 캐시). 실패 시 빈 배열. */
export const getTsNbaPlayoffBracket = unstable_cache(
  async (): Promise<NbaPlayoffSeries[]> => {
    try {
      return await buildBracket();
    } catch {
      return [];
    }
  },
  ["ts-nba-playoff-bracket"],
  { revalidate: 300, tags: ["ts-nba-playoff"] },
);
