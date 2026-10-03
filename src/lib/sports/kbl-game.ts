// KBL 공식 경기 API(api.kbl.or.kr) — 경기 키(gmkey) 찾기·선수 박스스코어·팀 기록. 경기 상세의 "선수 기록" 탭이 NBA 와 같은 모양으로 쓴다.
// 헤더 Channel·TeamCode 가 없으면 400("필수 헤더 정보가 누락"). 인증·IP 제한은 없다(2026-10-03 실측).
import type { BasketballPlayerBox, MatchTeamStat } from "@/lib/sports/live-scores";

const BASE = "https://api.kbl.or.kr";
const HEADERS = {
  Origin: "https://kbl.or.kr", Referer: "https://kbl.or.kr/", "User-Agent": "Mozilla/5.0",
  Channel: "WEB", TeamCode: "XX", lang: "ko", "X-Requested-With": "XMLHttpRequest",
};

/** 우리 Team.id → 현재 KBL 구단 코드 (scripts/backfill-kbl-history.ts 와 같은 구단) */
export const KBL_TEAM_CODE: Record<number, string> = {
  607775: "35", 607776: "60", 607777: "50", 607778: "55", 607779: "10",
  607780: "16", 607781: "06", 607782: "64", 607783: "70", 607784: "66",
};

async function kblGet<T>(path: string, revalidate: number): Promise<T | null> {
  try {
    const r = await fetch(`${BASE}${path}`, { headers: HEADERS, next: { revalidate }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

const kstDay = (d: Date) => {
  const k = new Date(d.getTime() + 9 * 3600_000);
  return `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, "0")}${String(k.getUTCDate()).padStart(2, "0")}`;
};

/** 경기 날짜(한국) + 두 팀으로 KBL 경기 키. 홈·원정이 뒤집힌 경우도 찾고 swapped 로 알린다. */
export async function findKblGmkey(startTime: Date, homeTeamId: number, awayTeamId: number): Promise<{ gmkey: string; swapped: boolean } | null> {
  const h = KBL_TEAM_CODE[homeTeamId], a = KBL_TEAM_CODE[awayTeamId];
  if (!h || !a) return null;
  const day = kstDay(startTime);
  const list = await kblGet<Array<{ gmkey: string; tcodeH: string; tcodeA: string }>>(`/match/list?fromDate=${day}&toDate=${day}&tcodeList=all`, 600);
  const g = (list ?? []).find((x) => (x.tcodeH === h && x.tcodeA === a) || (x.tcodeH === a && x.tcodeA === h));
  return g ? { gmkey: g.gmkey, swapped: g.tcodeH !== h } : null;
}

interface KblRecords {
  playMin: number; playSec: number; score: number; rb: number; offr: number; ast: number; stl: number; bs: number; to: number;
  fgt: number; fgtA: number; threep: number; threepA: number; ft: number; ftA: number; foul: number;
}
interface KblPlayerStat {
  player: { pcode: string; pname: string; tcode: string; backNum?: string; pos?: string };
  records: KblRecords;
}

const POS_KO: Record<string, string> = { GD: "G", FD: "F", C: "C", G: "G", F: "F" };

export function toPlayerBox(p: KblPlayerStat): BasketballPlayerBox & { pcode: string } {
  const r = p.records;
  return {
    pcode: p.player.pcode,
    name: p.player.pname,
    pos: POS_KO[p.player.pos ?? ""] ?? p.player.pos ?? null,
    min: `${r.playMin}:${String(r.playSec).padStart(2, "0")}`,
    points: r.score, reb: r.rb, oreb: r.offr, assists: r.ast, steals: r.stl, blocks: r.bs,
    fgm: r.fgt, fga: r.fgtA, tpm: r.threep, tpa: r.threepA, ftm: r.ft, fta: r.ftA,
  };
}

/** 선수 박스(홈·원정, 출전한 선수만, 득점순) + 팀 기록 비교. 경기 중엔 15초 캐시. */
export async function fetchKblBox(gmkey: string, homeCode: string, live: boolean): Promise<{
  homePlayers: BasketballPlayerBox[]; awayPlayers: BasketballPlayerBox[]; homeStats: MatchTeamStat[]; awayStats: MatchTeamStat[];
} | null> {
  const ttl = live ? 15 : 3600;
  const [players, teams] = await Promise.all([
    kblGet<KblPlayerStat[]>(`/match/${gmkey}/player-stat`, ttl),
    kblGet<Array<{ tcode: string; records: KblRecords & Record<string, number> }>>(`/match/${gmkey}/team-record`, ttl),
  ]);
  if (!players?.length) return null;
  const played = (p: KblPlayerStat) => p.records.playMin * 60 + p.records.playSec > 0;
  const side = (home: boolean) =>
    players.filter((p) => (p.player.tcode === homeCode) === home && played(p)).map(toPlayerBox).sort((x, y) => y.points - x.points);
  const stat = (t: (KblRecords & Record<string, number>) | undefined): MatchTeamStat[] => {
    if (!t) return [];
    const pct = (m: number, a: number) => (a > 0 ? `${m}-${a} (${Math.round((m / a) * 100)}%)` : `${m}-${a}`);
    return [
      { label: "야투", value: pct(t.fgt, t.fgtA), raw: t.fgtA ? t.fgt / t.fgtA : -Infinity },
      { label: "3점슛", value: pct(t.threep, t.threepA), raw: t.threepA ? t.threep / t.threepA : -Infinity },
      { label: "자유투", value: pct(t.ft, t.ftA), raw: t.ftA ? t.ft / t.ftA : -Infinity },
      { label: "리바운드", value: String(t.rb), raw: t.rb },
      { label: "공격 리바운드", value: String(t.offr), raw: t.offr },
      { label: "어시스트", value: String(t.ast), raw: t.ast },
      { label: "스틸", value: String(t.stl), raw: t.stl },
      { label: "블록", value: String(t.bs), raw: t.bs },
      { label: "턴오버", value: String(t.to), raw: t.to },
      { label: "파울", value: String(t.foul), raw: t.foul },
      ...(t.fbScoreCn != null ? [{ label: "속공 득점", value: String(t.fbScoreCn), raw: t.fbScoreCn }] : []),
      ...(t.secChanceScoreCn != null ? [{ label: "세컨드 찬스 득점", value: String(t.secChanceScoreCn), raw: t.secChanceScoreCn }] : []),
      ...(t.benchScoreCn != null ? [{ label: "벤치 득점", value: String(t.benchScoreCn), raw: t.benchScoreCn }] : []),
      ...(t.maxLeadScoreCn != null ? [{ label: "최다 점수차 리드", value: String(t.maxLeadScoreCn), raw: t.maxLeadScoreCn }] : []),
    ];
  };
  const homeT = teams?.find((t) => t.tcode === homeCode)?.records;
  const awayT = teams?.find((t) => t.tcode !== homeCode)?.records;
  return { homePlayers: side(true), awayPlayers: side(false), homeStats: stat(homeT), awayStats: stat(awayT) };
}
