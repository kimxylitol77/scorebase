// 역대 발롱도르 수상자 큐레이션 데이터 — /ballon 하단 "역대 수상자" 섹션용.
// 과거 시즌 LeagueLeader 는 DB 에 없어 수상 시즌 스탯을 정적으로 담고,
// 지수는 라이브 지수와 동일한 골×4·도움×3·리그계수 공식으로 계산해 방법론을 일치시킨다.
// 스탯 출처: api-football /players?id=&season= (수상 시즌 주요 대회).

// 라이브 지수와 동일 상수 (src/lib/ballon.ts GOAL_W·ASSIST_W 참고).
const GOAL_W = 4;
const ASSIST_W = 3;

export interface BallonWinnerComp {
  label: string; // 대회 약칭 (리그1·UCL 등)
  coef: number; // 리그 난이도 계수 (BALLON_LEAGUE_COEF 기준)
  goals: number;
  assists: number;
}

export interface BallonWinner {
  year: number; // 수상 연도
  season: string; // 수상 대상 시즌 라벨
  nameKo: string;
  nameEn: string;
  club: string; // 수상 시즌 소속 클럽
  nationFlag: string; // 국적 국기 이모지
  photoUrl: string;
  note?: string; // 한 줄 하이라이트 (트레블 등)
  comps: BallonWinnerComp[];
}

// 수상 시즌 주요 대회 골·도움 기준 지수 (라이브와 동일 산식).
export function winnerScore(w: BallonWinner): number {
  return w.comps.reduce((sum, c) => sum + (c.goals * GOAL_W + c.assists * ASSIST_W) * c.coef, 0);
}

// 최신 수상자부터 (2020 은 코로나로 미수여). 스탯은 api-football 수상 시즌 주요 대회.
export const BALLON_WINNERS: BallonWinner[] = [
  {
    year: 2025,
    season: "2024-25",
    nameKo: "우스만 뎀벨레",
    nameEn: "Ousmane Dembélé",
    club: "파리 생제르맹",
    nationFlag: "🇫🇷",
    photoUrl: "https://media.api-sports.io/football/players/153.png",
    note: "PSG 트레블(리그1·쿠프드프랑스·챔피언스리그)",
    comps: [
      { label: "리그1", coef: 1.0, goals: 21, assists: 7 },
      { label: "UCL", coef: 1.2, goals: 8, assists: 6 },
    ],
  },
  {
    year: 2024,
    season: "2023-24",
    nameKo: "로드리",
    nameEn: "Rodri",
    club: "맨체스터 시티",
    nationFlag: "🇪🇸",
    photoUrl: "https://media.api-sports.io/football/players/44.png",
    note: "맨시티 프리미어리그 4연패 핵심 · 수비형 미드필더",
    comps: [
      { label: "EPL", coef: 1.0, goals: 8, assists: 9 },
      { label: "UCL", coef: 1.2, goals: 1, assists: 2 },
    ],
  },
  {
    year: 2023,
    season: "2022-23",
    nameKo: "리오넬 메시",
    nameEn: "Lionel Messi",
    club: "파리 생제르맹",
    nationFlag: "🇦🇷",
    photoUrl: "https://media.api-sports.io/football/players/154.png",
    note: "카타르 월드컵 우승",
    comps: [
      { label: "리그1", coef: 1.0, goals: 16, assists: 16 },
      { label: "UCL", coef: 1.2, goals: 4, assists: 4 },
      { label: "월드컵", coef: 1.3, goals: 7, assists: 3 },
    ],
  },
  {
    year: 2022,
    season: "2021-22",
    nameKo: "카림 벤제마",
    nameEn: "Karim Benzema",
    club: "레알 마드리드",
    nationFlag: "🇫🇷",
    photoUrl: "https://media.api-sports.io/football/players/759.png",
    note: "레알 챔피언스리그 우승 · 결승 토너 폭발",
    comps: [
      { label: "라리가", coef: 1.0, goals: 27, assists: 12 },
      { label: "UCL", coef: 1.2, goals: 15, assists: 2 },
    ],
  },
  {
    year: 2021,
    season: "2020-21",
    nameKo: "리오넬 메시",
    nameEn: "Lionel Messi",
    club: "바르셀로나",
    nationFlag: "🇦🇷",
    photoUrl: "https://media.api-sports.io/football/players/154.png",
    note: "코파 아메리카 우승 · 바르사 마지막 시즌",
    comps: [
      { label: "라리가", coef: 1.0, goals: 30, assists: 9 },
      { label: "UCL", coef: 1.2, goals: 5, assists: 2 },
    ],
  },
];
