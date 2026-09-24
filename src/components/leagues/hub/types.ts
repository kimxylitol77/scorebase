// 빅매치 허브 공용 화면 타입 — 대회별 허브(네이션스리그·AFCON …)가 이 모양으로 데이터를 넘긴다.

export interface HubTeam {
  name: string;
  /** 국기 이모지 — 작은 행 전용. 없으면 빈 문자열(북아일랜드처럼 공식 이모지 없는 팀) */
  flag: string;
  /** 큰 자리(스포트라이트)용 엠블럼 — 윈도우는 국기 이모지를 글자로 그린다 */
  logoUrl: string | null;
  /** 국가대표면 FIFA 순위 */
  rank: number | null;
}

export interface HubMatch {
  id: number;
  href: string;
  matchday: number;
  /** "3조"·"D조" — 조를 모르면 null */
  groupLabel: string | null;
  status: string;
  startTime: Date;
  rankSum: number | null;
  /** 두 팀 중 약한 쪽 순위 — 빅매치 1순위 기준 */
  rankWorst: number | null;
  homeScore: number | null;
  awayScore: number | null;
  home: HubTeam;
  away: HubTeam;
}

/** 확정 구역 — 순위만으로 확정되는 것만. 하위권처럼 조 간 비교가 필요한 건 넣지 않는다. */
export type HubZone = "qf" | "sf" | "promo" | "qualify" | "host";

export interface HubRowView {
  teamId: number;
  position: number;
  name: string;
  flag: string;
  played: number;
  goalDiff: number;
  points: number;
  zone: HubZone | null;
  /** 이름 옆 작은 표식 — "개최국" 등 */
  badge?: string;
}

export interface HubGroupView {
  key: string;
  /** 카드 머리 작은 글씨 — "리그 A" */
  eyebrow: string;
  /** 카드 머리 큰 글씨 — "1조" */
  title: string;
  /** 조에서 한 경기라도 치렀나 */
  played: boolean;
  rows: HubRowView[];
  next: { href: string; home: string; away: string; when: string; live: boolean } | null;
}

export interface HubSegmentView {
  key: string;
  /** 토글 버튼 글씨 — "리그 A"·"A~D조" */
  label: string;
  /** 버튼 옆 작은 숫자(팀 수) */
  count: number;
  /** 확정 규칙 한 줄 — 초록 막대 옆에 뜬다 */
  rule: string;
  groups: HubGroupView[];
}
