// api-football Pro 전용 enrichment 데이터.
// - 시즌 부상자 (전체 한 번 호출 + 메모리 캐시)
// - 시즌 득점왕 (전체 한 번 호출 + 메모리 캐시)
//
// 호출 절약: 시즌·리그 단위 캐시. 만료 6시간.

import axios from "axios";

const BASE_URL = "https://v3.football.api-sports.io";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6시간

// 우리 League 코드 → api-football league ID 매핑
export const API_FOOTBALL_LEAGUE_ID: Record<string, number> = {
  EPL: 39,
  LALIGA: 140,
  BUNDESLIGA: 78,
  SERIE_A: 135,
  LIGUE_1: 61,
  MLS: 253,
  UCL: 2,
  WORLD_CUP: 1, // FIFA World Cup
  J1_LEAGUE: 98,
  J2_LEAGUE: 99,
  AFC_CL: 17, // AFC Champions League Elite
  K_LEAGUE_1: 292,
  K_LEAGUE_2: 293,
  SAUDI_PL: 307,
  UEL: 3,
  UECL: 848,
  CHAMPIONSHIP: 40,
  LALIGA_2: 141,
  BUNDESLIGA_2: 79,
  SERIE_B: 136,
  LIGUE_2: 62,
  CLUB_WORLD_CUP: 15,
  AFC_CL_TWO: 18,
  AFC_U23: 532,
  CSL: 169,
  A_LEAGUE: 188,
  EREDIVISIE: 88,
  PRIMEIRA_LIGA: 94,
  SUPER_LIG: 203,
  JUPILER_PL: 144,
  SPL: 179,
  GREEK_SL: 197,
  BRASILEIRAO: 71,
  BRASILEIRAO_2: 72, // 브라질 세리에 B
  LIGA_MX: 262,
  COPA_LIB: 13,
  COPA_SUD: 11,
  // 유럽 추가 (8월~5월 시즌)
  EKSTRAKLASA: 106, // 폴란드 1부
  POLAND_1L: 107, // 폴란드 2부 (I Liga)
  BULGARIA_PL: 172, // 불가리아 1부 (First League)
  LIGA_I: 283, // 루마니아 1부
  SWISS_SL: 207, // 스위스 1부 (Super League)
  CHALLENGE_LEAGUE: 208, // 스위스 2부
  ARMENIA_PL: 342, // 아르메니아 1부
  // 유럽 Tier 1·2 (8월~5월)
  AUSTRIA_BL: 218, // 오스트리아 분데스리가
  CZECH_L: 345, // 체코 1부
  HNL: 210, // 크로아티아 HNL
  UKRAINE_PL: 333, // 우크라이나 프리미어
  HUNGARY_NB1: 271, // 헝가리 NB I
  SERBIA_SL: 286, // 세르비아 슈퍼리가
  SLOVAKIA_SL: 332, // 슬로바키아 슈퍼리가
  SLOVENIA_SNL: 373, // 슬로베니아 1. SNL
  CYPRUS_1D: 318, // 키프로스 1부
  DENMARK_SL: 119, // 덴마크 슈페르리가
  // 유럽 Tier 3
  IRELAND_PD: 357, // 아일랜드 Premier Division (2~11월 봄~가을)
  BOSNIA_PL: 315, // 보스니아 Premijer Liga (8~5월)
  ALBANIA_SL: 310, // 알바니아 Superliga (8~5월)
  MOLDOVA_SL: 394, // 몰도바 Super Liga (8~5월)
  // 북유럽 (봄~가을 시즌, default seasonFor 처리)
  ELITESERIEN: 103, // 노르웨이 1부 (3~11월)
  NORWAY_1L: 104, // 노르웨이 2부
  ALLSVENSKAN: 113, // 스웨덴 1부 (3~11월)
  SUPERETTAN: 114, // 스웨덴 2부
  VEIKKAUSLIIGA: 244, // 핀란드 1부 (4~10월)
  YKKONEN: 245, // 핀란드 2부
  URVALSDEILD: 164, // 아이슬란드 1부 (5~9월)
  ICELAND_1L: 165, // 아이슬란드 2부
  // 남미 추가 (달력 연도 시즌)
  CHILE_PD: 265, // 칠레 1부
  CHILE_PB: 266, // 칠레 2부
  ECUADOR_LP: 242, // 에콰도르 Liga Pro
  COLOMBIA_PA: 239, // 콜롬비아 1부
  PERU_PD: 281, // 페루 1부
  VENEZUELA_PD: 299, // 베네수엘라 1부
  // 기타 (아시아·중동·아프리카·북미 보강)
  EGYPT_PL: 233, // 이집트 1부 (8~5월)
  ISRAEL_PL: 383, // 이스라엘 Ligat Ha'al (8~5월) — 382는 2부 Liga Leumit
  INDIA_ISL: 323, // 인도 ISL (9~5월)
  VIETNAM_VL1: 340, // 베트남 V.League 1
  INDONESIA_L1: 274, // 인도네시아 Liga 1 (8~5월)
  SINGAPORE_PL: 368, // 싱가포르 Premier (달력)
  UAE_PL: 301, // UAE Pro (8~5월)
  QATAR_SL: 305, // 카타르 Stars (8~5월)
  MOROCCO_BP: 200, // 모로코 Botola Pro (9~5월)
  SOUTHAFRICA_PSL: 288, // 남아공 PSL (8~5월)
  USA_USL_CH: 255, // USL Championship (3~10월)
  CANADA_PL: 479, // Canadian Premier (4~10월)
  // 컵 대회 (2026-05-20 추가)
  FA_CUP: 45, // 잉글랜드 FA Cup
  EFL_CUP: 48, // 잉글랜드 EFL Cup / Carabao Cup
  SCO_LEAGUE_CUP: 185, // 스코틀랜드 리그컵 (League Cup)
  COPA_DEL_REY: 143, // 스페인 코파 델 레이
  COPPA_ITALIA: 137, // 이탈리아 코파 이탈리아
  DFB_POKAL: 81, // 독일 DFB-Pokal
  COUPE_DE_FRANCE: 66, // 프랑스 쿠프 드 프랑스
  KFA_CUP: 294, // 한국 FA Cup (검증 2026-05-25, country=South-Korea, current=2025 봄~겨울)
  EMPEROR_CUP: 102, // 일본 천황배 (2026-06-10 id 교정: 290=이란 1부였음)
  CONCACAF_CCUP: 16, // CONCACAF Champions Cup
  // ───── 신규 추가 (2026-05-22, 23개) ─────
  // ID 일부는 api-football 공식 docs 기반 추정 — 실 검증 후 확정 (collector
  // 첫 호출 시 매치 0건이면 id 보정 필요).
  // 한국 하부 + 일본 J3 + 동남아 추가
  K3_LEAGUE: 295, // K3 리그 (2026-06-10 id 교정: 766=China Cup 이었음)
  J3_LEAGUE: 100, // J3 리그
  THAI_L1: 296, // Thai League 1
  VIETNAM_VL2: 637, // V.League 2 (2026-06-10 id 교정: 341=베트남컵이었음)
  // 남미 추가
  ARGENTINA_PL: 128, // Liga Profesional
  URUGUAY_PD: 268, // Primera División
  PARAGUAY_PD: 250, // Division Profesional Apertura (2026-06-10 id 교정: 284=루마니아 2부였음. Clausura 는 252)
  BOLIVIA_PD: 344, // División Profesional
  // 국가대표 토너 / 예선 / 친선
  AFCON: 6, // Africa Cup of Nations
  UEFA_NL: 5, // UEFA Nations League
  WC_QUAL: 32, // World Cup Qualifying — UEFA (32), 다른 지역 id 별개
  EURO_QUAL: 960, // Euro Qualifying
  CONCACAF_GOLD: 22, // CONCACAF Gold Cup
  INTL_FRIENDLY: 10, // International Friendlies
  CLUB_FRIENDLY: 667, // Friendlies Clubs (프리시즌 클럽 친선) — 스코어 피드 전용
  U20_WC: 490, // FIFA U-20 World Cup (2026-05-25 정정: 이전 38 은 UEFA U21)
  U17_WC: 587, // FIFA U-17 World Cup (2026-05-25 정정: 이전 488 은 독일 U19 Bundesliga)
  // 청소년 대표 (2026-05-25 추가)
  UEFA_U21_Q: 850, // UEFA U21 Championship - Qualification
  UEFA_U21: 38, // UEFA U21 Championship (본선)
  UEFA_U19: 493, // UEFA U19 Championship
  UEFA_U17: 921, // UEFA U17 Championship
  OLYMPICS_FOOTBALL: 480, // Olympic Football (남자)
  // 여자 축구
  WSL: 44, // FA Women's Super League
  NWSL: 254, // NWSL
  WK_LEAGUE: 660, // 한국 WK리그 (2026-06-10 id 교정: 783=폴란드 3부였음)
  UEFA_WCL: 525, // UEFA Women's Champions League
  A_LEAGUE_W: 190, // A-League Women (2026-06-10 id 교정: 191=브리즈번 지역리그였음)
  // ───── 2026-05-24 추가 (4개) ─────
  // ID 는 api-football 공식 docs 기반 — collector 첫 호출 시 매치 0건이면 id 보정 필요.
  SUI_CUP: 209, // 스위스컵 (8~5월)
  LEAGUE_ONE: 41, // 잉글랜드 League One (3부, 8~5월)
  LATVIA_VL: 365, // 라트비아 비르슬리가 (1부, 봄~가을)
  BELARUS_PL: 116, // 벨라루스 프리미어 리그 (1부, 봄~가을)
  // ───── 2026-05-24 추가 (2차, 8개) ─────
  ESTONIA_ML: 329, // 에스토니아 Meistriliiga (봄~가을) — 2026-05-25 수정 (이전 327 은 조지아)
  LITHUANIA_AL: 362, // 리투아니아 A Lyga (봄~가을)
  LEVAIN_CUP: 101, // 일본 J-League Cup / 르베인 컵 (3~10월). 2026-05-27 정정: 이전 291 은 이란 Azadegan League — 사용자 화면 LiveScoresBar 에 이란 매치 표시 사고.
  KAZAKHSTAN_PL: 389, // 카자흐스탄 Premier (봄~가을)
  GEORGIA_EL: 327, // 조지아 Erovnuli Liga (봄~가을) — 2026-05-25 수정 (이전 329 는 에스토니아)
  AZERBAIJAN_PL: 419, // 아제르바이잔 Premier (8~5월)
  EREDIVISIE_2: 89, // 네덜란드 Eerste Divisie (2부, 8~5월)
  PRIMEIRA_LIGA_2: 95, // 포르투갈 Liga Portugal 2 (2부, 8~5월)
  // ───── 2026-05-24 추가 (3차) — TheSports 업그레이드 후 검증 ─────
  LEAGUE_TWO: 42, // 잉글랜드 EFL League Two (4부, 8~5월)
  NATIONAL_LEAGUE: 43, // 잉글랜드 National League (5부, 8~5월)
  SCOT_CHAMPIONSHIP: 180, // 스코티시 챔피언십 (2부, 8~5월) (2026-06-10 id 교정: 181=스코트 FA컵이었음)
  SCOT_LEAGUE_ONE: 183, // 스코티시 리그 1 (3부, 8~5월) (2026-06-10 id 교정: 182=챌린지컵이었음)
  SCOT_LEAGUE_TWO: 184, // 스코티시 리그 2 (4부, 8~5월) (2026-06-10 id 교정: 183=리그1이었음)
  RPL: 235, // 러시아 프리미어리그 (8~5월)
  ALGERIA_L1: 186, // 알제리 리그 프로페시오넬 1 (8~5월)
  SVENSKA_CUPEN: 115, // 스벤스카 컵 (스웨덴 컵, 2~6월) — 달력연도 (2026-06-10 id 교정: 109=폴란드 2부였음)
  GHANA_PL: 570, // 가나 프리미어리그 (9~5월) (2026-06-10 id 교정: 240=콜롬비아 2부였음)
  // ARG_PRIMERA_NACIONAL 제거 — api-football 131 은 실제 Primera B Metropolitana(3부) 오매핑.
  // 진짜 2부는 TheSports(9vjxm8ghonr6odg)로 수집 (2026-05-29).
};

interface CacheEntry<T> {
  fetchedAt: number;
  data: T;
}

const injuriesCache = new Map<string, CacheEntry<InjuryEntry[]>>();
const topScorersCache = new Map<string, CacheEntry<TopScorerEntry[]>>();

/**
 * api-football 팀명 매칭 — "Man City" ↔ "Manchester City",
 * "Brighton Hove" ↔ "Brighton & Hove Albion" 같은 차이 흡수.
 * 토큰화 후 의미 단어들의 부분집합 관계로 판단.
 */
export function teamsMatch(a: string, b: string): boolean {
  const STOP = new Set([
    "fc", "afc", "cf", "club", "the", "and", "&",
    "city", "united", "town", "rovers", "wanderers", "hotspur",
    "athletic", "albion", "rangers",
  ]);
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t && !STOP.has(t));
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return false;
  // 길이 적은 쪽의 모든 토큰이 다른 쪽에 포함되면 매치
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return shorter.every((t) => longer.some((u) => u.startsWith(t) || t.startsWith(u)));
}

function client() {
  const k = process.env.API_FOOTBALL_KEY;
  if (!k) throw new Error("API_FOOTBALL_KEY 가 없습니다 (Pro 가입 필요).");
  return axios.create({
    baseURL: BASE_URL,
    timeout: 20000,
    headers: { "x-apisports-key": k },
  });
}

// ===== 부상자 =====

export interface InjuryEntry {
  playerId: number;
  playerName: string;
  reason: string; // 부상 종류
  type: string; // "Missing Fixture" 등
  teamId: number;
  teamName: string;
  /** 매치 시점 (있을 때만) */
  fixtureDate?: string;
  /** 선수 사진 (af player.photo) — 팀 페이지 부상자 명단 표시용 */
  photoUrl?: string;
}

export async function fetchSeasonInjuries(
  league: string,
  season: number,
): Promise<InjuryEntry[]> {
  const lid = API_FOOTBALL_LEAGUE_ID[league];
  if (!lid) return [];

  const key = `${league}:${season}`;
  const cached = injuriesCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const { data } = await client().get("/injuries", {
      params: { league: lid, season },
    });
    const arr: InjuryEntry[] = (data?.response ?? []).map((r: any) => ({
      playerId: r.player?.id,
      playerName: r.player?.name ?? "",
      reason: r.player?.reason ?? "",
      photoUrl: r.player?.photo as string | undefined,
      type: r.player?.type ?? "",
      teamId: r.team?.id,
      teamName: r.team?.name ?? "",
      fixtureDate: r.fixture?.date ?? undefined,
    }));
    injuriesCache.set(key, { fetchedAt: Date.now(), data: arr });
    return arr;
  } catch (e) {
    console.warn(
      "[api-football-pro] fetchSeasonInjuries 실패:",
      (e as Error).message,
    );
    return [];
  }
}

/** 특정 팀의 최근 부상자 (이름 + 부상 유형) */
export function getTeamInjuries(
  all: InjuryEntry[],
  teamName: string,
  beforeIso?: string,
  limit = 8,
): InjuryEntry[] {
  // 우리 DB의 팀 이름과 api-football 팀 이름이 살짝 다를 수 있어 부분일치
  const norm = (s: string) =>
    s.toLowerCase().replace(/\s+fc$/, "").replace(/\s+/g, "");
  const target = norm(teamName);

  const filtered = all.filter((i) => {
    const t = norm(i.teamName);
    if (!t.includes(target) && !target.includes(t)) return false;
    if (beforeIso && i.fixtureDate && i.fixtureDate > beforeIso) return false;
    return true;
  });

  // 가장 최근 부상자만 (중복 선수는 가장 최근 항목만 유지)
  const byPlayer = new Map<number, InjuryEntry>();
  filtered.sort((a, b) =>
    (b.fixtureDate ?? "").localeCompare(a.fixtureDate ?? ""),
  );
  for (const i of filtered) {
    if (!byPlayer.has(i.playerId)) byPlayer.set(i.playerId, i);
    if (byPlayer.size >= limit) break;
  }
  return Array.from(byPlayer.values());
}

// ===== 현재 스쿼드 필터 (이적/방출 선수 제거) =====
// 시즌 부상 목록(/injuries?season=Y)은 그 시즌 부상 이력이라 여름·1월에 팀을 떠난 선수도 남는다.
// /players/squads 의 현재 로스터 player.id 와 대조해 스쿼드에 없는 선수를 제거 (이름 표기차 무관, id 기반).
const squadCache = new Map<number, CacheEntry<Set<number>>>();
const SQUAD_TTL_MS = 24 * 60 * 60 * 1000; // 24시간 — 스쿼드는 이적창에만 바뀜

export async function fetchSquadPlayerIds(teamId: number): Promise<Set<number>> {
  const cached = squadCache.get(teamId);
  if (cached && Date.now() - cached.fetchedAt < SQUAD_TTL_MS) return cached.data;
  try {
    const { data } = await client().get("/players/squads", { params: { team: teamId } });
    const players = data?.response?.[0]?.players ?? [];
    const ids = new Set<number>(
      players.map((p: any) => p.id).filter((x: any): x is number => typeof x === "number"),
    );
    // 빈 응답은 캐시하지 않음 (일시적 실패로 전 선수 제거되는 사고 방지)
    if (ids.size > 0) squadCache.set(teamId, { fetchedAt: Date.now(), data: ids });
    return ids;
  } catch (e) {
    console.warn("[api-football-pro] fetchSquadPlayerIds 실패:", (e as Error).message);
    return new Set();
  }
}

// 시즌 부상 목록에서 각 팀의 현재 스쿼드에 없는(=이적/방출) 선수를 제거한다.
// 스쿼드 조회 실패/빈 팀은 필터하지 않음(안전 — 오탐으로 현역 선수를 지우지 않기 위해).
export async function filterInjuriesToCurrentSquad(
  all: InjuryEntry[],
): Promise<InjuryEntry[]> {
  if (all.length === 0) return all;
  const afTeamIds = [
    ...new Set(all.map((i) => i.teamId).filter((x): x is number => typeof x === "number")),
  ];
  const squadByTeam = new Map<number, Set<number>>();
  for (const tid of afTeamIds) {
    const ids = await fetchSquadPlayerIds(tid);
    if (ids.size > 0) squadByTeam.set(tid, ids);
  }
  return all.filter((i) => {
    const squad = squadByTeam.get(i.teamId);
    if (!squad) return true; // 스쿼드 미확보 → 유지
    return squad.has(i.playerId);
  });
}

// ===== 시즌 득점왕 =====

export interface TopScorerEntry {
  playerId: number;
  playerName: string;
  photoUrl?: string;
  teamId: number;
  teamName: string;
  goals: number;
  assists: number;
  appearances: number;
}

export async function fetchSeasonTopScorers(
  league: string,
  season: number,
): Promise<TopScorerEntry[]> {
  const lid = API_FOOTBALL_LEAGUE_ID[league];
  if (!lid) return [];

  const key = `${league}:${season}`;
  const cached = topScorersCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const { data } = await client().get("/players/topscorers", {
      params: { league: lid, season },
    });
    const arr: TopScorerEntry[] = (data?.response ?? []).map((r: any) => {
      const stat = r.statistics?.[0] ?? {};
      return {
        playerId: r.player?.id,
        playerName: r.player?.name ?? "",
        photoUrl: r.player?.photo,
        teamId: stat.team?.id,
        teamName: stat.team?.name ?? "",
        goals: stat.goals?.total ?? 0,
        assists: stat.goals?.assists ?? 0,
        appearances: stat.games?.appearences ?? 0,
      };
    });
    topScorersCache.set(key, { fetchedAt: Date.now(), data: arr });
    return arr;
  } catch (e) {
    console.warn(
      "[api-football-pro] fetchSeasonTopScorers 실패:",
      (e as Error).message,
    );
    return [];
  }
}

// ===== 선수 상세 페이지 (/players/[pid]?league=EPL 등) =====

export interface SoccerPlayerProfile {
  pid: number;
  name: string;
  firstName?: string;
  lastName?: string;
  age?: number;
  nationality?: string;
  height?: string;
  weight?: string;
  injured?: boolean;
  photoUrl?: string;
  birthDate?: string;
  birthPlace?: string;
  birthCountry?: string;
  position?: string;
  team?: string;
  teamLogoUrl?: string;
  /** 시즌별 stats — 리그/대회별 분리되어 들어있을 수 있음. 합산된 main league 항목만 표시 권장. */
  stats: SoccerPlayerSeasonStat[];
}

export interface SoccerPlayerSeasonStat {
  leagueName: string;
  leagueLogo?: string;
  teamName: string;
  position?: string;
  appearances?: number;
  lineups?: number;
  minutes?: number;
  rating?: string;
  goals?: number;
  assists?: number;
  shotsTotal?: number;
  shotsOn?: number;
  passesTotal?: number;
  passesKey?: number;
  passesAccuracy?: number;
  tacklesTotal?: number;
  tacklesBlocks?: number;
  tacklesInterceptions?: number;
  duelsTotal?: number;
  duelsWon?: number;
  dribblesAttempts?: number;
  dribblesSuccess?: number;
  foulsCommitted?: number;
  foulsDrawn?: number;
  yellowCards?: number;
  redCards?: number;
  penaltyScored?: number;
  penaltyMissed?: number;
}

export async function fetchSoccerPlayerProfile(
  playerId: number,
  season: number,
): Promise<SoccerPlayerProfile | null> {
  try {
    const { data } = await client().get("/players", {
      params: { id: playerId, season },
    });
    const r = data?.response?.[0];
    if (!r) return null;
    const p = r.player ?? {};
    const stats: SoccerPlayerSeasonStat[] = (r.statistics ?? []).map((s: Record<string, unknown>) => {
      const team = (s.team as Record<string, unknown>) ?? {};
      const league = (s.league as Record<string, unknown>) ?? {};
      const games = (s.games as Record<string, unknown>) ?? {};
      const goals = (s.goals as Record<string, unknown>) ?? {};
      const shots = (s.shots as Record<string, unknown>) ?? {};
      const passes = (s.passes as Record<string, unknown>) ?? {};
      const tackles = (s.tackles as Record<string, unknown>) ?? {};
      const duels = (s.duels as Record<string, unknown>) ?? {};
      const dribbles = (s.dribbles as Record<string, unknown>) ?? {};
      const fouls = (s.fouls as Record<string, unknown>) ?? {};
      const cards = (s.cards as Record<string, unknown>) ?? {};
      const penalty = (s.penalty as Record<string, unknown>) ?? {};
      return {
        leagueName: (league.name as string) ?? "",
        leagueLogo: (league.logo as string) ?? undefined,
        teamName: (team.name as string) ?? "",
        position: games.position as string | undefined,
        appearances: games.appearences as number | undefined,
        lineups: games.lineups as number | undefined,
        minutes: games.minutes as number | undefined,
        rating: games.rating as string | undefined,
        goals: goals.total as number | undefined,
        assists: goals.assists as number | undefined,
        shotsTotal: shots.total as number | undefined,
        shotsOn: shots.on as number | undefined,
        passesTotal: passes.total as number | undefined,
        passesKey: passes.key as number | undefined,
        passesAccuracy: passes.accuracy as number | undefined,
        tacklesTotal: tackles.total as number | undefined,
        tacklesBlocks: tackles.blocks as number | undefined,
        tacklesInterceptions: tackles.interceptions as number | undefined,
        duelsTotal: duels.total as number | undefined,
        duelsWon: duels.won as number | undefined,
        dribblesAttempts: dribbles.attempts as number | undefined,
        dribblesSuccess: dribbles.success as number | undefined,
        foulsCommitted: fouls.committed as number | undefined,
        foulsDrawn: fouls.drawn as number | undefined,
        yellowCards: cards.yellow as number | undefined,
        redCards: cards.red as number | undefined,
        penaltyScored: penalty.scored as number | undefined,
        penaltyMissed: penalty.missed as number | undefined,
      };
    });
    // 메인 league = 가장 많은 게임 출장 — 첫 번째로 정렬
    stats.sort((a, b) => (b.appearances ?? 0) - (a.appearances ?? 0));
    const main = stats[0];
    const birth = (p.birth ?? {}) as Record<string, unknown>;
    return {
      pid: p.id as number,
      name: (p.name as string) ?? "",
      firstName: p.firstname as string | undefined,
      lastName: p.lastname as string | undefined,
      age: p.age as number | undefined,
      nationality: p.nationality as string | undefined,
      height: p.height as string | undefined,
      weight: p.weight as string | undefined,
      injured: p.injured as boolean | undefined,
      photoUrl: p.photo as string | undefined,
      birthDate: birth.date as string | undefined,
      birthPlace: birth.place as string | undefined,
      birthCountry: birth.country as string | undefined,
      position: main?.position,
      team: main?.teamName,
      stats,
    };
  } catch (e) {
    console.warn(
      "[api-football-pro] fetchSoccerPlayerProfile 실패:",
      (e as Error).message,
    );
    return null;
  }
}

// ===== 시즌 리그 리더보드 (LeagueLeaderBoard 용) =====
// /players/topassists, /players/topyellowcards, /players/topredcards
// 응답 구조는 topscorers 와 동일 — statistics[0] 에 각 stat.

export interface PlayerLeaderEntry {
  playerId: number;
  playerName: string;
  photoUrl?: string;
  teamId: number;
  teamName: string;
  value: number; // goals · assists · yellow · red
  appearances: number;
}

async function fetchPlayersLeaderboard(
  endpoint: "/players/topscorers" | "/players/topassists" | "/players/topyellowcards" | "/players/topredcards",
  league: string,
  season: number,
  extract: (stat: Record<string, unknown>) => number,
): Promise<PlayerLeaderEntry[]> {
  const lid = API_FOOTBALL_LEAGUE_ID[league];
  if (!lid) return [];
  try {
    const { data } = await client().get(endpoint, {
      params: { league: lid, season },
    });
    return (data?.response ?? []).map((r: Record<string, unknown>) => {
      const player = (r.player ?? {}) as Record<string, unknown>;
      const stat = ((r.statistics as unknown[])?.[0] ?? {}) as Record<string, unknown>;
      const team = (stat.team ?? {}) as Record<string, unknown>;
      const games = (stat.games ?? {}) as Record<string, unknown>;
      return {
        playerId: player.id as number,
        playerName: (player.name as string) ?? "",
        photoUrl: player.photo as string | undefined,
        teamId: team.id as number,
        teamName: (team.name as string) ?? "",
        value: extract(stat) ?? 0,
        appearances: (games.appearences as number) ?? 0,
      };
    });
  } catch (e) {
    console.warn(`[api-football-pro] ${endpoint} 실패:`, (e as Error).message);
    return [];
  }
}

export async function fetchTopAssists(league: string, season: number) {
  return fetchPlayersLeaderboard(
    "/players/topassists",
    league,
    season,
    (s) => ((s.goals as Record<string, unknown>)?.assists as number) ?? 0,
  );
}

export async function fetchTopYellowCards(league: string, season: number) {
  return fetchPlayersLeaderboard(
    "/players/topyellowcards",
    league,
    season,
    (s) => ((s.cards as Record<string, unknown>)?.yellow as number) ?? 0,
  );
}

export async function fetchTopRedCards(league: string, season: number) {
  return fetchPlayersLeaderboard(
    "/players/topredcards",
    league,
    season,
    (s) => ((s.cards as Record<string, unknown>)?.red as number) ?? 0,
  );
}

/** 특정 팀의 시즌 득점 핵심 선수 Top N */
export function getTeamKeyPlayers(
  all: TopScorerEntry[],
  teamName: string,
  limit = 3,
): TopScorerEntry[] {
  const norm = (s: string) =>
    s.toLowerCase().replace(/\s+fc$/, "").replace(/\s+/g, "");
  const target = norm(teamName);
  return all
    .filter((p) => {
      const t = norm(p.teamName);
      return t.includes(target) || target.includes(t);
    })
    .slice(0, limit);
}

// ===== 매치별 데이터 (라인업, 이벤트) — RECAP 용 =====

export interface FixtureEvent {
  minute: number;
  type: "Goal" | "Card" | "subst" | "Var" | string;
  detail: string; // "Normal Goal" / "Yellow Card" / 등
  teamId: number;
  teamName: string;
  playerName: string;
  assistName?: string;
}

export interface FixtureLineup {
  teamId: number;
  teamName: string;
  formation?: string;
  startXI: string[]; // 선수 이름 11명
  coach?: string;
}

interface FixtureMatchInfo {
  fixtureId: number;
  date: string;
  homeTeamName: string;
  awayTeamName: string;
}

/** 우리 DB 매치를 api-football fixture ID 와 매칭 */
export async function findFixtureByDateAndTeams(
  league: string,
  date: Date,
  homeTeamName: string,
  awayTeamName: string,
): Promise<number | null> {
  const lid = API_FOOTBALL_LEAGUE_ID[league];
  if (!lid) return null;

  const season = getApiFootballSeason(date, league);
  const ymd = date.toISOString().slice(0, 10);

  try {
    const { data } = await client().get("/fixtures", {
      params: { league: lid, season, date: ymd },
    });
    const list: FixtureMatchInfo[] = (data?.response ?? []).map((r: any) => ({
      fixtureId: r.fixture.id,
      date: r.fixture.date,
      homeTeamName: r.teams.home.name,
      awayTeamName: r.teams.away.name,
    }));

    const found = list.find(
      (m) =>
        teamsMatch(m.homeTeamName, homeTeamName) &&
        teamsMatch(m.awayTeamName, awayTeamName),
    );
    return found?.fixtureId ?? null;
  } catch {
    return null;
  }
}

/** 단일 fixture 의 주심 이름 — /fixtures?id={id}.
 *  ESPN 6리그(라리가·분데스 등)처럼 collect raw 에 referee 가 없는 매치 보강용. */
export async function fetchFixtureReferee(
  fixtureId: number,
): Promise<string | null> {
  try {
    const { data } = await client().get("/fixtures", {
      params: { id: fixtureId },
    });
    const ref = data?.response?.[0]?.fixture?.referee;
    return typeof ref === "string" && ref.trim() ? ref.trim() : null;
  } catch {
    return null;
  }
}

export async function fetchFixtureLineups(
  fixtureId: number,
): Promise<FixtureLineup[]> {
  try {
    const { data } = await client().get("/fixtures/lineups", {
      params: { fixture: fixtureId },
    });
    return (data?.response ?? []).map((r: any) => ({
      teamId: r.team?.id,
      teamName: r.team?.name ?? "",
      formation: r.formation,
      startXI: (r.startXI ?? [])
        .map((p: any) => p.player?.name)
        .filter(Boolean),
      coach: r.coach?.name,
    }));
  } catch {
    return [];
  }
}

export async function fetchFixtureEvents(
  fixtureId: number,
): Promise<FixtureEvent[]> {
  try {
    const { data } = await client().get("/fixtures/events", {
      params: { fixture: fixtureId },
    });
    return (data?.response ?? []).map((r: any) => ({
      minute: r.time?.elapsed ?? 0,
      type: r.type ?? "",
      detail: r.detail ?? "",
      teamId: r.team?.id,
      teamName: r.team?.name ?? "",
      playerName: r.player?.name ?? "",
      assistName: r.assist?.name ?? undefined,
    }));
  } catch {
    return [];
  }
}

// ===== 매치 통계 (슛/패스/점유율) — RECAP 강화 =====

export interface FixtureStat {
  teamId: number;
  teamName: string;
  shotsOnGoal?: number;
  shotsTotal?: number;
  possessionPct?: number; // 0~100
  passesTotal?: number;
  passesAccuratePct?: number;
  fouls?: number;
  cornerKicks?: number;
  yellowCards?: number;
  redCards?: number;
  saves?: number;
  /** 기대득점 (af: 빅5·MLS·브라질레이랑 등 주요 리그만, 친선·아시아 미제공) */
  expectedGoals?: number;
}

const STAT_KEY: Record<string, keyof FixtureStat> = {
  "Shots on Goal": "shotsOnGoal",
  "Total Shots": "shotsTotal",
  "Ball Possession": "possessionPct",
  "Total passes": "passesTotal",
  "Passes accurate": "passesAccuratePct",
  Fouls: "fouls",
  "Corner Kicks": "cornerKicks",
  "Yellow Cards": "yellowCards",
  "Red Cards": "redCards",
  "Goalkeeper Saves": "saves",
  expected_goals: "expectedGoals", // af 가 snake_case type 으로 줌 ("1.15" string)
};

export async function fetchFixtureStatistics(
  fixtureId: number,
): Promise<FixtureStat[]> {
  try {
    const { data } = await client().get("/fixtures/statistics", {
      params: { fixture: fixtureId },
    });
    return (data?.response ?? []).map((r: any) => {
      const out: FixtureStat = {
        teamId: r.team?.id,
        teamName: r.team?.name ?? "",
      };
      for (const s of r.statistics ?? []) {
        const key = STAT_KEY[s.type as string];
        if (!key) continue;
        let v: number | undefined;
        if (typeof s.value === "number") v = s.value;
        else if (typeof s.value === "string") {
          const num = Number(s.value.replace("%", ""));
          v = Number.isFinite(num) ? num : undefined;
        }
        if (v != null) (out as any)[key] = v;
      }
      return out;
    });
  } catch {
    return [];
  }
}

// 리그-시즌 전체 fixture (id + 날짜 + 팀명) — 1콜로 한 시즌 받아서 우리 매치를 fixture id 에
// 매핑(날짜+팀명)하는 용도. TheSports 수집 메이저 리그(externalId≠fixture id) 코너 백필에 필요.
export interface AfSeasonFixture {
  id: number;
  dateMs: number;
  homeName: string;
  awayName: string;
}
export async function fetchSeasonFixtures(
  league: string,
  season: number,
): Promise<AfSeasonFixture[]> {
  const lid = API_FOOTBALL_LEAGUE_ID[league];
  if (!lid) return [];
  try {
    const { data } = await client().get("/fixtures", {
      params: { league: lid, season },
    });
    return (data?.response ?? [])
      .map((r: any) => ({
        id: r.fixture?.id as number,
        dateMs: new Date(r.fixture?.date).getTime(),
        homeName: (r.teams?.home?.name ?? "") as string,
        awayName: (r.teams?.away?.name ?? "") as string,
      }))
      .filter((f: AfSeasonFixture) => f.id && f.homeName && f.awayName && Number.isFinite(f.dateMs));
  } catch {
    return [];
  }
}

// ===== API-Football 자체 예측 (third opinion) =====

export interface ApiFootballPrediction {
  winner: "HOME" | "DRAW" | "AWAY" | null;
  winnerComment?: string;
  homePct: number; // 0~1
  drawPct: number;
  awayPct: number;
  underOver?: string; // "+2.5" / "-1.5" 등 raw
  goals?: { home: string; away: string }; // 기대 골수 raw
  advice?: string;
}

export async function fetchFixturePredictions(
  fixtureId: number,
): Promise<ApiFootballPrediction | null> {
  try {
    const { data } = await client().get("/predictions", {
      params: { fixture: fixtureId },
    });
    const r = (data?.response ?? [])[0];
    if (!r) return null;
    const winnerId = r.predictions?.winner?.id ?? null;
    const homeId = r.teams?.home?.id;
    const awayId = r.teams?.away?.id;
    let winner: "HOME" | "DRAW" | "AWAY" | null = null;
    if (winnerId === homeId) winner = "HOME";
    else if (winnerId === awayId) winner = "AWAY";
    else if (winnerId === null && r.predictions?.win_or_draw === false)
      winner = "DRAW";

    const pct = r.predictions?.percent ?? {};
    const homePct = parsePct(pct.home);
    const drawPct = parsePct(pct.draw);
    const awayPct = parsePct(pct.away);
    return {
      winner,
      winnerComment: r.predictions?.winner?.comment,
      homePct,
      drawPct,
      awayPct,
      underOver: r.predictions?.under_over ?? undefined,
      goals: r.predictions?.goals
        ? { home: r.predictions.goals.home, away: r.predictions.goals.away }
        : undefined,
      advice: r.predictions?.advice,
    };
  } catch {
    return null;
  }
}

function parsePct(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(String(s).replace("%", ""));
  return Number.isFinite(n) ? n / 100 : 0;
}

// ===== 향후 N일 fixture 목록 (라인업 fetch 사전 단계) =====

export interface UpcomingFixture {
  fixtureId: number;
  date: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamId: number;
  awayTeamId: number;
}

export async function fetchUpcomingFixtures(
  league: string,
  fromDate: Date,
  toDate: Date,
): Promise<UpcomingFixture[]> {
  const lid = API_FOOTBALL_LEAGUE_ID[league];
  if (!lid) return [];
  const season = getApiFootballSeason(fromDate, league);
  try {
    const { data } = await client().get("/fixtures", {
      params: {
        league: lid,
        season,
        from: fromDate.toISOString().slice(0, 10),
        to: toDate.toISOString().slice(0, 10),
      },
    });
    return (data?.response ?? []).map((r: any) => ({
      fixtureId: r.fixture.id,
      date: r.fixture.date,
      homeTeamName: r.teams.home.name,
      awayTeamName: r.teams.away.name,
      homeTeamId: r.teams.home.id,
      awayTeamId: r.teams.away.id,
    }));
  } catch {
    return [];
  }
}

/** 시즌 시작 연도 — api-football 형식 */
export function getApiFootballSeason(date: Date, league: string): number {
  const m = date.getMonth();
  // EPL/유럽은 8월~5월 시즌 — 자국 컵 대회 (FA Cup, Copa del Rey 등) 도 같은 시즌 표기
  if (
    [
      "EPL",
      "LALIGA",
      "BUNDESLIGA",
      "SERIE_A",
      "LIGUE_1",
      "UCL",
      // 유럽 자국 컵
      "FA_CUP",
      "EFL_CUP",
      "SCO_LEAGUE_CUP",
      "COPA_DEL_REY",
      "COPPA_ITALIA",
      "DFB_POKAL",
      "COUPE_DE_FRANCE",
    ].includes(league)
  ) {
    return m >= 7 ? date.getFullYear() : date.getFullYear() - 1;
  }
  // 월드컵은 4년마다 단일 토너먼트. 다음 대회 = 2026 (북중미)
  if (league === "WORLD_CUP") return 2026;
  // KFA Cup / 천황배 / CONCACAF / AFC Cup 은 달력 연도 시즌
  // MLS 단일 연도와 동일 처리 — default 로 fall-through
  return date.getFullYear();
}
