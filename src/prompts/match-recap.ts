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
      `- 경기 전 통계 추정 승률: ${home} ${pct(context.winProb.home)} / 무 ${pct(context.winProb.draw)} / ${away} ${pct(context.winProb.away)}`,
    );
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
- 800~1200자 분량
- 제목은 결과를 직관적으로 (예: "리버풀, 시티에 2-1 승... 시즌 막판 추격전 본격화")
- 리드(굵은 글씨)에 핵심 결과 한 줄 요약
- H2 소제목 2~3개로 구성. 추천 구성:
  · "결과 요약" (스코어와 의미)
  · "흐름 분석" (사전 전망 vs 결과의 차이, 사전 통계가 적중했는지/이변이었는지)
  · "맥락과 시사점" (시즌 순위에 미치는 영향, 양 팀의 다음 과제)
- 마지막은 시즌 흐름·다음 경기 의미로 차분히 마무리.

[중요 주의]
- 골 시간, 득점자, 라인업, 부상 같은 컨텍스트에 없는 사실 절대 만들어내지 말 것.
- 스코어가 비어있거나 경기가 끝나지 않았다면, 작성을 거절하고 그 이유 한 줄만 답할 것.
- 베팅·픽·배당 관련 표현 절대 금지.
- "이변이다" "파란이다" 같은 단정도 자제. "예상보다" "흐름과 달리" 정도로.`;
}
