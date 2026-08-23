// 시즌 예측 리그 메타 (영어판). scripts/en-mirror 로 자동 생성.

export type Sport = "Football" | "Baseball" | "Basketball" | "Ice Hockey" | "Esports";

export interface LeagueCard {
  code: string;
  codes?: Array<{ code: string; label: string }>;
  name: string;
  subtitle: string;
  gradient: string;
  sport: Sport;
}

// 종목별 그룹화 — _view.tsx 가 SPORT_ORDER 순서로 섹션 분리.
export const SPORT_ORDER: Sport[] = ["Football", "Baseball", "Basketball", "Ice Hockey", "Esports"];

export const LEAGUES: LeagueCard[] = [
  // ── 축구 ──
  {
    code: "K_LEAGUE_1",
    codes: [
      { code: "K_LEAGUE_1", label: "K League 1" },
      { code: "K_LEAGUE_2", label: "K League 2" },
    ],
    name: "K League",
    subtitle: "Korean football, tiers 1–2",
    gradient: "from-red-600 via-blue-600 to-slate-900",
    sport: "Football",
  },
  {
    code: "J1_LEAGUE",
    codes: [
      { code: "J1_LEAGUE", label: "J1 League" },
      { code: "J2_LEAGUE", label: "J2 League" },
    ],
    name: "J League",
    subtitle: "Japanese football, tiers 1–2",
    gradient: "from-red-600 via-rose-500 to-pink-500",
    sport: "Football",
  },
  { code: "AFC_CL", name: "AFC Champions League Elite", subtitle: "Asia's top club competition", gradient: "from-emerald-600 via-teal-600 to-cyan-500", sport: "Football" },
  { code: "EPL", name: "Premier League", subtitle: "England", gradient: "from-purple-600 via-fuchsia-500 to-pink-500", sport: "Football" },
  { code: "LALIGA", name: "LaLiga", subtitle: "Spain", gradient: "from-red-600 via-amber-500 to-yellow-500", sport: "Football" },
  { code: "BUNDESLIGA", name: "Bundesliga", subtitle: "Germany", gradient: "from-yellow-500 via-red-600 to-black", sport: "Football" },
  { code: "SERIE_A", name: "Serie A", subtitle: "Italy", gradient: "from-green-600 via-white to-red-600", sport: "Football" },
  { code: "LIGUE_1", name: "Ligue 1", subtitle: "France", gradient: "from-blue-700 via-rose-600 to-indigo-600", sport: "Football" },
  { code: "UCL", name: "Champions League", subtitle: "Europe", gradient: "from-indigo-700 via-blue-600 to-cyan-500", sport: "Football" },
  { code: "UEL", name: "Europa League", subtitle: "Europe's second tier", gradient: "from-orange-600 via-amber-500 to-yellow-500", sport: "Football" },
  { code: "UECL", name: "Conference League", subtitle: "Europe's third tier", gradient: "from-emerald-600 via-green-500 to-lime-500", sport: "Football" },
  { code: "MLS", name: "MLS", subtitle: "North American football", gradient: "from-red-600 via-slate-900 to-blue-700", sport: "Football" },
  { code: "WORLD_CUP", name: "FIFA World Cup 2026", subtitle: "USA, Canada & Mexico", gradient: "from-amber-500 via-rose-500 to-fuchsia-600", sport: "Football" },
  // 2026-05-24 추가 11개 리그 (League Two/Scot/RPL/Algeria/Ghana/Svenska Cupen/Primera Nacional 등)
  // 는 카드 grid 에서 제외 — 국가별 리그 순위 섹션 (fetchCountryStandings) 에만 표시.

  // ── 야구 ──
  { code: "KBO", name: "KBO League", subtitle: "Korean baseball", gradient: "from-blue-600 via-indigo-600 to-rose-500", sport: "Baseball" },
  { code: "NPB", name: "NPB", subtitle: "Japanese baseball", gradient: "from-red-600 via-rose-500 to-pink-500", sport: "Baseball" },
  { code: "MLB", name: "MLB", subtitle: "Major League Baseball", gradient: "from-emerald-500 via-green-600 to-teal-700", sport: "Baseball" },

  // ── 농구 ──
  { code: "NBA", name: "NBA", subtitle: "US basketball", gradient: "from-orange-500 via-amber-500 to-yellow-500", sport: "Basketball" },
  { code: "WNBA", name: "WNBA", subtitle: "US women's basketball", gradient: "from-amber-400 via-orange-500 to-pink-500", sport: "Basketball" },

  // ── 아이스하키 ──
  { code: "NHL", name: "NHL", subtitle: "North American ice hockey", gradient: "from-cyan-500 via-blue-600 to-indigo-700", sport: "Ice Hockey" },

  // ── e스포츠 ──
  { code: "LOL", name: "LCK", subtitle: "League of Legends (Korea)", gradient: "from-rose-500 via-fuchsia-600 to-indigo-600", sport: "Esports" },
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
