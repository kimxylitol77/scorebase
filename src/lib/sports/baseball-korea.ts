// 야구 해외파(MLB·마이너) 한국 선수 — 명단은 data/baseball-korea.json(주간 빌드), 시즌 성적·최근 경기는 MLB Stats API 런타임 3h 캐시.
import { unstable_cache } from "next/cache";
import raw from "../../../data/baseball-korea.json";

export interface BaseballKoreaPlayer {
  id: number; nameEn: string; nameKo: string; pos: string | null; posType: string | null; age: number | null; birthDate: string | null;
  bats: string | null; throws: string | null; mlbDebut: string | null;
  sportId: number; level: string; team: { id: number | null; name: string; parentOrg: string | null; abbr: string | null };
  onFortyMan: boolean; sportIds: number[];
}
const FILE = raw as { meta: { updatedAt: string; season: number }; players: BaseballKoreaPlayer[] };
export const BASEBALL_KOREA_PLAYERS: BaseballKoreaPlayer[] = FILE.players;
export const BASEBALL_KOREA_META = FILE.meta;
export const LEVEL_LABEL: Record<number, string> = { 1: "MLB", 11: "AAA", 12: "AA", 13: "High-A", 14: "Single-A", 16: "Rookie" };

export interface HittingLine { g: number; avg: string; hr: number; rbi: number; ops: string; sb: number; h: number; pa: number }
export interface PitchingLine { g: number; gs: number; ip: string; era: string; whip: string; so: number; w: number; l: number; sv: number; hld: number }
export interface LevelStat { sportId: number; level: string; team: string | null; hitting: HittingLine | null; pitching: PitchingLine | null }
export interface RecentGame { date: string; opp: string; home: boolean; line: string }
export interface PlayerSeason { levels: LevelStat[]; recent: RecentGame[] }

interface Split { team?: { name?: string }; sport?: { id?: number }; stat: Record<string, unknown>; date?: string; opponent?: { name?: string }; isHome?: boolean }
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;
const str = (v: unknown) => (v == null ? "-" : String(v));

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { next: { revalidate: 3 * 3600 }, headers: { "user-agent": "scorebase-baseball-korea" } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

function toHitting(s: Record<string, unknown>): HittingLine | null {
  if (num(s.plateAppearances) <= 0 && num(s.atBats) <= 0) return null;
  return { g: num(s.gamesPlayed), avg: str(s.avg), hr: num(s.homeRuns), rbi: num(s.rbi), ops: str(s.ops), sb: num(s.stolenBases), h: num(s.hits), pa: num(s.plateAppearances) };
}
function toPitching(s: Record<string, unknown>): PitchingLine | null {
  if (num(s.gamesPlayed) <= 0) return null;
  return { g: num(s.gamesPlayed), gs: num(s.gamesStarted), ip: str(s.inningsPitched), era: str(s.era), whip: str(s.whip), so: num(s.strikeOuts), w: num(s.wins), l: num(s.losses), sv: num(s.saves), hld: num(s.holds) };
}

async function fetchPlayerSeason(p: BaseballKoreaPlayer, season: number): Promise<PlayerSeason> {
  const isPitcher = p.posType === "Pitcher" || p.pos === "P";
  const levels: LevelStat[] = [];
  for (const sportId of p.sportIds) {
    const d = await getJson<{ people?: Array<{ stats?: Array<{ group: { displayName: string }; splits: Split[] }> }> }>(
      `https://statsapi.mlb.com/api/v1/people/${p.id}?hydrate=stats(group=[hitting,pitching],type=[season],season=${season},sportId=${sportId})`,
    );
    const stats = d?.people?.[0]?.stats ?? [];
    // 같은 레벨에서 팀을 옮긴 선수는 합산 split(team 없음)이 따로 온다 — 그걸 우선, 없으면 첫 split.
    const pick = (group: string) => {
      const sp = stats.find((s) => s.group.displayName === group)?.splits ?? [];
      return (sp.find((x) => !x.team) ?? sp[0])?.stat ?? null;
    };
    const h = pick("hitting"), pt = pick("pitching");
    const teamName = stats.flatMap((s) => s.splits).find((x) => x.team?.name)?.team?.name ?? null;
    const hitting = h ? toHitting(h) : null;
    const pitching = pt ? toPitching(pt) : null;
    if (hitting || pitching) levels.push({ sportId, level: LEVEL_LABEL[sportId] ?? String(sportId), team: teamName, hitting: isPitcher ? null : hitting, pitching: isPitcher ? pitching : null });
  }
  // 최근 경기 — 현재 레벨 gameLog 마지막 5경기
  const group = isPitcher ? "pitching" : "hitting";
  const gl = await getJson<{ stats?: Array<{ splits: Split[] }> }>(
    `https://statsapi.mlb.com/api/v1/people/${p.id}/stats?stats=gameLog&group=${group}&season=${season}&sportId=${p.sportId}`,
  );
  const splits = gl?.stats?.[0]?.splits ?? [];
  const recent: RecentGame[] = splits.slice(-5).reverse().map((x) => {
    const s = x.stat;
    const line = isPitcher
      ? `${str(s.inningsPitched)}이닝 ${num(s.earnedRuns)}자책 ${num(s.strikeOuts)}K${num(s.wins) ? " 승" : num(s.losses) ? " 패" : num(s.saves) ? " 세이브" : num(s.holds) ? " 홀드" : ""}`
      : `${num(s.atBats)}타수 ${num(s.hits)}안타${num(s.homeRuns) ? ` ${num(s.homeRuns)}홈런` : ""}${num(s.rbi) ? ` ${num(s.rbi)}타점` : ""}${num(s.stolenBases) ? ` ${num(s.stolenBases)}도루` : ""}`;
    return { date: x.date ?? "", opp: x.opponent?.name ?? "", home: !!x.isHome, line };
  });
  return { levels, recent };
}

/** 전 선수 시즌 성적 — id → PlayerSeason. 실패한 선수는 빈 levels. */
export const getBaseballKoreaSeasons = unstable_cache(
  async (): Promise<Record<string, PlayerSeason>> => {
    const season = FILE.meta.season;
    const out: Record<string, PlayerSeason> = {};
    await Promise.all(
      BASEBALL_KOREA_PLAYERS.map(async (p) => {
        out[String(p.id)] = await fetchPlayerSeason(p, season).catch(() => ({ levels: [], recent: [] }));
      }),
    );
    return out;
  },
  ["baseball-korea-seasons-v1"],
  { revalidate: 3 * 3600, tags: ["baseball-korea"] },
);

/** 선수가 속한 MLB 구단명(메이저면 본인 팀, 마이너면 모구단) — 우리 Match/Team(league=MLB) 매칭 키. */
export function mlbClubOf(p: BaseballKoreaPlayer): string | null {
  return p.sportId === 1 ? p.team.name || null : p.team.parentOrg;
}
