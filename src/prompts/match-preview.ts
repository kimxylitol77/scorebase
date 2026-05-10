// 예정된 경기에 대한 프리뷰(Preview) 글 프롬프트.

import type { NormalizedMatch } from "@/lib/sports/types";

export interface PreviewContext {
  /** Elo 레이팅 (양 팀) */
  elo?: { home: number; away: number };
  /** 통계 추정 승률 (%) */
  winProb?: { home: number; draw: number; away: number };
  /** 시즌 순위 */
  position?: { home: number; away: number; total: number };
  /** 시즌 승점 */
  points?: { home: number; away: number };
  /** 공격/수비 랭킹 (1-based) */
  attackDefense?: {
    home: { attack?: number; defense?: number };
    away: { attack?: number; defense?: number };
  };
  /** 홈/원정 split (홈팀의 홈 성적 / 원정팀의 원정 성적) */
  homeAway?: {
    home: { wins: number; draws: number; losses: number; ppg: number };
    away: { wins: number; draws: number; losses: number; ppg: number };
  };
  /** 최근 5경기 폼 (W/D/L 시퀀스) */
  recentForm?: { home: string[]; away: string[] };
  /** 흐름 (streak) */
  streak?: {
    home: { unbeaten: number; winning: number; losing: number };
    away: { unbeaten: number; winning: number; losing: number };
  };
  /** 최근 평균 득실점 */
  trend?: {
    home: { gf: number; ga: number; ppg: number };
    away: { gf: number; ga: number; ppg: number };
  };
  /** 상대 전적 */
  h2h?: { homeWins: number; draws: number; awayWins: number; total: number };
  /** 부상자 명단 (api-football Pro 보강) */
  injuries?: {
    home: Array<{ name: string; reason?: string }>;
    away: Array<{ name: string; reason?: string }>;
  };
  /** 시즌 핵심 선수 (득점/어시스트) */
  keyPlayers?: {
    home: Array<{ name: string; goals: number; assists: number }>;
    away: Array<{ name: string; goals: number; assists: number }>;
  };
  /** 베팅사이트 평균 implied probability (vig 제거) — Value Bet 강조용 */
  marketProb?: {
    home: number;
    draw: number;
    away: number;
    bookmakers: number;
  };
  /** 확정 라인업 (api-football Pro, 매치 1시간 전 발표) */
  lineups?: {
    home: { formation?: string; startXI: string[]; coach?: string };
    away: { formation?: string; startXI: string[]; coach?: string };
  };
  /** API-Football 자체 예측 (third opinion) */
  apiPrediction?: {
    homePct: number;
    drawPct: number;
    awayPct: number;
    advice?: string;
  };
  /** MLB 선발 투수 (statsapi.mlb.com — MLB 만) */
  starters?: {
    home?: {
      name: string;
      hand?: string;
      era?: number;
      whip?: number;
      k9?: number;
      wins?: number;
      losses?: number;
      gs?: number;
      ip?: string;
    };
    away?: {
      name: string;
      hand?: string;
      era?: number;
      whip?: number;
      k9?: number;
      wins?: number;
      losses?: number;
      gs?: number;
      ip?: string;
    };
  };
}

export interface PreviewPromptInput {
  match: NormalizedMatch;
  context?: PreviewContext;
}

function lineIfExist(label: string, value: string | undefined | null): string {
  return value ? `- ${label}: ${value}` : "";
}

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

export function buildPreviewPrompt(input: PreviewPromptInput): string {
  const { match, context = {} } = input;
  const home = match.homeTeam.name;
  const away = match.awayTeam.name;
  const dateStr = match.startTime.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });

  const ctxLines: string[] = [];

  if (context.position) {
    ctxLines.push(
      `- 시즌 순위: ${home} ${context.position.home}위 (${context.points?.home ?? "?"}점) / ${away} ${context.position.away}위 (${context.points?.away ?? "?"}점) — 총 ${context.position.total}팀`,
    );
  }
  if (context.elo) {
    ctxLines.push(
      `- Elo 레이팅: ${home} ${Math.round(context.elo.home)} / ${away} ${Math.round(context.elo.away)}`,
    );
  }
  if (context.winProb) {
    ctxLines.push(
      `- 통계 추정 승률: ${home} ${pct(context.winProb.home)} / 무 ${pct(context.winProb.draw)} / ${away} ${pct(context.winProb.away)}`,
    );
  }
  if (context.lineups) {
    const lh = context.lineups.home;
    const la = context.lineups.away;
    const lhStr = `${lh.formation ? `[${lh.formation}] ` : ""}${lh.startXI.join(", ")}${lh.coach ? ` (감독: ${lh.coach})` : ""}`;
    const laStr = `${la.formation ? `[${la.formation}] ` : ""}${la.startXI.join(", ")}${la.coach ? ` (감독: ${la.coach})` : ""}`;
    ctxLines.push(`- 확정 라인업 ${home}: ${lhStr}`);
    ctxLines.push(`- 확정 라인업 ${away}: ${laStr}`);
  }
  if (context.apiPrediction) {
    const ap = context.apiPrediction;
    ctxLines.push(
      `- API-Football 자체 예측 (외부 third opinion): ${home} ${pct(ap.homePct)} / 무 ${pct(ap.drawPct)} / ${away} ${pct(ap.awayPct)}${ap.advice ? ` · advice: ${ap.advice}` : ""}`,
    );
  }
  if (context.starters?.home || context.starters?.away) {
    const s = context.starters;
    const fmt = (
      side: NonNullable<typeof s>["home"] | NonNullable<typeof s>["away"],
    ) => {
      if (!side) return "선발 미정";
      const handLabel =
        side.hand === "L" ? "좌완" : side.hand === "R" ? "우완" : "스위치";
      const stats = [
        side.era != null ? `ERA ${side.era.toFixed(2)}` : null,
        side.whip != null ? `WHIP ${side.whip.toFixed(2)}` : null,
        side.k9 != null ? `K/9 ${side.k9.toFixed(1)}` : null,
        side.wins != null && side.losses != null
          ? `${side.wins}-${side.losses}`
          : null,
        side.ip != null ? `IP ${side.ip}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return `${side.name} (${handLabel}, ${stats})`;
    };
    ctxLines.push(`- 홈 선발: ${fmt(s?.home)}`);
    ctxLines.push(`- 원정 선발: ${fmt(s?.away)}`);
    // ERA 차이로 우세 한 줄 자동 코멘트
    if (s?.home?.era != null && s?.away?.era != null) {
      const diff = s.away.era - s.home.era;
      const absDiff = Math.abs(diff);
      const better = diff > 0 ? home : away;
      if (absDiff >= 0.5) {
        ctxLines.push(
          `- 선발 ERA 차이 ${absDiff.toFixed(2)} — ${better} 선발 우세. 선발 영향이 큰 야구의 핵심 변수.`,
        );
      } else {
        ctxLines.push(
          `- 양 선발 ERA 차이 ${absDiff.toFixed(2)} 로 비등 — 타선·불펜 결정적.`,
        );
      }
    }
  }
  if (context.marketProb && context.winProb) {
    const mp = context.marketProb;
    const wp = context.winProb;
    const gaps = [
      { name: home, model: wp.home, market: mp.home },
      { name: away, model: wp.away, market: mp.away },
    ];
    const valueSide = gaps
      .filter((g) => g.model - g.market >= 0.05)
      .sort((a, b) => b.model - b.market - (a.model - a.market))[0];
    ctxLines.push(
      `- 베팅사이트 평균 odds (${mp.bookmakers}개사 implied, vig 제거): ${home} ${pct(mp.home)} / 무 ${pct(mp.draw)} / ${away} ${pct(mp.away)}`,
    );
    if (valueSide) {
      ctxLines.push(
        `  → AI 모델은 ${valueSide.name} 가 시장 평균보다 ${Math.round((valueSide.model - valueSide.market) * 100)}%p 더 유리하다고 평가 (Value Bet 후보 — 본문에서 자연스럽게 언급)`,
      );
    } else {
      ctxLines.push(`  → AI 모델과 시장 평균이 거의 일치 — 시장 합의 강함`);
    }
  }
  if (context.attackDefense) {
    const ad = context.attackDefense;
    if (ad.home.attack || ad.home.defense || ad.away.attack || ad.away.defense) {
      ctxLines.push(
        `- 공격/수비 랭킹: ${home} 공격${ad.home.attack ?? "-"}위·수비${ad.home.defense ?? "-"}위 / ${away} 공격${ad.away.attack ?? "-"}위·수비${ad.away.defense ?? "-"}위`,
      );
    }
  }
  if (context.homeAway) {
    const h = context.homeAway.home;
    const a = context.homeAway.away;
    ctxLines.push(
      `- 홈/원정 강도: ${home} 홈에서 ${h.wins}승${h.draws}무${h.losses}패 (경기당 ${h.ppg.toFixed(2)}점) / ${away} 원정에서 ${a.wins}승${a.draws}무${a.losses}패 (경기당 ${a.ppg.toFixed(2)}점)`,
    );
  }
  if (context.recentForm) {
    ctxLines.push(
      `- 최근 5경기 폼: ${home} ${context.recentForm.home.join("-") || "-"} / ${away} ${context.recentForm.away.join("-") || "-"}`,
    );
  }
  if (context.streak) {
    const hs = context.streak.home;
    const as = context.streak.away;
    const desc = (s: { unbeaten: number; winning: number; losing: number }) => {
      if (s.winning >= 2) return `${s.winning}연승 중`;
      if (s.unbeaten >= 3) return `${s.unbeaten}경기 무패`;
      if (s.losing >= 2) return `${s.losing}연패 중`;
      return "특이 흐름 없음";
    };
    ctxLines.push(`- 흐름: ${home} ${desc(hs)} / ${away} ${desc(as)}`);
  }
  if (context.trend) {
    ctxLines.push(
      `- 최근 5경기 평균 득실: ${home} ${context.trend.home.gf.toFixed(1)}득점/${context.trend.home.ga.toFixed(1)}실점 (경기당 ${context.trend.home.ppg.toFixed(2)}점) / ${away} ${context.trend.away.gf.toFixed(1)}득점/${context.trend.away.ga.toFixed(1)}실점 (경기당 ${context.trend.away.ppg.toFixed(2)}점)`,
    );
  }
  if (context.h2h && context.h2h.total > 0) {
    ctxLines.push(
      `- 상대 전적 (최근 ${context.h2h.total}경기): ${home} ${context.h2h.homeWins}승 · ${context.h2h.draws}무 · ${away} ${context.h2h.awayWins}승`,
    );
  }
  if (context.keyPlayers) {
    const fmt = (
      players: Array<{ name: string; goals: number; assists: number }>,
    ) =>
      players
        .map(
          (p) =>
            `${p.name}(${p.goals}골${p.assists ? "·" + p.assists + "도움" : ""})`,
        )
        .join(", ");
    if (context.keyPlayers.home.length > 0) {
      ctxLines.push(`- 핵심 선수 ${home}: ${fmt(context.keyPlayers.home)}`);
    }
    if (context.keyPlayers.away.length > 0) {
      ctxLines.push(`- 핵심 선수 ${away}: ${fmt(context.keyPlayers.away)}`);
    }
  }
  if (context.injuries) {
    const fmt = (list: Array<{ name: string; reason?: string }>) =>
      list
        .map((p) => (p.reason ? `${p.name}(${p.reason})` : p.name))
        .join(", ");
    if (context.injuries.home.length > 0) {
      ctxLines.push(`- 결장·부상 ${home}: ${fmt(context.injuries.home)}`);
    }
    if (context.injuries.away.length > 0) {
      ctxLines.push(`- 결장·부상 ${away}: ${fmt(context.injuries.away)}`);
    }
  }

  return `다음 예정 경기에 대한 프리뷰 기사를 작성해주세요.

[경기 기본 정보]
- 리그: ${match.league}
- 일시: ${dateStr} (KST)
- 홈: ${home}
- 원정: ${away}

[제공된 분석 데이터]
${ctxLines.length ? ctxLines.join("\n") : "(없음 — 일반론적인 프리뷰만)"}

[작성 요구사항]
- 800~1100자 분량
- 제목은 관전 포인트가 드러나도록. 단정·과장 X.
- 리드 문단(굵은 글씨)에 경기 의미·핵심 한 줄 요약
- H2 소제목 2~3개로 본문 구성. 추천 구성:
  · "양 팀 현재 흐름" (시즌 순위·최근 폼·streak)
  · "맞대결 포인트" (Elo·홈원정 강도·H2H 등)
  · "예측과 관전 포인트" (단정 X, 통계 추정치 부드럽게 인용)
- 마지막 한 문단은 차분한 정리. "박빙이 예상된다" 정도까지만.

[중요 주의]
- 위 [제공된 분석 데이터] 외의 사실 (부상자·라인업·이적·코치 발언 등) 절대 만들어내지 말 것.
- 베팅·픽·배당 관련 표현 절대 금지.`;
}
