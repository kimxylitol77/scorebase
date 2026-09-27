// 농구 블라인드 드래프트 공용 타입 — 선수-시즌 카드·풀 파일·게임 상태
export type DraftMode = "nba" | "kbl";
export type Pos = "G" | "F" | "C";

/** 선수-시즌 카드 한 장 (data/draft-pool-*.json) */
export interface PoolCard {
  id: string; // `${playerId}-${season}`
  pid: string;
  name: string; // 표시 이름 (한글 우선)
  season: number; // 시즌 종료 연도 (2025-26 → 2026)
  team: string; // 구단 계보 키
  teamName: string; // 그 시즌의 팀 이름
  pos: Pos[];
  off: number;
  def: number;
  dur: number; // 0~1, 시즌 내 총 출전 시간 백분위
  gp: number;
  mpg: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  photo: string | null;
}

export interface PoolTeam {
  key: string;
  name: string; // 현재 구단 이름
  logo: string | null;
  color: string;
}

export interface PoolFile {
  meta: {
    mode: DraftMode;
    updatedAt: string;
    seasons: [number, number];
    cards: number;
    lockdown: number; // 철벽 수비 보너스 기준 (수비 합)
    quantiles: number[]; // 모의 1만 판 점수의 0~100 백분위 (길이 101)
  };
  teams: PoolTeam[];
  cards: PoolCard[];
}
