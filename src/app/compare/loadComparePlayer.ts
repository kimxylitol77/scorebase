// 선수 비교(head-to-head) 데이터 로더 — TheSports player id 로 시즌 스탯 + 프로필 메타 조회. /compare 라우트 공용.
// 데이터·식별 규칙은 transfers/[id] 와 동일(player-season-stats.json·TheSportsPlayer·player-overrides·player-photos).
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import rawSeason from "../../../data/player-season-stats.json";
import rawPhotos from "../../../data/player-photos.json";
import rawOverrides from "../../../data/player-overrides.json";

export interface SeasonStat {
  lg: string;
  season: string;
  team: string | null;
  pos: string | null;
  matches: number | null;
  starts: number | null;
  goals: number | null;
  assists: number | null;
  minutes: number | null;
  shots: number | null;
  sot: number | null;
  keyPasses: number | null;
  passAcc: number | null;
  tackles: number | null;
  interceptions: number | null;
  yellow: number | null;
  red: number | null;
  saves: number | null;
}

const SEASON = rawSeason as Record<string, SeasonStat>;
const PHOTOS = rawPhotos as Record<string, string>;
const OVERRIDES = rawOverrides as Record<string, { nameKo?: string; pos?: string }>;
const POS_LABEL: Record<string, string> = { G: "GK", D: "DF", M: "MF", F: "FW" };

export interface ComparePlayer {
  id: string;
  name: string;
  photo: string | null;
  posLabel: string | null;
  leagueCode: string | null;
  leagueLabel: string | null;
  team: string | null;
  value: number | null; // €M
  age: number | null;
  season: SeasonStat | null;
}

/** ts player id → 비교용 선수 데이터. 시즌 스탯·시장가치·프로필 중 하나라도 있으면 반환, 전무하면 null. */
export async function loadComparePlayer(id: string): Promise<ComparePlayer | null> {
  const [mv, tsp] = await Promise.all([
    prisma.playerMarketValue.findUnique({
      where: { id },
      select: { currentValue: true, age: true, league: true },
    }),
    prisma.theSportsPlayer.findUnique({
      where: { id },
      select: { nameKo: true, name: true, photoUrl: true, position: true },
    }),
  ]);
  const season = SEASON[id] ?? null;
  if (!mv && !tsp && !season) return null;

  const ov = OVERRIDES[id];
  const name = ov?.nameKo || tsp?.nameKo || tsp?.name || "선수";
  const photo = PHOTOS[id] || tsp?.photoUrl || null;
  // ov.pos 는 이미 라벨(FW 등), tsp.position·season.pos 는 코드(G/D/M/F) — transfers/[id] 와 동일 우선순위.
  const posLabel =
    ov?.pos || (tsp?.position && POS_LABEL[tsp.position]) || (season?.pos && POS_LABEL[season.pos]) || null;
  const leagueCode = mv?.league || season?.lg || null;
  const leagueLabel = leagueCode ? LEAGUE_DISPLAY[leagueCode] || leagueCode : null;
  const team = season?.team ? toKoreanTeamName(season.team) || season.team : null;
  const value = mv?.currentValue ? Math.round(mv.currentValue / 1e6) : null;
  const age = mv?.age ?? null;

  return { id, name, photo, posLabel, leagueCode, leagueLabel, team, value, age, season };
}
