// 종료된 경기에 대한 리뷰(Recap) 글 프롬프트.
// PreviewContext 와 동일한 컨텍스트 타입을 받아 분석가급 글을 생성한다.

import type { NormalizedMatch } from "@/lib/sports/types";
import type { PreviewContext } from "./match-preview";
import { toKoreanTeamName } from "@/lib/team-names";

export interface RecapContext extends PreviewContext {
  /** 경기 이벤트 (골/카드/교체 — 시간순) */
  events?: Array<{
    minute: number;
    type: string; // "Goal" | "Card" | ...
    detail: string;
    team: "home" | "away";
    player: string;
    assist?: string;
  }>;
  /** 매치 통계 (api-football Pro) */
  fixtureStats?: Array<{
    teamId: number;
    teamName: string;
    shotsOnGoal?: number;
    shotsTotal?: number;
    possessionPct?: number;
    passesTotal?: number;
    passesAccuratePct?: number;
    cornerKicks?: number;
    yellowCards?: number;
    redCards?: number;
    saves?: number;
  }>;
  /** 양 팀 중 한 쪽의 다음 매치 PREVIEW 글 slug — 본문 내부 링크용 */
  nextMatchPreview?: {
    slug: string;
    title: string;
    teamSide: "home" | "away";
  };
}

export interface RecapPromptInput {
  match: NormalizedMatch;
  context?: RecapContext;
}

function pct(p: number) {
  return `${Math.round(p * 100)}%`;
}

export function buildRecapPrompt(input: RecapPromptInput): string {
  const { match, context = {} } = input;
  const home = toKoreanTeamName(match.homeTeam.name);
  const away = toKoreanTeamName(match.awayTeam.name);
  const score = `${match.homeScore ?? "?"} : ${match.awayScore ?? "?"}`;
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
      `- 경기 직전 시즌 순위: ${home} ${context.position.home}위 (${context.points?.home ?? "?"}점) / ${away} ${context.position.away}위 (${context.points?.away ?? "?"}점)`,
    );
  }
  if (context.elo) {
    ctxLines.push(
      `- 경기 직전 Elo 레이팅: ${home} ${Math.round(context.elo.home)} / ${away} ${Math.round(context.elo.away)}`,
    );
  }
  if (context.winProb) {
    ctxLines.push(
      `- 모델(Elo) 추정 승률: ${home} ${pct(context.winProb.home)} / 무 ${pct(context.winProb.draw)} / ${away} ${pct(context.winProb.away)}`,
    );
  }
  if (context.marketProb) {
    ctxLines.push(
      `- 베팅사이트 평균 implied 확률 (${context.marketProb.bookmakers}개사, vig 제거): ${home} ${pct(context.marketProb.home)} / 무 ${pct(context.marketProb.draw)} / ${away} ${pct(context.marketProb.away)} — 시장 예측 vs 실제 결과 비교에 활용`,
    );
  }
  if (context.apiPrediction) {
    ctxLines.push(
      `- API-Football 자체 예측 (third opinion): ${home} ${context.apiPrediction.homePct}% / 무 ${context.apiPrediction.drawPct}% / ${away} ${context.apiPrediction.awayPct}%${context.apiPrediction.advice ? ` · advice: "${context.apiPrediction.advice}"` : ""}`,
    );
  }
  if (context.lineMovement) {
    const lm = context.lineMovement;
    ctxLines.push(
      `- 라인 움직임 (오프닝 → 현재 implied 확률): ${home} ${pct(lm.home.opening)}→${pct(lm.home.current)} / 무 ${pct(lm.draw.opening)}→${pct(lm.draw.current)} / ${away} ${pct(lm.away.opening)}→${pct(lm.away.current)} — 시장이 어느 쪽으로 기울었는지 풀어내기`,
    );
  }
  if (context.streak) {
    const s = context.streak;
    const fmtS = (x: typeof s.home) =>
      [
        x.winning > 0 ? `${x.winning}연승` : null,
        x.unbeaten > 0 && x.winning === 0 ? `${x.unbeaten}경기 무패` : null,
        x.losing > 0 ? `${x.losing}연패` : null,
      ].filter(Boolean).join(" · ") || "특별 흐름 없음";
    ctxLines.push(
      `- 경기 직전 흐름: ${home} ${fmtS(s.home)} / ${away} ${fmtS(s.away)}`,
    );
  }
  if (context.trend) {
    const t = context.trend;
    ctxLines.push(
      `- 최근 경기당 평균 득실/승점: ${home} ${t.home.gf.toFixed(2)}득/${t.home.ga.toFixed(2)}실/${t.home.ppg.toFixed(2)}점 · ${away} ${t.away.gf.toFixed(2)}득/${t.away.ga.toFixed(2)}실/${t.away.ppg.toFixed(2)}점 — 이번 경기 스코어와의 차이 분석`,
    );
  }
  if (context.homeAway) {
    const ha = context.homeAway;
    ctxLines.push(
      `- 홈/원정 split: ${home} 홈 ${ha.home.wins}-${ha.home.draws}-${ha.home.losses} (PPG ${ha.home.ppg.toFixed(2)}) / ${away} 원정 ${ha.away.wins}-${ha.away.draws}-${ha.away.losses} (PPG ${ha.away.ppg.toFixed(2)})`,
    );
  }
  if (context.keyPlayers) {
    const fmtKP = (l: Array<{ name: string; goals: number; assists: number }>) =>
      l
        .map(
          (p) =>
            `${p.name}(${p.goals}골${p.assists ? "·" + p.assists + "도움" : ""})`,
        )
        .join(", ");
    if (context.keyPlayers.home.length > 0) {
      ctxLines.push(`- 시즌 핵심 선수 ${home}: ${fmtKP(context.keyPlayers.home)} — 이번 경기 골 기여 여부 분석`);
    }
    if (context.keyPlayers.away.length > 0) {
      ctxLines.push(`- 시즌 핵심 선수 ${away}: ${fmtKP(context.keyPlayers.away)}`);
    }
  }
  if (context.starters) {
    const s = context.starters;
    const fmtS = (p?: typeof s.home) =>
      p
        ? `${p.name}${p.hand ? `(${p.hand}완)` : ""}${p.era != null ? " ERA " + p.era.toFixed(2) : ""}${p.whip != null ? " · WHIP " + p.whip.toFixed(2) : ""}${p.wins != null && p.losses != null ? ` · ${p.wins}-${p.losses}` : ""}`
        : "(미정)";
    ctxLines.push(`- 선발 투수: ${home} ${fmtS(s.home)} / ${away} ${fmtS(s.away)} — 시즌 성적 대비 이번 등판 결과 비교`);
  }
  // 야구(KBO/MLB/NPB) Poisson 모델 — 사전 예상 득점 vs 실제 결과 비교용
  if (context.totalExpectedRuns) {
    ctxLines.push(
      `- 사전 Poisson 모델 예상 득점: ${away}(원정) ${context.totalExpectedRuns.team1.toFixed(2)} · ${home}(홈) ${context.totalExpectedRuns.team2.toFixed(2)} — 실제 ${match.awayScore}-${match.homeScore} 와 차이 분석 (모델 hit/miss)`,
    );
  }
  if (context.winProbPoisson) {
    ctxLines.push(
      `- 사전 Poisson+Skellam 승률: ${away} ${pct(context.winProbPoisson.team1)} · ${home} ${pct(context.winProbPoisson.team2)} — 모델이 어느 팀 우세로 봤는지`,
    );
  }
  if (context.inningScoreProbs && context.inningScoreProbs.length === 9) {
    ctxLines.push(
      `- 이닝별 득점 확률 카드는 별도 표시. 본문에서는 카드와 같은 % 수치 나열 금지 — '6회 이후 불펜 전환점에서 흐름 바뀐 부분' 같은 분석적 해석에 집중.`,
    );
  }
  if (context.topScores && context.topScores.length > 0) {
    const ts = context.topScores
      .slice(0, 3)
      .map((s) => `${s.home}-${s.away}(${pct(s.prob)})`)
      .join(", ");
    ctxLines.push(`- 모델 확률 분포 top 3 스코어: ${ts} — 실제 ${match.homeScore}-${match.awayScore} 와 일치/근접 여부`);
  }
  if (context.fixtureStats && context.fixtureStats.length >= 2) {
    const h = context.fixtureStats.find((s) => s.teamName === home) ?? context.fixtureStats[0];
    const a = context.fixtureStats.find((s) => s.teamName === away) ?? context.fixtureStats[1];
    const statLine = (s: typeof h) =>
      [
        s.shotsOnGoal != null ? `유효슛 ${s.shotsOnGoal}` : null,
        s.shotsTotal != null ? `슛 ${s.shotsTotal}` : null,
        s.possessionPct != null ? `점유율 ${s.possessionPct}%` : null,
        s.passesAccuratePct != null ? `패스 정확도 ${s.passesAccuratePct}%` : null,
        s.cornerKicks != null ? `코너 ${s.cornerKicks}` : null,
        s.yellowCards != null && s.yellowCards > 0 ? `옐로 ${s.yellowCards}` : null,
        s.redCards != null && s.redCards > 0 ? `레드 ${s.redCards}` : null,
        s.saves != null ? `세이브 ${s.saves}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    ctxLines.push(`- 매치 통계 ${home}: ${statLine(h)}`);
    ctxLines.push(`- 매치 통계 ${away}: ${statLine(a)}`);
  }
  if (context.attackDefense) {
    const ad = context.attackDefense;
    ctxLines.push(
      `- 공격/수비 랭킹(시즌): ${home} 공격${ad.home.attack ?? "-"}위·수비${ad.home.defense ?? "-"}위 / ${away} 공격${ad.away.attack ?? "-"}위·수비${ad.away.defense ?? "-"}위`,
    );
  }
  if (context.recentForm) {
    ctxLines.push(
      `- 경기 직전 5경기 폼: ${home} ${context.recentForm.home.join("-") || "-"} / ${away} ${context.recentForm.away.join("-") || "-"}`,
    );
  }
  if (context.h2h && context.h2h.total > 0) {
    ctxLines.push(
      `- 상대 전적(직전): ${home} ${context.h2h.homeWins}승 · ${context.h2h.draws}무 · ${away} ${context.h2h.awayWins}승`,
    );
  }
  if (context.lineups) {
    const fmt = (l: { formation?: string; startXI: string[]; coach?: string }) =>
      `${l.formation ? "[" + l.formation + "] " : ""}${l.startXI.join(", ")}${l.coach ? " (감독: " + l.coach + ")" : ""}`;
    if (context.lineups.home.startXI.length > 0) {
      ctxLines.push(`- ${home} 라인업: ${fmt(context.lineups.home)}`);
    }
    if (context.lineups.away.startXI.length > 0) {
      ctxLines.push(`- ${away} 라인업: ${fmt(context.lineups.away)}`);
    }
  }
  if (context.events && context.events.length > 0) {
    const goals = context.events.filter((e) => e.type === "Goal");
    const cards = context.events.filter((e) => e.type === "Card");
    if (goals.length > 0) {
      const gline = goals
        .map(
          (g) =>
            `${g.minute}' ${g.player}(${g.team === "home" ? home : away})${g.assist ? " 어시 " + g.assist : ""}`,
        )
        .join(", ");
      ctxLines.push(`- 골 기록: ${gline}`);
    }
    if (cards.length > 0) {
      const yc = cards.filter((c) => c.detail.toLowerCase().includes("yellow")).length;
      const rc = cards.filter((c) => c.detail.toLowerCase().includes("red")).length;
      ctxLines.push(`- 경고/퇴장: 옐로 ${yc}장, 레드 ${rc}장`);
    }
  }
  if (context.nextMatchPreview) {
    const teamName = context.nextMatchPreview.teamSide === "home" ? home : away;
    ctxLines.push(
      `- nextMatchPreview (본문 마지막 마무리에 자연스럽게 한 문장으로 인용 — 마크다운 링크 1개): ${teamName} 의 다음 매치 프리뷰 "${context.nextMatchPreview.title}" → /articles/${context.nextMatchPreview.slug}`,
    );
  }

  return `다음 종료 경기에 대한 리뷰 기사를 작성해주세요.

[경기 정보]
- 리그: ${match.league}
- 일시: ${dateStr} (KST)
- 홈: ${home}
- 원정: ${away}
- 최종 스코어: ${home} ${score} ${away}
- 경기 상태: ${match.status}

[제공된 분석 데이터 — 경기 직전 시점 기준]
${ctxLines.length ? ctxLines.join("\n") : "(없음)"}

[작성 요구사항]
- 분량 제한 없음 — 입력 ctxLines 의 모든 데이터를 적극적으로 본문에 녹여 분석가 톤으로 충분히 풀어낸다. 단순 사실 나열 금지, 항상 "왜" 와 "그래서" 를 붙여라.
- 제목은 결과를 직관적으로 (예: "리버풀, 시티에 2-1 승... 시즌 막판 추격전 본격화")
- 리드(굵은 글씨)에 핵심 결과 한 줄 요약 + 핵심 수치 1개 인용 (점유율·유효슛·골 시간 중 하나)
- H2 소제목 3~5개로 구성. 가능한 섹션 (데이터 있으면 적극 활용):
  · "결과와 핵심 장면" — 스코어 의미 + 골 시간·득점자·유효슛/점유율 인용
  · "사전 예측 vs 실제" — 모델(Elo) 승률, 베팅사이트 평균 시장 확률, API-Football 예측 세 가지를 나란히 인용 → 실제 결과와 비교 → "시장도 ${home} 우세였는데 결과가 일치" / "모델은 ${home} 60% 였지만 실제론 무승부" 식으로
  · "라인 움직임" (lineMovement 있을 때) — 베팅사 오프닝 vs 현재 라인이 어디로 기울었는지 → 결과와 연결 ("막판까지 ${away} 쪽으로 기울었지만 결국 ${home} 승")
  · "흐름·핵심 선수" — 사전 연승/연패 흐름이 이어졌는지·끊겼는지, 시즌 핵심 선수 (keyPlayers) 가 골/도움 기여했는지, 야구라면 선발 투수 시즌 ERA 대비 이번 등판 결과
  · "확률 분포 vs 실제 스코어" (topScores 있을 때) — 모델이 가장 가능성 높게 본 스코어 top 3 와 실제 비교
  · "시즌 순위 의미·다음 경기" — 이 결과로 순위가 어떻게 변하는지, 양 팀의 다음 과제
- 데이터 인용 가이드:
  * 모델 승률·시장 implied 확률 → "%" 그대로 인용
  * Elo 격차 → 점수 차로 표현 ("${home} +50 우위였는데...")
  * 매치 통계 → 점유율·유효슛·정확도 둘 다 인용 (편향 X)
  * 흐름(streak) → "${home} 5연승 째" 식으로 직관적
- 마지막은 시즌 흐름·다음 경기 의미로 차분히 마무리.
- ctxLines 의 nextMatchPreview 가 있으면, 마무리 뒤에 자연스러운 한 문장으로 마크다운 링크 1개 인용. 링크 텍스트는 nextMatchPreview.title 을 짧게 다듬어도 좋다.

[중요 주의]
- 골 시간, 득점자, 라인업, 부상 같은 컨텍스트에 없는 사실 절대 만들어내지 말 것.
- 스코어가 비어있거나 경기가 끝나지 않았다면, 작성을 거절하고 그 이유 한 줄만 답할 것.
- 베팅·픽·배당 관련 표현 절대 금지.
- "이변이다" "파란이다" 같은 단정도 자제. "예상보다" "흐름과 달리" 정도로.`;
}
