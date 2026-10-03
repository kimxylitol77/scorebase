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

/* ── 문자중계(text-cast) ─────────────────────────────────────────────────────────────
 * 코드표는 KBL 사이트 번들의 gameActionCodeList·gameFoulCodeList·gameChangeCodeList(2026-10-03 추출).
 * 한 줄 = { n 순번, q 쿼터(Q1~Q4·X1~ 연장), m:s 남은 시간, t 구단 코드, p 선수, a 동작, f 파울 종류, c 교체·퇴장 }.
 * 001·009 는 쿼터마다 나온다(경기 종료 판정은 우리 Match.status 로).
 * 점수는 오지 않아 득점 동작(2점·자유투·3점·덩크)을 더해 그때의 스코어를 만든다(2025-26 개막전 81-89 검산).
 */
const ACTION: Record<string, string> = {
  "001": "쿼터 시작", "002": "경기 중단", "003": "작전 타임", "009": "쿼터 종료", "010": "시간 설정",
  "101": "교체 투입", "102": "교체 아웃",
  "201": "2점슛 성공", "202": "2점슛 실패", "203": "자유투 성공", "204": "자유투 실패",
  "205": "3점슛 성공", "206": "3점슛 실패", "207": "덩크슛 성공", "208": "덩크슛 실패",
  "209": "공격 리바운드", "210": "수비 리바운드", "211": "어시스트", "212": "스틸", "213": "블록",
  "214": "턴오버", "215": "파울 자유투", "216": "파울", "217": "팀 속공", "218": "팀 리바운드", "219": "일리걸",
  "221": "굿 디펜스", "223": "팀 턴오버", "224": "기타 파울", "225": "팀 파울", "226": "스크린 어시스트",
  "227": "디플렉션", "228": "비디오 판독", "229": "코치 챌린지",
};
const FOUL: Record<string, string> = {
  EBF: "엘보우 파울", FRF: "U파울", FTF: "파이팅 파울", PCF: "펀칭 파울", PNF: "퍼스널 파울", TCF: "테크니컬 파울",
};
const CHANGE: Record<string, string> = { "106_1": "5반칙 퇴장", "106_2": "디스퀄리파잉 퇴장", "106_3": "퇴장" };
const POINTS: Record<string, number> = { "201": 2, "203": 1, "205": 3, "207": 2 };

export type KblPlayKind = "score" | "miss" | "rebound" | "defense" | "foul" | "sub" | "stoppage" | "other";
export interface KblPlay {
  n: number;
  /** "1Q"~"4Q", 연장은 "OT1"… */
  period: string;
  clock: string;
  side: "home" | "away" | null;
  player: string | null;
  text: string;
  kind: KblPlayKind;
  points: number;
  homeScore: number;
  awayScore: number;
}
interface KblTextCastRow { n: number; q: string; m: number; s: number; t: string; p?: string; a: string; f?: string; c?: string }

const kindOf = (a: string): KblPlayKind =>
  POINTS[a] ? "score"
  : ["202", "204", "206", "208"].includes(a) ? "miss"
  : ["209", "210", "218"].includes(a) ? "rebound"
  : ["211", "212", "213", "221", "226", "227"].includes(a) ? "defense"
  : ["215", "216", "224", "225"].includes(a) ? "foul"
  : ["101", "102"].includes(a) ? "sub"
  : ["001", "002", "003", "009", "228", "229"].includes(a) ? "stoppage"
  : "other";

/** 시간순 해독 + 누적 스코어. homeCode = 우리 홈팀의 KBL 구단 코드. 선발 = 경기 시작 전 교체 투입. */
export function decodeKblPlays(rows: KblTextCastRow[], homeCode: string): { plays: KblPlay[]; starters: { home: string[]; away: string[] } } {
  let h = 0, a = 0;
  let started = false;
  const starters = { home: [] as string[], away: [] as string[] };
  const plays: KblPlay[] = [];
  for (const r of [...rows].sort((x, y) => x.n - y.n)) {
    const side = !r.t ? null : r.t === homeCode ? "home" : "away";
    if (r.a === "001") started = true;
    if (!started && r.a === "101" && side && r.p) starters[side].push(r.p);
    const pts = POINTS[r.a] ?? 0;
    if (side === "home") h += pts; else if (side === "away") a += pts;
    const extra = [r.f && FOUL[r.f], r.c && CHANGE[r.c]].filter(Boolean).join(" · ");
    plays.push({
      n: r.n,
      period: r.q.startsWith("X") ? `OT${r.q.slice(1)}` : `${r.q.slice(1)}Q`,
      clock: `${r.m}:${String(r.s).padStart(2, "0")}`,
      side,
      player: r.p ?? null,
      text: `${ACTION[r.a] ?? "기록"}${extra ? ` (${extra})` : ""}`,
      kind: kindOf(r.a),
      points: pts,
      homeScore: h,
      awayScore: a,
    });
  }
  return { plays, starters };
}

/** 경기 전체 문자중계(연장 포함). 경기 중 10초 캐시. */
export async function fetchKblPlays(gmkey: string, homeCode: string, live: boolean) {
  const rows = await kblGet<KblTextCastRow[]>(`/match/${gmkey}/text-cast?quarterList=Q1,Q2,Q3,Q4,X1,X2,X3,X4`, live ? 10 : 3600);
  return rows?.length ? decodeKblPlays(rows, homeCode) : null;
}
