// 드래프트 모드(리그) 설정 — 종목별 슬롯·표기·시즌 길이. 클라이언트·서버·OG·빌드 스크립트 공용, 수치 없음.
export type Sport = "basketball" | "baseball" | "soccer";
export type DraftMode = "nba" | "kbl" | "kbo" | "mlb" | "epl" | "kleague";

export interface ModeConfig {
  mode: DraftMode;
  sport: Sport;
  label: string;
  /** 라인업 자리 — 포지션 코드. 길이 = 뽑는 인원 = 판 수 */
  slots: string[];
  posLabel: Record<string, string>;
  /** 공격·수비 축 이름 (야구는 타격·투구) */
  offLabel: string;
  defLabel: string;
  lockdownLabel: string;
  /** 정규시즌 경기 수와 무승부 유무 — 시즌 시뮬용 */
  games: number;
  draws: boolean;
  /** 시즌이 한 해 안에 끝나는 리그 (표기 "2015") — 아니면 "14-15" */
  calendarYear: boolean;
  spyCharges: number;
}

const BASKETBALL = {
  sport: "basketball" as const,
  slots: ["G", "G", "F", "F", "C"],
  posLabel: { G: "가드", F: "포워드", C: "센터" },
  offLabel: "공격",
  defLabel: "수비",
  lockdownLabel: "철벽 수비",
  draws: false,
  calendarYear: false,
  spyCharges: 3,
};
const BASEBALL = {
  sport: "baseball" as const,
  slots: ["SP", "SP", "RP", "C", "IF", "IF", "IF", "OF", "OF"],
  posLabel: { SP: "선발", RP: "불펜", C: "포수", IF: "내야수", OF: "외야수" },
  offLabel: "타격",
  defLabel: "투구",
  lockdownLabel: "철벽 마운드",
  draws: false,
  calendarYear: true,
  spyCharges: 5,
};
const SOCCER = {
  sport: "soccer" as const,
  slots: ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW"],
  posLabel: { GK: "골키퍼", DF: "수비수", MF: "미드필더", FW: "공격수" },
  offLabel: "공격",
  defLabel: "수비",
  lockdownLabel: "철벽 수비",
  draws: true,
  spyCharges: 5,
};

export const MODES: Record<DraftMode, ModeConfig> = {
  nba: { mode: "nba", label: "NBA", games: 82, ...BASKETBALL },
  kbl: { mode: "kbl", label: "KBL", games: 54, ...BASKETBALL },
  kbo: { mode: "kbo", label: "KBO", games: 144, ...BASEBALL },
  mlb: { mode: "mlb", label: "MLB", games: 162, ...BASEBALL },
  epl: { mode: "epl", label: "EPL", games: 38, calendarYear: false, ...SOCCER },
  kleague: { mode: "kleague", label: "K리그", games: 38, calendarYear: true, ...SOCCER },
};

export const SPORT_MODES: Record<Sport, DraftMode[]> = {
  basketball: ["nba", "kbl"],
  baseball: ["kbo", "mlb"],
  soccer: ["epl", "kleague"],
};
export const SPORT_LABEL: Record<Sport, string> = { basketball: "농구", baseball: "야구", soccer: "축구" };
export const SPORT_PATH: Record<Sport, string> = { basketball: "/basketball/draft", baseball: "/baseball/draft", soccer: "/soccer/draft" };

export function isDraftMode(v: unknown): v is DraftMode {
  return typeof v === "string" && v in MODES;
}

/** 그 모드의 게임 주소 — 종목의 첫 모드는 쿼리 없이 */
export function playPath(mode: DraftMode): string {
  const { sport } = MODES[mode];
  return SPORT_MODES[sport][0] === mode ? SPORT_PATH[sport] : `${SPORT_PATH[sport]}?mode=${mode}`;
}

export const resultPath = (id: string) => `/draft/result/${id}`;
