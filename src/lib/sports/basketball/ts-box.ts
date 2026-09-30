// ts 농구 match/live/history 의 players 박스스코어 파서 — 시즌 선수 통계 API 가 미인가라 국제대회(아시안게임) 기록은 경기별 박스를 모아 만든다.
// players = [홈 선수[], 원정 선수[], 홈 합계, 원정 합계]. 선수 = [tsId, 이름, 사진, 등번호, "분^야투^3점^자유투^공리^수리^리바^어시^스틸^블록^턴오버^파울^+/-^득점^…"].
//  필드 순서는 2026-09-20 일본-한국(57-67) 합계로 검산했다 — 득점 = 야투×2 + 3점 + 자유투.
import { thesportsGet } from "@/lib/sports/thesports/client";

export interface TsBoxPlayer {
  id: string;
  name: string;
  photo: string | null;
  min: number;
  fgm: number; fga: number;
  tpm: number; tpa: number;
  ftm: number; fta: number;
  reb: number; ast: number; stl: number; blk: number; tov: number;
  pts: number;
}
export interface TsBox { home: TsBoxPlayer[]; away: TsBoxPlayer[] }

const made = (s: string | undefined) => {
  const [m, a] = (s ?? "0-0").split("-").map(Number);
  return [m || 0, a || 0] as const;
};

export function parseTsBoxPlayer(row: unknown): TsBoxPlayer | null {
  if (!Array.isArray(row) || typeof row[0] !== "string" || typeof row[4] !== "string") return null;
  const f = row[4].split("^");
  const n = (i: number) => Number(f[i]) || 0;
  const [fgm, fga] = made(f[1]);
  const [tpm, tpa] = made(f[2]);
  const [ftm, fta] = made(f[3]);
  return {
    id: row[0], name: String(row[1] ?? ""), photo: typeof row[2] === "string" && row[2] ? row[2] : null,
    min: n(0), fgm, fga, tpm, tpa, ftm, fta,
    reb: n(6), ast: n(7), stl: n(8), blk: n(9), tov: n(10), pts: n(13),
  };
}

/** 종료 경기 박스스코어. 선수 목록이 비면 null (중계 데이터가 없는 경기). */
export async function fetchTsBasketballBox(tsMatchId: string): Promise<TsBox | null> {
  const r = await thesportsGet<{ code: number; results?: { players?: unknown[] } }>("/v1/basketball/match/live/history", { uuid: tsMatchId });
  const p = r.results?.players;
  if (!Array.isArray(p)) return null;
  const side = (i: number) => (Array.isArray(p[i]) ? (p[i] as unknown[]).map(parseTsBoxPlayer).filter((x): x is TsBoxPlayer => !!x) : []);
  const box = { home: side(0), away: side(1) };
  return box.home.length + box.away.length > 0 ? box : null;
}
