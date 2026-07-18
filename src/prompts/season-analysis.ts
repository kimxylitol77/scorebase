// 리그 시즌 종합 분석 글 프롬프트.

import type { SeasonContext } from "@/lib/predict/season-context";
import { formatChampionPct } from "@/lib/format";

const LEAGUE_NAME: Record<string, string> = {
  EPL: "프리미어리그",
  LALIGA: "라리가",
  BUNDESLIGA: "분데스리가",
  SERIE_A: "세리에 A",
  LIGUE_1: "리그 1",
  MLS: "MLS",
  UCL: "챔피언스리그",
  NBA: "NBA",
  NHL: "NHL",
  MLB: "MLB",
  KBO: "KBO 리그",
};

interface BuildInput {
  context: SeasonContext;
  /** 팀 ID → 팀 이름 매핑 */
  teamName: (id: number) => string;
}

export function buildSeasonAnalysisPrompt({
  context,
  teamName,
}: BuildInput): string {
  const lg = context.league;
  const friendlyName = LEAGUE_NAME[lg] ?? lg;

  const lines: string[] = [];
  lines.push(`[리그] ${friendlyName} (${lg})`);
  lines.push(
    `[진행도] 완료 ${context.finishedCount}경기 / 예정 ${context.scheduledCount}경기 / 총 ${context.totalTeams}팀`,
  );
  lines.push("");

  lines.push("[상위권]");
  context.topRows.forEach((r, i) => {
    lines.push(
      ` ${i + 1}. ${teamName(r.teamId)} ${r.points}점 (${r.wins}승${r.draws}무${r.losses}패, 골득실 ${r.goalDiff >= 0 ? "+" : ""}${r.goalDiff})`,
    );
  });
  lines.push("");

  if (context.bottomRows.length > 0) {
    lines.push("[하위권]");
    context.bottomRows.forEach((r) => {
      lines.push(
        ` ${r.position}. ${teamName(r.teamId)} ${r.points}점 (${r.wins}승${r.draws}무${r.losses}패)`,
      );
    });
    lines.push("");
  }

  if (context.topAttack.length > 0) {
    lines.push("[공격 Top 3]");
    context.topAttack.forEach((t, i) =>
      lines.push(
        ` ${i + 1}. ${teamName(t.teamId)} 경기당 ${t.perGame.toFixed(2)}득점`,
      ),
    );
    lines.push("");
  }

  if (context.topDefense.length > 0) {
    lines.push("[수비 Top 3]");
    context.topDefense.forEach((t, i) =>
      lines.push(
        ` ${i + 1}. ${teamName(t.teamId)} 경기당 ${t.perGame.toFixed(2)}실점`,
      ),
    );
    lines.push("");
  }

  if (context.hotTeams.length > 0) {
    lines.push("[뜨거운 팀]");
    context.hotTeams.forEach((s) => {
      const desc =
        s.winningRun >= 3
          ? `${s.winningRun}연승 중`
          : `${s.unbeatenRun}경기 무패 행진`;
      lines.push(` - ${teamName(s.teamId)} ${desc}`);
    });
    lines.push("");
  }

  if (context.coldTeams.length > 0) {
    lines.push("[부진한 팀]");
    context.coldTeams.forEach((s) =>
      lines.push(` - ${teamName(s.teamId)} ${s.losingRun}연패 중`),
    );
    lines.push("");
  }

  if (context.risingTeams.length > 0) {
    lines.push("[최근 5경기 평균 승점 Top 5]");
    context.risingTeams.forEach((t, i) =>
      lines.push(
        ` ${i + 1}. ${teamName(t.teamId)} 경기당 ${t.ppg.toFixed(2)}점 (${t.gf.toFixed(1)}득점/${t.ga.toFixed(1)}실점)`,
      ),
    );
    lines.push("");
  }

  if (context.mc && context.mc.length > 0) {
    lines.push("[Monte Carlo 시즌 시뮬레이션 — 5,000회]");
    const champs = context.mc
      .filter((r) => r.champion >= 0.01)
      .slice(0, 5);
    if (champs.length > 0) {
      lines.push(" 우승 확률:");
      champs.forEach((r) =>
        lines.push(
          `  - ${teamName(r.teamId)} ${formatChampionPct(r.champion)} (예상 ${r.expectedPoints.toFixed(0)}점)`,
        ),
      );
    }
    if ((context.mcRelegationCount ?? 0) > 0) {
      const releg = [...context.mc]
        .filter((r) => r.relegation >= 0.1)
        .sort((a, b) => b.relegation - a.relegation)
        .slice(0, 3);
      if (releg.length > 0) {
        lines.push(" 강등 위험:");
        releg.forEach((r) =>
          lines.push(
            `  - ${teamName(r.teamId)} ${(r.relegation * 100).toFixed(0)}%`,
          ),
        );
      }
    }
    lines.push("");
  }

  if (context.bigMatches.length > 0) {
    lines.push("[다가오는 빅매치]");
    context.bigMatches.forEach((m) => {
      lines.push(
        ` - ${teamName(m.homeTeamId)} (Elo ${Math.round(m.homeElo)}) vs ${teamName(m.awayTeamId)} (Elo ${Math.round(m.awayElo)})`,
      );
    });
  }

  return `다음 데이터를 토대로 ${friendlyName} 시즌 종합 분석 기사를 작성해주세요.

[입력 데이터]
${lines.join("\n")}

[작성 요구사항]
- 1200~1600자 분량의 한국어 분석 기사
- 제목은 시즌 흐름·핵심 키워드를 직관적으로 (예: "프리미어리그 막바지, 우승은 사실상 결정됐다")
- 리드(굵은 글씨) 한 줄: 시즌의 핵심 메시지
- H2 소제목 3~4개 추천 구성:
  · "선두 경쟁" 또는 "우승 흐름"
  · "공격·수비 맞붙은 팀들" (공격/수비 랭킹 활용)
  · "뜨거운 팀, 차가운 팀" (streak·최근 폼)
  · "Monte Carlo 시뮬레이션이 보는 시즌 끝" (있을 때)
  · "남은 빅매치" (있을 때)
- 마지막 한 문단은 차분한 정리 (단정 X)

[중요 주의]
- 팀명은 입력 데이터에 적힌 한글 표기를 글자 그대로 사용할 것 — 임의 음역·변형 금지 (예: "아스널"을 "아르센알"로 쓰지 말 것)
- 입력 데이터에 없는 사실(부상자·이적·코치 발언 등) 절대 만들어내지 말 것
- 베팅·픽·배당 관련 표현 절대 금지
- "이변" "파란" 같은 클릭베이트성 표현 자제`;
}
