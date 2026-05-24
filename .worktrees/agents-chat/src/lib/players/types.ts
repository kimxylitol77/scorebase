// 선수 매핑 시스템 공통 타입.

export type SportType = "soccer" | "basketball" | "baseball" | "hockey";

export type MappingSource =
  | "manual"   // 사람이 직접 입력
  | "wiki"    // 위키피디아 등 외부 ref
  | "gpt"     // OpenAI 번역
  | "gemini"  // Gemini 번역
  | "seed"    // 초기 시드 JSON
  | "crowd";  // 사용자 제보

/** players 테이블 row 와 1:1 대응 */
export interface Player {
  api_football_id: number;
  sport: SportType;
  name_en: string;
  short_name: string | null;
  team_id: number | null;
  team_name_en: string | null;
  league_id: number | null;
  position: string | null;
  nationality: string | null;
  date_of_birth: string | null;
  photo_url: string | null;
  name_ko: string | null;
  name_ko_alt: string[];
  source: MappingSource | null;
  source_confidence: number;
  created_at: string;
  updated_at: string;
}

/** UI / 프롬프트 에 노출할 표시명 */
export interface DisplayName {
  /** 우선 표시할 한글 (매핑 없으면 영문 fallback) */
  ko: string;
  /** 원본 영문 — 한글 옆 sub 표시용 */
  en: string;
  /** 매핑 출처 (null = fallback) */
  source: MappingSource | null;
  /** true 면 한글 매핑이 없어서 영문을 그대로 ko 에 넣은 상태 */
  isFallback: boolean;
}

// ===== 리그 → sport 매핑 =====
export const LEAGUE_SPORT_MAP: Record<string, SportType> = {
  // 축구
  EPL: "soccer",
  LALIGA: "soccer",
  BUNDESLIGA: "soccer",
  SERIE_A: "soccer",
  LIGUE_1: "soccer",
  MLS: "soccer",
  UCL: "soccer",
  WORLD_CUP: "soccer",
  // 농구
  NBA: "basketball",
  // 야구
  MLB: "baseball",
  KBO: "baseball",
  NPB: "baseball",
  // 하키
  NHL: "hockey",
};

export function getSportFromLeague(league: string): SportType {
  const sport = LEAGUE_SPORT_MAP[league.toUpperCase()];
  if (!sport) {
    throw new Error(
      `[players] unknown league: "${league}" — LEAGUE_SPORT_MAP 에 등록 필요`,
    );
  }
  return sport;
}
