// KOVO(한국배구연맹) 공식 사이트가 쓰는 공개 API(user-api.kovo.co.kr) 래퍼 — 팀 로스터·선수 프로필·시즌별 기록·리그 순위·기록 상세·부문별 순위.
// 인증 없음, Origin/Referer 만(2026-09-18 실측). 시즌 코드 3자리("022" = 2025-26, "023" = 2026-27). 현재 시즌은 /main/game/season.
// ⚠️ no-store 금지 — ISR 페이지에서 불리면 500. next.revalidate 로 캐시(1h).
const BASE = "https://user-api.kovo.co.kr";
const HEADERS = { Origin: "https://kovo.co.kr", Referer: "https://kovo.co.kr/", "Accept-Language": "ko" };

async function kovoGet<T>(path: string, revalidate = 3600): Promise<T | null> {
  try {
    const r = await fetch(`${BASE}${path}`, { headers: HEADERS, next: { revalidate }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { result?: { status?: number }; payload?: T };
    if (j.result?.status !== 200) return null;
    return j.payload ?? null;
  } catch {
    return null;
  }
}

/** KOVO 팀코드 → 우리 Team.id · 리그. 1xxx 남자부, 2xxx 여자부. 1003 상무·1007 드림식스는 역대 팀(현역 아님). */
export const KOVO_TEAMS: Record<string, { teamId: number; league: "V_LEAGUE" | "V_LEAGUE_W"; short: string }> = {
  "1001": { teamId: 612673, league: "V_LEAGUE", short: "대한항공" },
  "1005": { teamId: 612674, league: "V_LEAGUE", short: "현대캐피탈" },
  "1004": { teamId: 612675, league: "V_LEAGUE", short: "KB손해보험" },
  "1009": { teamId: 612676, league: "V_LEAGUE", short: "우리카드" },
  "1006": { teamId: 612677, league: "V_LEAGUE", short: "한국전력" },
  "1008": { teamId: 612678, league: "V_LEAGUE", short: "OK저축은행" },
  "1002": { teamId: 612679, league: "V_LEAGUE", short: "삼성화재" },
  "2002": { teamId: 612680, league: "V_LEAGUE_W", short: "한국도로공사" },
  "2001": { teamId: 612681, league: "V_LEAGUE_W", short: "현대건설" },
  "2005": { teamId: 612682, league: "V_LEAGUE_W", short: "GS칼텍스" },
  "2004": { teamId: 612683, league: "V_LEAGUE_W", short: "흥국생명" },
  "2006": { teamId: 612684, league: "V_LEAGUE_W", short: "IBK기업은행" },
  "2003": { teamId: 612686, league: "V_LEAGUE_W", short: "정관장" },
  // 2026-27 페퍼저축은행(2007, 로스터 0명) → SOOP 소퍼스(2008, 광주). 같은 Team row(612685, ts id 유지)를 이름만 바꿔 쓴다 — 2026-09-18.
  "2008": { teamId: 612685, league: "V_LEAGUE_W", short: "SOOP" },
};
export const KOVO_POS_KO: Record<string, string> = { OP: "아포짓", OH: "아웃사이드 히터", MB: "미들 블로커", S: "세터", L: "리베로", Li: "리베로" };

export interface KovoPlayerBasic {
  playerCode: string; teamCode: string; teamName: string | null; name: string;
  position: string; backNumber: number | null; birthDate: string | null; image: string | null;
  status?: string[]; height?: number | null; weight?: number | null;
}
/** 팀 현재 로스터 (외국인·아시아쿼터 포함) */
export async function fetchKovoTeamPlayers(tcode: string): Promise<KovoPlayerBasic[]> {
  return (await kovoGet<KovoPlayerBasic[]>(`/teams/${tcode}/players`, 6 * 3600)) ?? [];
}
export interface KovoPlayerProfile extends KovoPlayerBasic { school: string | null; armyStatus: string | null }
export async function fetchKovoPlayer(code: string): Promise<KovoPlayerProfile | null> {
  return kovoGet<KovoPlayerProfile>(`/players/${code}`);
}
/** 소속 이력 — "2025-2026 한국전력 (2025.10.15)" 문자열 배열 */
export async function fetchKovoPlayerHistory(code: string): Promise<string[]> {
  return (await kovoGet<string[]>(`/players/${code}/history`)) ?? [];
}
export interface KovoSeasonRecord {
  leagueDivision: string; seasonDivision: string; teamName: string;
  gameCount: number; setCount: number; point: number;
  attackTotalSuccess: number; blockingSetSuccess: number; serveSetSuccess: number; setSuccess: number;
  receiveSuccess: number; digSetSuccess: number; warning: number; error: number;
}
/** 시즌별 기록 (정규·플레이오프·컵 등 경기구분별, 최신 먼저) */
export async function fetchKovoPlayerSeasonRecords(code: string): Promise<KovoSeasonRecord[]> {
  return (await kovoGet<KovoSeasonRecord[]>(`/players/${code}/season-records`)) ?? [];
}
export interface KovoRankings { point: number | null; attack: number | null; serve: number | null; block: number | null; defense: number | null; set: number | null }
/** 최근 시즌 부문별 리그 순위 (규정 미달이면 null) */
export async function fetchKovoPlayerRankings(code: string): Promise<KovoRankings | null> {
  return kovoGet<KovoRankings>(`/players/${code}/rankings`);
}
/** 최근 시즌 요약 6부문 (득점 합계 · 공격 성공률 · 서브/블로킹/디그/세트 세트당) */
export async function fetchKovoPlayerRecords(code: string): Promise<KovoRankings | null> {
  return kovoGet<KovoRankings>(`/players/${code}/records`);
}
export interface KovoRecordDetail {
  gameCount: number; setCount: number;
  attackTry: number; attackSuccess: number; attackFail: number; attackError: number; attackSuccessPercent: number; attackEfficiency: number; attackGamePercent: number;
  blockTry: number; blockSuccess: number; blockValidBlock: number; blockFail: number; blockError: number; blockSuccessPercent: number; blockSetPercent: number;
  serveTry: number; serveSuccess: number; serveError: number; serveSuccessPercent: number; serveSetPercent: number;
  setTry: number; setSuccess: number; setError: number; setSuccessPercent: number; setSetPercent: number;
  receiveTry: number; receiveSuccess: number; receiveFail: number; receiveSuccessPercent: number;
  digTry: number; digSuccess: number; digFail: number; digError: number; digSuccessPercent: number; digSetPercent: number;
}
export async function fetchKovoPlayerRecordDetail(code: string): Promise<KovoRecordDetail | null> {
  return kovoGet<KovoRecordDetail>(`/players/${code}/season-record-detail`);
}
export interface KovoSeasonMeta { seasonCode: string; seasonName: string; ryear: string }
export async function fetchKovoSeasonList(): Promise<KovoSeasonMeta[]> {
  const list = (await kovoGet<KovoSeasonMeta[]>("/stat/season-list?gcode=001", 24 * 3600)) ?? [];
  return [...list].sort((a, b) => b.seasonCode.localeCompare(a.seasonCode));
}
/** 현재 시즌 코드 (개막 전에도 새 시즌 코드) */
export async function fetchKovoCurrentSeason(): Promise<string | null> {
  return (await kovoGet<{ seasonCode: string }>("/main/game/season", 6 * 3600))?.seasonCode ?? null;
}
/** "2025-2026" → "2025-26", "2005" 그대로 */
export function kovoSeasonLabel(ryear: string): string {
  return ryear.replace(/^(\d{4})-\d{2}(\d{2})$/, "$1-$2");
}
export interface KovoRankRow { rank: number; pcode: string; pname: string; tsname: string; sup: number; g_count: number; image: string | null }
/** 부문별 선수 순위 (rpart: point·at·b·s·set·r). gender 1=남 2=여 */
export async function fetchKovoPlayerRank(seasonCode: string, gender: 1 | 2, rpart: string, size = 10): Promise<KovoRankRow[]> {
  const p = await kovoGet<KovoRankRow[] | { content?: KovoRankRow[] }>(
    `/stat/league/player-rank?seasonCode=${seasonCode}&gender=${gender}&leagueCode=201&round=0&rpart=${rpart}&sort=rank,asc&page=0&size=${size}`,
  );
  const list = Array.isArray(p) ? p : (p?.content ?? []);
  return list.filter((r) => r.pname && r.rank > 0);
}
