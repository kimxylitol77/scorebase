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
  K_LEAGUE_2: { label: "K리그 2", bg: "#5b8fbe", fg: "#ffffff" }, // K1 보다 연한 블루
  J1_LEAGUE: { label: "J1 리그", bg: "#e91e63", fg: "#ffffff" }, // 사쿠라 핑크
  AFC_CL: { label: "AFC 챔스", bg: "#ff6600", fg: "#ffffff" },
};

const DEFAULT_BADGE: LeagueBadgeStyle = {
  label: "기타",
  bg: "#475569",
  fg: "#ffffff",
};

export function getLeagueBadge(league: string): LeagueBadgeStyle {
  return LEAGUE_BADGES[league] ?? { ...DEFAULT_BADGE, label: league };
}
