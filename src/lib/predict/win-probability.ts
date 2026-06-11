// Elo 기반 승률 추정.
// 단순 휴리스틱이지만 직관적인 결과를 낸다.
//
// - 두 팀 Elo 차이 + 홈 어드밴티지(100점) 로 기댓값 계산
// - 무승부 확률은 두 팀 실력이 비슷할수록 커지는 형태로 보정
// - 야구·농구는 정규시간 무승부가 거의 없으므로 drawWeight 0 으로

import { LOL_LEAGUES, leagueHasDraw } from "@/lib/sports/sport-leagues";

const HOME_ADVANTAGE_ELO = 100;

// e스포츠는 한 스튜디오에서 진행되는 BO 시리즈라 홈/어웨이 어드밴티지 무의미.
// "LOL"(LCK) 만 하드코딩돼 LPL/LEC/LCS 가 홈 +100 Elo 받던 버그 → LOL_LEAGUES 단일 진실로.
//
// 2026 월드컵 — 북중미 3개국 공동개최라 대부분 중립 구장. 개최국 자국 경기만 실제 홈
// (eloratings.net 동일 관행). 팀명 미전달 호출부는 중립(0) 디폴트 — 한국·체코 같은
// 비개최국 "홈"팀이 +100 받아 시장 대비 과대평가되던 것 수정 (2026-06-11).
const WC_HOST_NATIONS = new Set(["usa", "unitedstates", "mexico", "canada"]);

function homeAdvantageFor(league: string, homeTeamName?: string): number {
  if (LOL_LEAGUES.has(league)) return 0;
  if (league === "WORLD_CUP") {
    if (!homeTeamName) return 0;
    const norm = homeTeamName.toLowerCase().replace(/[\s.&-]/g, "");
    return WC_HOST_NATIONS.has(norm) ? HOME_ADVANTAGE_ELO : 0;
  }
  return HOME_ADVANTAGE_ELO;
}

export interface WinProbConfig {
  /** 무승부 비중 (0=무승부 없음, 0.30=축구 일반) */
  drawWeight?: number;
  /** 두 팀 실력이 비슷할수록 무승부 확률을 얼마나 더할지 */
  drawSensitivity?: number;
}

export interface WinProb {
  home: number; // 0~1
  draw: number; // 0~1
  away: number; // 0~1
}

const SOCCER_DRAW = { drawWeight: 0.18, drawSensitivity: 0.18 };
const NO_DRAW = { drawWeight: 0, drawSensitivity: 0 };

const DEFAULT_CONFIG: Record<string, WinProbConfig> = {
  // 축구
  EPL: SOCCER_DRAW,
  LALIGA: SOCCER_DRAW,
  BUNDESLIGA: SOCCER_DRAW,
  SERIE_A: SOCCER_DRAW,
  LIGUE_1: SOCCER_DRAW,
  MLS: SOCCER_DRAW,
  UCL: SOCCER_DRAW,
  // 월드컵: 클럽 리그보다 무승부 빈도가 살짝 높음 (대형 토너먼트 통계 기반)
  WORLD_CUP: { drawWeight: 0.21, drawSensitivity: 0.18 },
  // 농구·야구·하키
  NBA: NO_DRAW,
  NHL: NO_DRAW,
  MLB: NO_DRAW,
  KBO: NO_DRAW,
  // NPB 는 12회 무승부 제도 있지만 시즌 약 2~3% — 모델 단순화 위해 NO_DRAW.
  NPB: NO_DRAW,
  // e스포츠 — LCK 는 BO 시리즈라 시리즈 무승부 없음
  LOL: NO_DRAW,
  // 이집트 — 실측 무승부 37.8% (2025-26, 323매치)·홈승 33.7% 로 무가 최빈 결과인 리그.
  EGYPT_PL: { drawWeight: 0.26, drawSensitivity: 0.18 },
};

export interface WinProbOpts {
  /** 홈팀 이름 — WORLD_CUP 중립 구장 판정용 (개최국 USA/Mexico/Canada 만 홈 +100) */
  homeTeamName?: string;
}

export function calcWinProbability(
  eloHome: number,
  eloAway: number,
  league: string,
  opts?: WinProbOpts,
): WinProb {
  // 미등록 리그 fallback — 축구(무승부 존재)만 EPL 프로파일, 그 외(e스포츠 LPL/LEC/LCS·
  // 야구·농구 신규 리그)는 NO_DRAW. 종전엔 일괄 EPL fallback 이라 무승부 0% 인 BO 시리즈에
  // predDraw ~30% 를 배정 (LPL Brier 0.805 의 주범).
  const cfg =
    DEFAULT_CONFIG[league] ??
    (leagueHasDraw(league) ? DEFAULT_CONFIG.EPL : NO_DRAW);

  const diff = eloAway - (eloHome + homeAdvantageFor(league, opts?.homeTeamName));
  // expHome = "홈이 이길 (또는 비겼을 때 절반의 무승부 점수를 가져갈) 기댓값"
  const expHome = 1 / (1 + Math.pow(10, diff / 400));

  // 두 팀이 비슷할수록 (expHome 이 0.5 에 가까울수록) 무승부 확률 증가
  const closeness = 1 - Math.abs(expHome - 0.5) * 2; // 0~1
  const drawProb =
    (cfg.drawWeight ?? 0) + closeness * (cfg.drawSensitivity ?? 0);

  const remaining = 1 - drawProb;
  const homeProb = expHome * remaining;
  const awayProb = (1 - expHome) * remaining;

  return {
    home: clamp01(homeProb),
    draw: clamp01(drawProb),
    away: clamp01(awayProb),
  };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/** 사람이 읽을 수 있는 한 줄 요약 ("Liverpool 우세 38%" 같은 형태) */
export function summarizeWinProb(
  prob: WinProb,
  homeName: string,
  awayName: string,
): string {
  const max = Math.max(prob.home, prob.draw, prob.away);
  const pct = (n: number) => Math.round(n * 100);
  if (max === prob.home) return `${homeName} 우세 ${pct(prob.home)}%`;
  if (max === prob.away) return `${awayName} 우세 ${pct(prob.away)}%`;
  return `무승부 가능성 우세 ${pct(prob.draw)}%`;
}
