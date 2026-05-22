// /predictions 인덱스용 공유 데이터/타입 — server (page.tsx) + client (_view.tsx) 양쪽에서 import.
// "use client" 파일에서 직접 export 하면 server 쪽에서 client reference 로 잡혀 iterable 이 깨진다.

export type Sport = "축구" | "야구" | "농구" | "아이스하키" | "e스포츠";

export interface LeagueCard {
  code: string;
  codes?: Array<{ code: string; label: string }>;
  name: string;
  subtitle: string;
  gradient: string;
  sport: Sport;
}

// 종목별 그룹화 — _view.tsx 가 SPORT_ORDER 순서로 섹션 분리.
export const SPORT_ORDER: Sport[] = ["축구", "야구", "농구", "아이스하키", "e스포츠"];

export const LEAGUES: LeagueCard[] = [
  // ── 축구 ──
  {
    code: "K_LEAGUE_1",
    codes: [
      { code: "K_LEAGUE_1", label: "K리그1" },
      { code: "K_LEAGUE_2", label: "K리그2" },
    ],
    name: "K리그",
    subtitle: "한국 프로축구 1·2부",
    gradient: "from-red-600 via-blue-600 to-slate-900",
    sport: "축구",
  },
  {
    code: "J1_LEAGUE",
    codes: [
      { code: "J1_LEAGUE", label: "J1리그" },
      { code: "J2_LEAGUE", label: "J2리그" },
    ],
    name: "J리그",
    subtitle: "일본 프로축구 1·2부",
    gradient: "from-red-600 via-rose-500 to-pink-500",
    sport: "축구",
  },
  { code: "AFC_CL", name: "AFC 챔스 엘리트", subtitle: "아시아 최상위 클럽", gradient: "from-emerald-600 via-teal-600 to-cyan-500", sport: "축구" },
  { code: "EPL", name: "프리미어리그", subtitle: "EPL · 잉글랜드", gradient: "from-purple-600 via-fuchsia-500 to-pink-500", sport: "축구" },
  { code: "LALIGA", name: "라리가", subtitle: "스페인", gradient: "from-red-600 via-amber-500 to-yellow-500", sport: "축구" },
  { code: "BUNDESLIGA", name: "분데스리가", subtitle: "독일", gradient: "from-yellow-500 via-red-600 to-black", sport: "축구" },
  { code: "SERIE_A", name: "세리에 A", subtitle: "이탈리아", gradient: "from-green-600 via-white to-red-600", sport: "축구" },
  { code: "LIGUE_1", name: "리그 1", subtitle: "프랑스", gradient: "from-blue-700 via-rose-600 to-indigo-600", sport: "축구" },
  { code: "UCL", name: "챔피언스리그", subtitle: "유럽", gradient: "from-indigo-700 via-blue-600 to-cyan-500", sport: "축구" },
  { code: "UEL", name: "유로파리그", subtitle: "유럽 2부 클럽", gradient: "from-orange-600 via-amber-500 to-yellow-500", sport: "축구" },
  { code: "UECL", name: "유로파 컨퍼런스", subtitle: "유럽 3부 클럽", gradient: "from-emerald-600 via-green-500 to-lime-500", sport: "축구" },
  { code: "MLS", name: "MLS", subtitle: "북미 축구", gradient: "from-red-600 via-slate-900 to-blue-700", sport: "축구" },
  { code: "WORLD_CUP", name: "FIFA 월드컵 2026", subtitle: "미국·캐나다·멕시코", gradient: "from-amber-500 via-rose-500 to-fuchsia-600", sport: "축구" },

  // ── 야구 ──
  { code: "KBO", name: "KBO 리그", subtitle: "한국 프로야구", gradient: "from-blue-600 via-indigo-600 to-rose-500", sport: "야구" },
  { code: "NPB", name: "NPB 리그", subtitle: "일본 프로야구", gradient: "from-red-600 via-rose-500 to-pink-500", sport: "야구" },
  { code: "MLB", name: "MLB", subtitle: "메이저리그", gradient: "from-emerald-500 via-green-600 to-teal-700", sport: "야구" },

  // ── 농구 ──
  { code: "NBA", name: "NBA", subtitle: "미국 농구", gradient: "from-orange-500 via-amber-500 to-yellow-500", sport: "농구" },
  { code: "WNBA", name: "WNBA", subtitle: "미국 여자 농구", gradient: "from-amber-400 via-orange-500 to-pink-500", sport: "농구" },

  // ── 아이스하키 ──
  { code: "NHL", name: "NHL", subtitle: "북미 아이스하키", gradient: "from-cyan-500 via-blue-600 to-indigo-700", sport: "아이스하키" },

  // ── e스포츠 ──
  { code: "LOL", name: "LCK", subtitle: "리그 오브 레전드 한국", gradient: "from-rose-500 via-fuchsia-600 to-indigo-600", sport: "e스포츠" },
];

export interface TopThreeEntry {
  position: number;
  teamId: number;
  name: string;
  points: number;
}

export interface CountryStandingsRow {
  league: string;
  leagueDisplay: string;
  top3: TopThreeEntry[];
}

export interface CountryStandingsGroup {
  country: string;
  leagues: CountryStandingsRow[];
}
