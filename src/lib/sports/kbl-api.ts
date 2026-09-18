// KBL 공식 사이트가 쓰는 공개 API(kbl-api.sports2i.com · api-stats.kbl.or.kr) 래퍼 — 선수 프로필·시즌 평균(리그 순위)·시즌별·경기별·전체 선수 평균.
// 인증은 없고 Origin/Referer 만 필요하다(2026-09-18 실측). IP 화이트리스트가 없어 Vercel 에서 직접 호출 가능.
// ⚠️ no-store 금지 — ISR 페이지에서 불리면 500. next.revalidate 로 캐시(시즌 중 매일 바뀌는 값이라 1h).
// 시즌 코드: 2025-26 = 47, 2026-27 = 49 (48 아님). "현재 시즌"은 Common/recent-seasons 가 준다.

const BASE = "https://kbl-api.sports2i.com/api/v1";
const STATS_BASE = "https://api-stats.kbl.or.kr/api";
const HEADERS = { Origin: "https://kbl.or.kr", Referer: "https://kbl.or.kr/" };

async function kblGet<T>(url: string, revalidate = 3600): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: HEADERS, next: { revalidate }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/** 선수 사진 — kbl.or.kr 정적 경로 (playerNo 로 조립, 별도 수집 불필요) */
export function kblPlayerPhotoUrl(playerNo: string | number): string {
  return `https://kbl.or.kr/files/kbl/players-photo/${playerNo}.png`;
}

export const KBL_POS_KO: Record<string, string> = { GD: "가드", FD: "포워드", C: "센터", G: "가드", F: "포워드" };

export interface KblRegisteredPlayer {
  playerNo: number;
  kname: string;
  ename: string;
  teamCode: string;
  backNum: string;
  pos: string; // GD / FD / C
  pWeight: number;
  pHeight: number;
  yearNo: string; // 드래프트 연도
  roundNo: string;
  rankNo: string;
}

/** 등록 선수 전체 (regSc=Y, 2025-26 기준 170명) */
export async function fetchKblRegisteredPlayers(): Promise<KblRegisteredPlayer[]> {
  const d = await kblGet<{ totalCn: string; playerList: KblRegisteredPlayer[] }>(
    `${BASE}/players?regSc=Y&pageNo=1&listCn=400`,
    6 * 3600,
  );
  return d?.playerList ?? [];
}

export interface KblProfile {
  seasonCode: number;
  playerNo: string;
  kName: string;
  eName: string;
  birthday: string; // YYYYMMDD
  teamCode: string;
  pos: string;
  backNum: string;
  country: string;
  pHeight: string;
  univSch: string;
}

/** 프로필 (season 0 = 최근). playerScore 는 통산 평균 득점·리바운드·어시스트 */
export async function fetchKblPlayerProfile(playerNo: string, season = 0): Promise<{
  info: KblProfile | null;
  career: { score: number; rb: number; as: number } | null;
}> {
  const d = await kblGet<{
    playerInfo?: KblProfile[];
    playerScore?: Array<{ score: number; rb: number; as: number }>;
  }>(`${BASE}/players/profile/${season}/${playerNo}`);
  return { info: d?.playerInfo?.[0] ?? null, career: d?.playerScore?.[0] ?? null };
}

export interface KblCategoryAvg {
  columnName: string; // SCORE FDG FDG_RT FG FG_RT THREEP THREEP_RT FT FT_RT O_R D_R RB A_S S_T B_S
  value: number;
  rank: number;
  order: number;
}

export const KBL_CATEGORY_KO: Record<string, { label: string; pct?: boolean }> = {
  SCORE: { label: "득점" },
  FDG: { label: "야투 성공" },
  FDG_RT: { label: "야투 성공률", pct: true },
  FG: { label: "2점 성공" },
  FG_RT: { label: "2점 성공률", pct: true },
  THREEP: { label: "3점 성공" },
  THREEP_RT: { label: "3점 성공률", pct: true },
  FT: { label: "자유투 성공" },
  FT_RT: { label: "자유투 성공률", pct: true },
  O_R: { label: "공격 리바운드" },
  D_R: { label: "수비 리바운드" },
  RB: { label: "리바운드" },
  A_S: { label: "어시스트" },
  S_T: { label: "스틸" },
  B_S: { label: "블록" },
};

/** 시즌 평균 부문별 값 + 리그 내 순위 (season 0 = 통산) */
export async function fetchKblPlayerCategoryAvg(playerNo: string, season: number): Promise<KblCategoryAvg[]> {
  const d = await kblGet<Array<{ columnName: string; columnValue: string; orderNo: string; rankNo: string }>>(
    `${BASE}/players/categories/avg/${season}/${playerNo}`,
  );
  return (d ?? [])
    .map((r) => ({ columnName: r.columnName, value: Number(r.columnValue), rank: Number(r.rankNo), order: Number(r.orderNo) }))
    .filter((r) => Number.isFinite(r.value))
    .sort((a, b) => a.order - b.order);
}

export interface KblSeasonRecord {
  seasonCode: string;
  teamCode: string;
  gameCount: number;
  winTot: number;
  loseTot: number;
  avgPlaySec: number;
  avgScore: number;
  avgFdg: number; avgFdgA: number; avgFdgRt: number; // 야투
  avgThreeP: number; avgThreePA: number; avgThreePRt: number;
  avgFt: number; avgFtA: number; avgFtRt: number;
  avgOR: number; avgDR: number; avgRb: number;
  avgAS: number; avgSt: number; avgBs: number; avgTo: number; avgFoulTot: number;
  avgDd2Tot: number; avgTd3Tot: number;
}

/** 시즌별 정규리그 평균 (최신 시즌 먼저) + 플레이오프·통산 */
export async function fetchKblPlayerSeasons(playerNo: string): Promise<{
  regular: KblSeasonRecord[];
  playoff: KblSeasonRecord[];
  careerAvg: KblSeasonRecord | null;
}> {
  const d = await kblGet<{
    RegularSeasonRecords?: KblSeasonRecord[];
    RegularSeasonPlayoffRecords?: KblSeasonRecord[];
    RegularSeasonRecordAvgs?: KblSeasonRecord | KblSeasonRecord[] | null;
  }>(`${BASE}/players/categories/season/${playerNo}`);
  const avg = d?.RegularSeasonRecordAvgs;
  return {
    regular: [...(d?.RegularSeasonRecords ?? [])].sort((a, b) => Number(b.seasonCode) - Number(a.seasonCode)),
    playoff: [...(d?.RegularSeasonPlayoffRecords ?? [])].sort((a, b) => Number(b.seasonCode) - Number(a.seasonCode)),
    careerAvg: Array.isArray(avg) ? (avg[0] ?? null) : (avg ?? null),
  };
}

export interface KblGameRecord {
  seasonCode: number;
  gameCode: string;
  gameNo: string;
  teamCode: string;
  awayTeam: string; // 상대 팀코드
  win: number;
  loss: number;
  score: number; // 우리 팀 득점
  awayScore: number;
  gameDate: string; // YYYYMMDD
  playSec: number;
  pts: number;
  fdg: number; fdgA: number; fdgRt: number;
  threep: number; threepA: number; threepRt: number;
  ft: number; ftA: number; ftRt: number;
  oR: number; dR: number; rb: number;
  aS: number; sT: number; bS: number; tO: number; foulTot: number;
  margin: number;
}

/** 시즌 경기별 기록 (최신 경기 먼저). 두 번째 세그먼트 01 = 정규시즌 */
export async function fetchKblPlayerGames(playerNo: string, season: number): Promise<KblGameRecord[]> {
  const d = await kblGet<{ RegularGameRecords?: KblGameRecord[] }>(`${BASE}/players/categories/game/${season}/01/${playerNo}`);
  return [...(d?.RegularGameRecords ?? [])].sort((a, b) => b.gameDate.localeCompare(a.gameDate));
}

/** 현재(가장 최근 진행) 시즌 코드·이름 — 개막 전엔 직전 시즌을 준다 */
export async function fetchKblRecentSeason(): Promise<{ seasonCode: number; seasonName: string } | null> {
  const d = await kblGet<{ data?: Array<{ seasonCode: number; seasonName1: string }> }>(
    `${BASE}/Common/recent-seasons?seriesCd=1`,
    6 * 3600,
  );
  const s = d?.data?.[0];
  return s ? { seasonCode: s.seasonCode, seasonName: s.seasonName1 } : null;
}

/** "2025-2026" → "2025-26" (사이트 시즌 라벨 관행) */
export function kblSeasonLabel(seasonName: string): string {
  return seasonName.replace(/^(\d{4})-\d{2}(\d{2})$/, "$1-$2");
}

/** 시즌 코드 → 팀코드별 팀명 (구단명 변경 이력 반영 — 시즌별 기록 표에 쓴다) */
export async function fetchKblTeamNames(season: number): Promise<Map<string, string>> {
  const d = await kblGet<{ teamList?: Array<{ teamCode: string; teamName1: string }> }>(
    `${BASE}/Common/team?seasonCodeList=${season}&gameCodeList=01&startsDs=&endDs=`,
    24 * 3600,
  );
  return new Map((d?.teamList ?? []).map((t) => [t.teamCode, t.teamName1]));
}

export interface KblSeasonPlayerAvg {
  playerNo: string;
  kname: string;
  teamCode: string;
  teamName1: string;
  gameCount: number;
  score: number; rb: number; aS: number; sT: number; bS: number;
  threep: number; fdgRt: number; playSec: number;
}

/** 전체 선수 시즌 평균 — 리더보드용. ruleCk=1 은 규정 경기수 충족 선수만.
 *  ⚠️ listCn 은 서버 쪽 tinyint 라 128 이상이면 500("int→tinyint 변환 오류", 2026-09-18 실측) — 120 씩 페이지로 받는다. */
export async function fetchKblSeasonPlayerAverages(season: number, opts?: { ruleCk?: 0 | 1 }): Promise<KblSeasonPlayerAvg[]> {
  const ruleCk = opts?.ruleCk ?? 1;
  const PAGE = 120;
  const out: KblSeasonPlayerAvg[] = [];
  for (let page = 1; page <= 4; page++) {
    const d = await kblGet<{ data?: KblSeasonPlayerAvg[] }>(
      `${STATS_BASE}/records/player/general/traditional?seasonCode=${season}&gameCode=01&sortDataSc=SCORE&sortOrderSc=desc&listCn=${PAGE}&pageNo=${page}&ruleCk=${ruleCk}&perCn=1&lastCn=0&partIfList=0&draftNo=0`,
    );
    const rows = (d?.data ?? []).filter((p) => p.kname);
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

// ── api.kbl.or.kr (순위표와 같은 헤더 세트) — 시즌 목록만 쓴다 ──
const KBL_SITE_HEADERS = {
  Channel: "WEB", TeamCode: "XX", "X-Requested-With": "XMLHttpRequest", lang: "ko",
  Origin: "https://kbl.or.kr", Referer: "https://kbl.or.kr/",
};

export interface KblSeasonMeta {
  seasonCode: number;
  glkey: string; // S47G01
  name: string; // "2025-2026"
  label: string; // "2025-26"
  start: string; // YYYYMMDD
  end: string;
}

/** 정규시즌 목록 (최신 먼저). 시즌 코드 ↔ 라벨·기간 해석에 쓴다 (2026-27 = 49, 48 은 건너뜀). */
export async function fetchKblSeasonList(): Promise<KblSeasonMeta[]> {
  try {
    const r = await fetch("https://api.kbl.or.kr/season/list?seasonCategory=R&gameCode=01&seasonGrade=1", {
      headers: KBL_SITE_HEADERS, next: { revalidate: 24 * 3600 }, signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return [];
    const rows = (await r.json()) as Array<{ glkey: string; seasonCode: number; seasonName: string; gamedateStart: string; gamedateEnd: string }>;
    return (Array.isArray(rows) ? rows : [])
      .map((x) => ({ seasonCode: x.seasonCode, glkey: x.glkey, name: x.seasonName, label: kblSeasonLabel(x.seasonName), start: x.gamedateStart, end: x.gamedateEnd }))
      .sort((a, b) => b.seasonCode - a.seasonCode);
  } catch {
    return [];
  }
}
