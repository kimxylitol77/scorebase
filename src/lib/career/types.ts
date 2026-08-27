// 커리어 시뮬레이터 공용 타입 — 클라이언트에서 그대로 쓰므로 서버 전용 의존을 두지 않는다
export type Position = "GK" | "DF" | "MF" | "FW";

/** data/career-clubs.json 한 줄. 용량을 줄이려고 키를 한 글자로 쓴다. */
export interface Club {
  n: string; // 구단명
  l: string; // 리그 코드
  c: string; // 국가 코드
  t: number; // 티어 1(최상위)~6
  g: string; // 로고 URL
}

/** 2년치 기록 한 줄 (연표에 쌓인다) */
export interface Spell {
  age: number;
  club: Club;
  ovr: number;
  apps: number;
  goals: number;
  assists: number;
  /** 이 구간에 우승한 대회 수 */
  titles: number;
  /** 부상 등으로 출전이 꺾였으면 사유 */
  note?: string;
}

export interface CareerState {
  nation: string;
  position: Position;
  age: number;
  ovr: number;
  /** 최대 도달 가능 능력치 — 성장 속도를 정한다 */
  potential: number;
  /** 몸값 (€M) */
  value: number;
  club: Club | null;
  history: Spell[];
  /** 대표팀 누적 */
  caps: number;
  capGoals: number;
  retired: boolean;
}

/** 갈림길. 구단 선택이거나 확률형 이벤트다. */
export type Decision =
  | { kind: "club"; title: string; desc: string; options: ClubOption[]; youth?: boolean }
  | { kind: "event"; title: string; desc: string; options: EventOption[] };

export interface ClubOption {
  club: Club;
  /** 잔류 제안이면 true */
  stay: boolean;
  /** 은퇴 선택지면 true */
  retire?: boolean;
}

export interface EventOption {
  id: string;
  label: string;
  desc: string;
  /** 화면에 그대로 보여줄 확률 문구 [좋은 결과 %, 나쁜 결과 %] */
  odds: { good: string; goodPct: number; bad: string; badPct: number } | null;
}
