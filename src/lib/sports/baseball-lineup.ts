// 야구 경기 라인업 공용 타입 — KBO·MLB·NPB lib 이 이 모양으로 만들고 BaseballLineupCard 가 그린다.

export interface LineupPlayer {
  name: string;
  /** 타순 선수: "유격수" 등 / 후보: "포수"·"내야수" 등 / 불펜: "우완투수" 등 */
  position: string;
  /** 타자 "우타"·"좌타"·"양타", 선발투수 "우투"·"좌투"·"우언" */
  hand: string | null;
  order?: number;
  photo: string | null;
  href: string | null;
}
export interface TeamLineup {
  starter: LineupPlayer | null;
  batters: LineupPlayer[];
  bench: LineupPlayer[];
  bullpen: LineupPlayer[];
}
export interface GameLineup {
  /** false = 발표 전 예상 */
  confirmed: boolean;
  /** 카드 머리 옆 출처·기준 문구 (예: "발표 전 · 직전 경기(9/27) 선발 기준") */
  note: string;
  home: TeamLineup;
  away: TeamLineup;
}

/** "2026-09-27" → "9/27" */
export const shortDate = (ymd: string) => {
  const [, m, d] = ymd.split("-");
  return `${Number(m)}/${Number(d)}`;
};
