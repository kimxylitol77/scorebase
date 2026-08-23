// scores__soccer__leagueBadge (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import { enLeagueName } from "@/lib/i18n/en";

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
  EPL: { label: "Premier League", bg: "#3d1d5c", fg: "#ffffff" },
  LALIGA: { label: "LaLiga", bg: "#ee2a23", fg: "#ffffff" },
  BUNDESLIGA: { label: "Bundesliga", bg: "#d3010c", fg: "#ffffff" },
  SERIE_A: { label: "Serie A", bg: "#008fd7", fg: "#ffffff" },
  LIGUE_1: { label: "Ligue 1", bg: "#091c3e", fg: "#ffffff" },
  MLS: { label: "MLS", bg: "#003b5c", fg: "#ffffff" },
  UCL: { label: "UCL", bg: "#0a3978", fg: "#ffffff" },
  WORLD_CUP: { label: "World Cup 2026", bg: "#7e1d23", fg: "#ffffff" },
  // 신규 — 아시아 축구
  K_LEAGUE_1: { label: "K League 1", bg: "#0d4d9b", fg: "#ffffff" }, // 한국 국가대표 블루
  K_LEAGUE_2: { label: "K League 2", bg: "#5b8fbe", fg: "#ffffff" },
  J1_LEAGUE: { label: "J1 League", bg: "#e91e63", fg: "#ffffff" }, // 사쿠라 핑크
  J2_LEAGUE: { label: "J2 League", bg: "#f48fb1", fg: "#ffffff" },
  AFC_CL: { label: "AFC CL", bg: "#ff6600", fg: "#ffffff" },
  SAUDI_PL: { label: "Saudi PL", bg: "#006c35", fg: "#ffffff" }, // 사우디 국기색
  UEL: { label: "Europa League", bg: "#ff6900", fg: "#ffffff" },
  UECL: { label: "Conference League", bg: "#00b04f", fg: "#ffffff" },
  CHAMPIONSHIP: { label: "Championship", bg: "#6c3483", fg: "#ffffff" },
  LALIGA_2: { label: "LaLiga 2", bg: "#c54838", fg: "#ffffff" },
  BUNDESLIGA_2: { label: "Bundesliga 2", bg: "#9e1b1b", fg: "#ffffff" },
  SERIE_B: { label: "Serie B", bg: "#4a90e2", fg: "#ffffff" },
  LIGUE_2: { label: "Ligue 2", bg: "#2c3e7e", fg: "#ffffff" },
  CLUB_WORLD_CUP: { label: "Club World Cup", bg: "#d4af37", fg: "#1a1a1a" }, // 골드
  // 아시아 추가
  AFC_CL_TWO: { label: "AFC CL Two", bg: "#ffa040", fg: "#1a1a1a" },
  AFC_U23: { label: "AFC U23", bg: "#4f3aaa", fg: "#ffffff" },
  CSL: { label: "Chinese SL", bg: "#c8102e", fg: "#ffffff" },
  A_LEAGUE: { label: "A-League", bg: "#fbbf24", fg: "#1a1a1a" }, // 호주 골드
  // 유럽 추가
  EREDIVISIE: { label: "Eredivisie", bg: "#ff6900", fg: "#ffffff" }, // 네덜란드 오렌지
  PRIMEIRA_LIGA: { label: "Primeira Liga", bg: "#046a38", fg: "#ffffff" }, // 포르투갈 그린
  SUPER_LIG: { label: "Süper Lig", bg: "#e30a17", fg: "#ffffff" }, // 터키 레드
  JUPILER_PL: { label: "Jupiler Pro", bg: "#000000", fg: "#fbe600" }, // 벨기에 흑+황
  SPL: { label: "Scottish PL", bg: "#0a3978", fg: "#ffffff" }, // 스코틀랜드 블루
  GREEK_SL: { label: "Greek SL", bg: "#0d5eaf", fg: "#ffffff" },
  // 북중남미 추가
  BRASILEIRAO: { label: "Brasileirão A", bg: "#009c3b", fg: "#fedf00" }, // 브라질 녹황
  BRASILEIRAO_2: { label: "Brasileirão B", bg: "#009c3b", fg: "#fedf00" },
  LIGA_MX: { label: "Liga MX", bg: "#006847", fg: "#ffffff" }, // 멕시코 녹
  COPA_LIB: { label: "Libertadores", bg: "#193f7c", fg: "#ffffff" },
  COPA_SUD: { label: "Sudamericana", bg: "#f47b20", fg: "#ffffff" },
  // 컵 대회 (자국 리그 톤 변형)
  FA_CUP: { label: "FA Cup", bg: "#5b2d8f", fg: "#ffffff" },
  EFL_CUP: { label: "Carabao Cup", bg: "#8a4ec7", fg: "#ffffff" },
  COPA_DEL_REY: { label: "Copa del Rey", bg: "#a8121b", fg: "#ffd700" }, // 스페인 적금
  COPPA_ITALIA: { label: "Coppa Italia", bg: "#005ba6", fg: "#ffffff" },
  DFB_POKAL: { label: "DFB-Pokal", bg: "#a30007", fg: "#fdca0e" }, // 독일 적황
  COUPE_DE_FRANCE: { label: "Coupe de France", bg: "#1a2c5e", fg: "#ffffff" },
  KFA_CUP: { label: "KFA Cup", bg: "#0a3a78", fg: "#ffffff" },
  EMPEROR_CUP: { label: "Emperor's Cup", bg: "#bf0030", fg: "#ffffff" }, // 일장기 적
  CONCACAF_CCUP: { label: "CONCACAF", bg: "#2e7d32", fg: "#fbc02d" }, // 녹+금
  AFC_CUP: { label: "AFC Cup", bg: "#ffa040", fg: "#1a1a1a" },
};

export function getLeagueBadge(league: string): LeagueBadgeStyle {
  const explicit = LEAGUE_BADGES[league];
  if (explicit) return explicit;
  // 매핑 없는 리그: 리그 코드 hash → HSL 자동 생성.
  // 채도 65% · 명도 30% — 배지 배경이라 진한 톤.
  let hash = 0;
  for (let i = 0; i < league.length; i++) {
    hash = (hash * 31 + league.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return {
    label: enLeagueName(league),
    bg: `hsl(${hue}, 65%, 30%)`,
    fg: "#ffffff",
  };
}
