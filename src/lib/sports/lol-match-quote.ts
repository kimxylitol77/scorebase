// Quote of the Match — 통계적으로 가장 놀라운 한 줄 자동 추출.
// 우선순위:
//  1. 한국 슈퍼스타 활약 (KDA 10+, deaths 0)
//  2. 비-스타 선수 KDA 10+ 게임
//  3. 시즌 누적 컨텍스트 (2-0 N번째, 1위 페이스)
//  4. 챔피언 활약 (이번 패치 N승)
//  5. 폼 변화 (N연승, 시즌 최장)
//  6. 폴백 (스코어 + 순위)

import type { MvpCandidate } from "./lol-mvp-selector";
import { getKoreanStarBy } from "./star-players";
import { championKoreanName } from "./leaguepedia";

export interface MatchQuoteContext {
  /** 양 팀 게임별 통합 선수 stats (MVP/LVP 후보 = 게임1 게임2 다 포함) */
  allPlayers: MvpCandidate[];
  /** 시리즈 승자 한국 팀명 */
  winnerNameKo: string;
  /** 시리즈 패자 한국 팀명 */
  loserNameKo: string;
  /** 시리즈 스코어 (예: "2-0", "2-1") */
  scoreStr: string;
  /** 시즌 누적 — 시리즈 승자 기준 */
  winnerSeason?: {
    wins: number;
    losses: number;
    rank: number;
    twoZeroCount: number; // 시즌 2-0 셧다운 횟수
    winStreak: number;
  };
}

export interface MatchQuote {
  emoji: string;
  body: string;
  source:
    | "star_player_perfect"
    | "star_player_kda"
    | "kda_high"
    | "season_two_zero"
    | "season_rank"
    | "form_streak"
    | "fallback";
}

export function pickMatchQuote(ctx: MatchQuoteContext): MatchQuote {
  const { allPlayers, winnerNameKo, loserNameKo, scoreStr, winnerSeason } = ctx;

  // 1) 한국 슈퍼스타 deaths 0 + KDA 10+
  const starPerfect = allPlayers
    .filter((p) => p.isWinningTeam && getKoreanStarBy(p.playerName))
    .filter((p) => p.deaths === 0 && p.kda >= 10)
    .sort((a, b) => b.kda - a.kda)[0];
  if (starPerfect) {
    const star = getKoreanStarBy(starPerfect.playerName)!;
    return {
      emoji: "👑",
      body: `${star.koreanName}, 데스 0 · KDA ${starPerfect.kda.toFixed(1)} — ${championKoreanName(starPerfect.champion)}으로 ${winnerNameKo} 승리 견인`,
      source: "star_player_perfect",
    };
  }

  // 2) 한국 슈퍼스타 KDA 10+
  const starKda = allPlayers
    .filter((p) => p.isWinningTeam && getKoreanStarBy(p.playerName))
    .filter((p) => p.kda >= 10)
    .sort((a, b) => b.kda - a.kda)[0];
  if (starKda) {
    const star = getKoreanStarBy(starKda.playerName)!;
    return {
      emoji: "🔥",
      body: `${star.koreanName}, KDA ${starKda.kda.toFixed(1)} — ${championKoreanName(starKda.champion)}으로 ${star.role} 라인 압도`,
      source: "star_player_kda",
    };
  }

  // 3) 비-스타 선수 KDA 10+
  const highKda = allPlayers
    .filter((p) => p.kda >= 10)
    .sort((a, b) => b.kda - a.kda)[0];
  if (highKda) {
    return {
      emoji: "⚡",
      body: `${highKda.playerName}, KDA ${highKda.kda.toFixed(1)} — ${championKoreanName(highKda.champion)}으로 캐리`,
      source: "kda_high",
    };
  }

  // 4) 시즌 2-0 셧다운 N번째
  if (winnerSeason && scoreStr === "2-0" && winnerSeason.twoZeroCount >= 2) {
    return {
      emoji: "🎯",
      body: `${winnerNameKo}, 시즌 ${winnerSeason.twoZeroCount}번째 2-0 셧다운 — ${loserNameKo}를 정리하며 ${winnerSeason.rank}위 페이스`,
      source: "season_two_zero",
    };
  }

  // 5) 연승 (3 이상)
  if (winnerSeason && winnerSeason.winStreak >= 3) {
    return {
      emoji: "📈",
      body: `${winnerNameKo}, ${winnerSeason.winStreak}연승 — ${scoreStr}으로 ${loserNameKo} 제압하며 상승세 지속`,
      source: "form_streak",
    };
  }

  // 6) 시즌 순위
  if (winnerSeason) {
    return {
      emoji: "📊",
      body: `${winnerNameKo}, ${winnerNameKo === loserNameKo ? "" : `${loserNameKo}을 `}${scoreStr}으로 꺾으며 시즌 ${winnerSeason.wins}승 ${winnerSeason.losses}패 ${winnerSeason.rank}위`,
      source: "season_rank",
    };
  }

  // 7) 폴백
  return {
    emoji: "🏆",
    body: `${winnerNameKo}, ${loserNameKo}을 ${scoreStr}으로 정리`,
    source: "fallback",
  };
}
