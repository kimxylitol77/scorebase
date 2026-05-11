// Leaguepedia (LoL Fandom Wiki) Cargo API 통합.
// rosters · 포지션 · 한국 본명 · 시즌 통계(KDA·CS) · 챔피언 풀.
//
// Cargo API 문서: https://lol.fandom.com/wiki/Special:CargoTables
// Wikimedia API rate limit: 익명 약 60 req/min — User-Agent 헤더 필수.
// 호출 사이 sleep + 캐시로 풋프린트 최소화.

import axios from "axios";

const BASE = "https://lol.fandom.com/api.php";
const USER_AGENT =
  "scorebase/1.0 (https://scorebase.kr; kimxylitol77@gmail.com)";

interface CargoRow<T> {
  title: T;
}
interface CargoResponse<T> {
  cargoquery?: Array<CargoRow<T>>;
  error?: { code?: string; info?: string };
}

async function cargoQuery<T>(params: Record<string, string>): Promise<T[]> {
  const merged = {
    action: "cargoquery",
    format: "json",
    ...params,
  };
  const { data } = await axios.get<CargoResponse<T>>(BASE, {
    params: merged,
    headers: { "User-Agent": USER_AGENT },
    timeout: 15000,
  });
  if (data.error) {
    throw new Error(`[leaguepedia] ${data.error.code}: ${data.error.info}`);
  }
  return (data.cargoquery ?? []).map((r) => r.title);
}

/* =====================================================================
 * 로스터 — 팀의 현재 5인 (Top/Jungle/Mid/Bot/Support)
 * ===================================================================*/

export interface LolPlayer {
  id: string; // Leaguepedia ID (예: "Faker")
  player: string;
  name: string; // 영문 본명 (예: "Lee Sang-hyeok")
  nameFull: string; // 한자/한글 포함 풀네임 (예: "Lee Sang-hyeok (이상혁)")
  /** 한국어 본명만 추출 (괄호 안), 없으면 undefined */
  nameKo?: string;
  country: string;
  role: "Top" | "Jungle" | "Mid" | "Bot" | "Support" | string;
  team: string;
}

interface LpPlayersRow {
  ID: string;
  Player: string;
  Name: string;
  NameFull: string;
  Country: string;
  Role: string;
  Team: string;
}

function extractKoreanName(nameFull: string | undefined): string | undefined {
  if (!nameFull) return undefined;
  // "Lee Sang-hyeok (이상혁)" → "이상혁"
  const m = nameFull.match(/\(([^)]+)\)/);
  if (!m) return undefined;
  const inner = m[1].trim();
  // 한글 포함 여부만 체크 (영문 본명 괄호 표기 제외)
  return /[가-힣]/.test(inner) ? inner : undefined;
}

/**
 * 팀의 활성 5인 로스터 조회.
 * Leaguepedia Team 필드는 영문 팀명 (예: "T1", "Gen.G", "KT Rolster").
 */
export async function fetchLckRoster(teamName: string): Promise<LolPlayer[]> {
  const where = `Team="${teamName.replace(/"/g, '\\"')}" AND Role IN ("Top","Jungle","Mid","Bot","Support")`;
  const rows = await cargoQuery<LpPlayersRow>({
    tables: "Players",
    fields: "ID,Player,Name,NameFull,Country,Role,Team",
    where,
    limit: "20", // 후보 코치/예비 포함 가능성 — 클라이언트에서 정리
  });

  // 각 포지션별 가장 마지막에 들어온 1명만 (단순 dedupe — Leaguepedia는 활성 선수만 노출하지만 가끔 예비 섞임)
  const byRole = new Map<string, LpPlayersRow>();
  for (const r of rows) {
    const key = r.Role;
    if (!byRole.has(key)) byRole.set(key, r);
  }

  return [...byRole.values()].map((r) => ({
    id: r.ID,
    player: r.Player || r.ID,
    name: r.Name,
    nameFull: r.NameFull,
    nameKo: extractKoreanName(r.NameFull),
    country: r.Country,
    role: r.Role,
    team: r.Team,
  }));
}

/* =====================================================================
 * 선수 시즌 통계 — ScoreboardPlayers 테이블 집계
 * ===================================================================*/

export interface PlayerSeasonStats {
  id: string;
  games: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  damageToChamps: number;
  /** 평균 KDA = (K+A)/D, D=0이면 (K+A) 그대로 (P-K Perfect 분리 표기). */
  kda: number;
  csPerMin?: number; // 게임 시간 모르면 undefined
  /** 가장 많이 사용한 챔피언 3종 (count desc) */
  topChampions: Array<{ champion: string; games: number }>;
}

interface LpScoreboardRow {
  Name: string;
  Champion: string;
  Kills: string;
  Deaths: string;
  Assists: string;
  CS: string;
  DamageToChampions?: string;
}

/**
 * 한 선수의 시즌 통계 (Leaguepedia ScoreboardPlayers 집계).
 * @param overviewPagePattern 예: "LCK%202026%20Spring/Spring%20Season" — like 매치
 */
export async function fetchPlayerSeasonStats(
  playerId: string,
  overviewPageLike: string,
): Promise<PlayerSeasonStats | null> {
  const where = `Name="${playerId.replace(/"/g, '\\"')}" AND OverviewPage LIKE "${overviewPageLike.replace(/"/g, '\\"')}"`;
  const rows = await cargoQuery<LpScoreboardRow>({
    tables: "ScoreboardPlayers",
    fields: "Name,Champion,Kills,Deaths,Assists,CS,DamageToChampions",
    where,
    limit: "100",
  });
  if (rows.length === 0) return null;

  let kills = 0,
    deaths = 0,
    assists = 0,
    cs = 0,
    damage = 0;
  const champCount = new Map<string, number>();
  for (const r of rows) {
    kills += Number(r.Kills) || 0;
    deaths += Number(r.Deaths) || 0;
    assists += Number(r.Assists) || 0;
    cs += Number(r.CS) || 0;
    damage += Number(r.DamageToChampions) || 0;
    if (r.Champion)
      champCount.set(r.Champion, (champCount.get(r.Champion) ?? 0) + 1);
  }
  const games = rows.length;
  const topChampions = [...champCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([champion, games]) => ({ champion, games }));

  return {
    id: playerId,
    games,
    kills,
    deaths,
    assists,
    cs,
    damageToChamps: damage,
    kda: deaths === 0 ? kills + assists : (kills + assists) / deaths,
    topChampions,
  };
}

/* =====================================================================
 * LCK 팀 메타 — Leaguepedia Teams 테이블
 * Name · Short · Image · Region 가져옴. League="LCK" 필터.
 * ===================================================================*/

export interface LckTeamMeta {
  name: string; // 영문 팀명 (예: "T1")
  short: string; // 축약 (예: "T1", "GEN", "HLE")
  image?: string; // Leaguepedia 파일명 (예: "T1logo_square.png")
  /** Leaguepedia Special:FilePath 로 변환된 직접 접근 URL */
  imageUrl?: string;
  region?: string; // 보통 "Korea"
  league: string; // "LCK"
}

interface LpTeamsRow {
  Name: string;
  Short?: string;
  Image?: string;
  Region?: string;
  League: string;
}

/** Leaguepedia 파일명 → 직접 접근 URL (Special:FilePath 자동 redirect) */
function leaguepediaImageUrl(filename: string): string {
  // 공백 → underscore (MediaWiki 컨벤션)
  const safe = filename.trim().replace(/\s+/g, "_");
  return `https://lol.fandom.com/wiki/Special:FilePath/${encodeURIComponent(safe)}`;
}

export async function fetchLckTeams(): Promise<LckTeamMeta[]> {
  const rows = await cargoQuery<LpTeamsRow>({
    tables: "Teams",
    fields: "Name,Short,Image,Region,League",
    where: 'League="LCK"',
    limit: "30",
  });
  return rows.map((r) => ({
    name: r.Name,
    short: r.Short ?? r.Name,
    image: r.Image,
    imageUrl: r.Image ? leaguepediaImageUrl(r.Image) : undefined,
    region: r.Region,
    league: r.League,
  }));
}

/* =====================================================================
 * 한국 팀명 매핑 — DB 한글 팀명 → Leaguepedia 영문 팀명
 * (lol.ts 의 LCK_TEAM_NAMES_KO 와 역방향)
 * ===================================================================*/

export const LCK_LP_TEAM_NAMES: Record<string, string> = {
  // DB 의 BDL externalId (Team.externalId) → Leaguepedia Team 명
  "1": "T1",
  "2": "Gen.G",
  "7": "Hanwha Life Esports",
  "8": "KT Rolster",
  "21": "Dplus KIA",
  "35": "BNK FearX",
  "62": "Nongshim RedForce",
  "66": "OKSavingsBank BRION", // Hanjin BRION 이전 이름 — Leaguepedia 표기 확인 필요
  "320": "DN Freecs", // DN SOOPers 가 새 이름. Leaguepedia 가 옛 이름 쓸 수도
  "321": "DRX",
};

export function lpTeamNameByExternalId(externalId: string): string | null {
  return LCK_LP_TEAM_NAMES[externalId] ?? null;
}

/* =====================================================================
 * 챔피언 한국 공식 표기 매핑 — 영문 → 한국 공식
 * 자주 등장하는 LCK 챔피언 중심. 없으면 영문 그대로.
 * ===================================================================*/

const CHAMPION_KO: Record<string, string> = {
  Aatrox: "아트록스",
  Ahri: "아리",
  Akali: "아칼리",
  Akshan: "아크샨",
  Azir: "아지르",
  Caitlyn: "케이틀린",
  Camille: "카밀",
  Corki: "코르키",
  Ezreal: "이즈리얼",
  Galio: "갈리오",
  Gnar: "나르",
  Gwen: "그웬",
  Hwei: "흐웨이",
  Jax: "잭스",
  Jayce: "제이스",
  Jinx: "징크스",
  KSante: "케이산테",
  Karma: "카르마",
  KaiSa: "카이사",
  "Kai'Sa": "카이사",
  Kalista: "칼리스타",
  Kennen: "케넨",
  Leblanc: "르블랑",
  LeeSin: "리신",
  "Lee Sin": "리신",
  Lulu: "룰루",
  Lucian: "루시안",
  Maokai: "마오카이",
  MissFortune: "미스 포츈",
  "Miss Fortune": "미스 포츈",
  Naafiri: "나피리",
  Nautilus: "노틸러스",
  Nidalee: "니달리",
  Olaf: "올라프",
  Ornn: "오른",
  Poppy: "뽀삐",
  Renekton: "레넥톤",
  Renata: "레나타 글라스크",
  Rell: "렐",
  Sejuani: "세주아니",
  Senna: "세나",
  Sett: "세트",
  Skarner: "스카너",
  Smolder: "스몰더",
  Sylas: "사일러스",
  TahmKench: "탐켄치",
  "Tahm Kench": "탐켄치",
  Taliyah: "탈리야",
  Thresh: "쓰레쉬",
  Tristana: "트리스타나",
  TwistedFate: "트위스티드 페이트",
  "Twisted Fate": "트위스티드 페이트",
  Varus: "바루스",
  Viktor: "빅토르",
  Volibear: "볼리베어",
  Xayah: "자야",
  Yone: "요네",
  Yorick: "요릭",
  Zac: "자크",
  Zeri: "제리",
  Ziggs: "직스",
  Zoe: "조이",
};

export function championKoreanName(en: string): string {
  return CHAMPION_KO[en] ?? en;
}
