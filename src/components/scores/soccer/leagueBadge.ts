// /scores 축구 row 레이아웃 — 리그별 컬러 배지 매핑.
// named.com 스타일: 좌측 110px 컬러 박스 + 리그명 (흰색 텍스트, 작고 굵게)

export interface LeagueBadgeStyle {
  /** 줄여 쓰는 라벨 (110px 한 줄에 들어가도록) */
  label: string;
  /** 배지 배경색 (Tailwind 외 inline hex) */
  bg: string;
  /** 글자색 (보통 흰색) */
  fg: string;
}

const LEAGUE_BADGES: Record<string, LeagueBadgeStyle> = {
  // 축구 — 메이저 8개
  EPL: { label: "프리미어리그", bg: "#3d1d5c", fg: "#ffffff" },
  LALIGA: { label: "라리가", bg: "#ee2a23", fg: "#ffffff" },
  BUNDESLIGA: { label: "분데스리가", bg: "#d3010c", fg: "#ffffff" },
  SERIE_A: { label: "세리에 A", bg: "#008fd7", fg: "#ffffff" },
  LIGUE_1: { label: "리그 1", bg: "#091c3e", fg: "#ffffff" },
  MLS: { label: "MLS", bg: "#003b5c", fg: "#ffffff" },
  UCL: { label: "챔피언스리그", bg: "#0a3978", fg: "#ffffff" },
  WORLD_CUP: { label: "월드컵 2026", bg: "#7e1d23", fg: "#ffffff" },
  // 신규 — 아시아 축구
  K_LEAGUE_1: { label: "K리그 1", bg: "#0d4d9b", fg: "#ffffff" }, // 한국 국가대표 블루
  K_LEAGUE_2: { label: "K리그 2", bg: "#5b8fbe", fg: "#ffffff" },
  J1_LEAGUE: { label: "J1 리그", bg: "#e91e63", fg: "#ffffff" }, // 사쿠라 핑크
  J2_LEAGUE: { label: "J2 리그", bg: "#f48fb1", fg: "#ffffff" },
  AFC_CL: { label: "AFC 챔스", bg: "#ff6600", fg: "#ffffff" },
  SAUDI_PL: { label: "사우디 PL", bg: "#006c35", fg: "#ffffff" }, // 사우디 국기색
  UEL: { label: "유로파", bg: "#ff6900", fg: "#ffffff" },
  UECL: { label: "컨퍼런스", bg: "#00b04f", fg: "#ffffff" },
  CHAMPIONSHIP: { label: "챔피언십", bg: "#6c3483", fg: "#ffffff" },
  LALIGA_2: { label: "라리가 2", bg: "#c54838", fg: "#ffffff" },
  BUNDESLIGA_2: { label: "분데스 2", bg: "#9e1b1b", fg: "#ffffff" },
  SERIE_B: { label: "세리에 B", bg: "#4a90e2", fg: "#ffffff" },
  LIGUE_2: { label: "리그 2", bg: "#2c3e7e", fg: "#ffffff" },
  CLUB_WORLD_CUP: { label: "클럽 월드컵", bg: "#d4af37", fg: "#1a1a1a" }, // 골드
  // 아시아 추가
  AFC_CL_TWO: { label: "AFC 챔스 2", bg: "#ffa040", fg: "#1a1a1a" },
  AFC_U23: { label: "AFC U23", bg: "#4f3aaa", fg: "#ffffff" },
  CSL: { label: "중국 슈퍼", bg: "#c8102e", fg: "#ffffff" },
  A_LEAGUE: { label: "A-리그", bg: "#fbbf24", fg: "#1a1a1a" }, // 호주 골드
  // 유럽 추가
  EREDIVISIE: { label: "에레디비시", bg: "#ff6900", fg: "#ffffff" }, // 네덜란드 오렌지
  PRIMEIRA_LIGA: { label: "프리메이라", bg: "#046a38", fg: "#ffffff" }, // 포르투갈 그린
  SUPER_LIG: { label: "쉬페르 리그", bg: "#e30a17", fg: "#ffffff" }, // 터키 레드
  JUPILER_PL: { label: "주피러", bg: "#000000", fg: "#fbe600" }, // 벨기에 흑+황
  SPL: { label: "스코틀랜드", bg: "#0a3978", fg: "#ffffff" }, // 스코틀랜드 블루
  GREEK_SL: { label: "그리스 SL", bg: "#0d5eaf", fg: "#ffffff" },
  // 북중남미 추가
  BRASILEIRAO: { label: "브라질 세A", bg: "#009c3b", fg: "#fedf00" }, // 브라질 녹황
  LIGA_MX: { label: "리가 MX", bg: "#006847", fg: "#ffffff" }, // 멕시코 녹
  COPA_LIB: { label: "리베르타도레스", bg: "#193f7c", fg: "#ffffff" },
  COPA_SUD: { label: "수다메리카나", bg: "#f47b20", fg: "#ffffff" },
};

const DEFAULT_BADGE: LeagueBadgeStyle = {
  label: "기타",
  bg: "#475569",
  fg: "#ffffff",
};

export function getLeagueBadge(league: string): LeagueBadgeStyle {
  return LEAGUE_BADGES[league] ?? { ...DEFAULT_BADGE, label: league };
}
