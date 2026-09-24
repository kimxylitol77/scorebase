// LoL 대회 사전 reader — data/lol-tournaments.json (scripts/build-lol-tournaments.ts 생성).
// 우리 LoL 리그 라벨(LOL=LCK)은 한 시즌 안에 정규·컵·KeSPA 컵이 섞여 있어, 경기가 어느 대회인지는
// Match.raw.tournament_id 로만 갈린다(실측 2026: LCK 2026 148 · LCK Cup 40 · KeSPA Cup 38).
import rawTournaments from "../../../data/lol-tournaments.json";

export interface LolTournament {
  id: string;
  name: string;
  abbr?: string;
  logo?: string;
  cover?: string;
  /** unix sec */
  start?: number;
  end?: number;
  prize?: string;
}

type Row = Omit<LolTournament, "id">;
const TOURNAMENTS = (rawTournaments as { tournaments?: Record<string, Row> }).tournaments ?? {};

export function lolTournament(id: string | null | undefined): LolTournament | null {
  if (!id) return null;
  const row = TOURNAMENTS[id];
  return row ? { id, ...row } : null;
}

/** Match.raw(문자열 또는 객체)에서 대회를 해석. ts 수집 경로가 아닌 매치(LPL 등)는 null. */
export function lolTournamentOfMatch(raw: unknown): LolTournament | null {
  if (!raw) return null;
  let obj: { tournament_id?: string } | null = null;
  try {
    obj = typeof raw === "string" ? (JSON.parse(raw) as { tournament_id?: string }) : (raw as { tournament_id?: string });
  } catch {
    return null;
  }
  return lolTournament(obj?.tournament_id);
}
