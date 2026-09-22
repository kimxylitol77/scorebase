// 경기 상세 베트맨 카드 재료 — 승무패 라인(초기·현재·투표) + "이 배당대 역대 결과" 한 줄. 네 상세 라우트([league]·kbo·npb·mlb)가 같이 쓴다.
// 종료 경기는 null(카드 생략). 배당대 집계는 채점 경기 전체 스캔이라 1시간 캐시.

import { unstable_cache } from "next/cache";
import { getBetmanLineForMatch, type BetmanMatchLine } from "@/lib/odds/betman";
import { bandRowForOdds, oddsBandStats, type OddsBandRow, type OddsBandStats } from "@/lib/predict/odds-band-stats";

const EMPTY: OddsBandStats = { evaluated: 0, bands: [], leagues: [] };
const getOddsBandStatsCached = unstable_cache(() => oddsBandStats(), ["odds-band-stats"], { revalidate: 3600 });

export interface BetmanCardData {
  line: BetmanMatchLine;
  band: OddsBandRow | null;
}

export async function getBetmanCardData(match: {
  id: number;
  homeTeamId: number;
  awayTeamId: number;
  startTime: Date;
  status: string;
  league: string;
}): Promise<BetmanCardData | null> {
  if (match.status === "FINISHED") return null;
  const line = await getBetmanLineForMatch(match.homeTeamId, match.awayTeamId, match.startTime, match.id, match.league).catch(() => null);
  if (!line) return null;
  const stats = await getOddsBandStatsCached().catch(() => EMPTY);
  return { line, band: bandRowForOdds(stats, [line.winAllot, line.drawAllot, line.loseAllot]) };
}
