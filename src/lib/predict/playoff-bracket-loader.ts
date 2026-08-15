// NBA/NHL 플레이오프 브라켓 로더 — predictions·standings 페이지 공용.
//
// 윈도우 앵커는 "지금"이 아니라 마지막 종료 매치 — 롤링 윈도우면 비시즌에
// 앞 라운드부터 하나씩 사라진다 (2026-08 NBA 실측). 시즌 중엔 마지막 종료
// 매치 ≈ 지금이라 실시간과 동일하게 동작한다.
//
// NBA 는 TheSports 라벨 브라켓이 정본 (ESPN raw 폴백은 팀 externalId
// 네임스페이스 혼재로 허위 대진을 만듦 — ts 가 비었을 때만 폴백). NHL 은
// ESPN raw 의 series.type='playoff' 경로만 사용.

import { prisma } from "@/lib/db";
import { getNbaPlayoffBracket, type NbaPlayoffSeries } from "./nba-playoffs";
import { getTsNbaPlayoffBracket } from "./ts-nba-playoff";

export async function loadPlayoffBracket(
  league: "NBA" | "NHL",
): Promise<NbaPlayoffSeries[]> {
  if (league === "NBA") {
    const tsBracket = await getTsNbaPlayoffBracket();
    if (tsBracket.length > 0) return tsBracket;
  }
  const latestFinished = await prisma.match.aggregate({
    where: { league, status: "FINISHED" },
    _max: { startTime: true },
  });
  const nowMs = Date.now();
  const anchorMs = Math.min(
    latestFinished._max.startTime?.getTime() ?? nowMs,
    nowMs,
  );
  const recentMatches = await prisma.match.findMany({
    where: {
      league,
      startTime: { gte: new Date(anchorMs - 75 * 24 * 3600 * 1000) }, // 앵커 기준 75일 — 1라운드~파이널 커버
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "asc" },
  });
  return getNbaPlayoffBracket(recentMatches);
}

/** 파이널까지 끝난 브라켓 = 지난 시즌 아카이브. */
export function isPlayoffSeasonDone(bracket: NbaPlayoffSeries[]): boolean {
  return bracket.some((s) => s.round === "FINALS" && s.completed);
}

/** 브라켓 시즌 라벨 (예: "2025-26") — 마지막 게임 날짜 기준 (플레이오프는 4~6월 = 시즌 종료 연도). */
export function playoffSeasonLabel(bracket: NbaPlayoffSeries[]): string {
  let last = 0;
  for (const s of bracket) {
    // unstable_cache(ts 브라켓)를 거치면 Date 가 문자열로 직렬화됨 — new Date 로 방어.
    for (const g of s.games) last = Math.max(last, new Date(g.date).getTime());
  }
  if (!last) return "";
  const endYear = new Date(last).getUTCFullYear();
  return `${endYear - 1}-${String(endYear).slice(2)}`;
}
