// 드래프트 공용 타입 — 선수-시즌 카드·풀 파일
import type { DraftMode } from "./modes";
export type { DraftMode } from "./modes";
/** 포지션 코드 — 모드 설정(modes.ts)의 slots 에 나오는 값 */
export type Pos = string;

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
  dur: number; // 0~1, 시즌 내 출전량 백분위
  /** 공개 뒤 보여줄 기록 한 줄 — "27.2점 · 5.7리바 · 6.7어시" */
  line: string;
  /** 이름값 — 기준선 모의 플레이어가 "잘해 보이는" 정도로 쓰는 값 (풀 안에서 표준화된 z) */
  fame: number;
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
    lockdown: number; // 철벽 보너스 기준 (수비 합)
    /** 공수 균형을 잴 때 공격 합·수비 합을 나누는 눈금 */
    norm: { off: number; def: number };
    quantiles: number[]; // 모의 1만 판 점수의 0~100 백분위 (길이 101)
  };
  teams: PoolTeam[];
  cards: PoolCard[];
}
