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
  /** 다가오는 빅매치 전술 포인트 데이터 블록(lib/tactical/weekly-points). 있으면 전술 섹션을 요구한다. */
  tactical?: { home: string; away: string; text: string } | null;
}

export function buildSeasonAnalysisPrompt({
  context,
  teamName,
  tactical,
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

  if (tactical) {
    lines.push("");
    lines.push(tactical.text);
  }

  // 전술 섹션 — 유튜브 전술 채널이 흡수하는 "전술 학습 수요"를 검색 가능한 텍스트로 받는 구획.
  // 세 축(포메이션·템포/압박·세트피스)을 고정해 매주 같은 구조로 쌓이게 한다.
  const tacticalReq = tactical
    ? `
- 마지막 본문 H2 로 "이번 주 주목할 전술 포인트 3가지 — ${tactical.home} vs ${tactical.away}" 를 반드시 넣고,
  [전술 포인트 데이터] 만 근거로 아래 세 항목을 번호 목록으로 각 2~3문장씩 쓸 것:
  1. 포메이션 맞대결 — 양 팀 최근 최다 포메이션과 그 맞물림(중원 수 우위·측면 폭 등)을 데이터에 적힌 포메이션으로만 서술
  2. 템포와 압박 성향 — 점유율·슈팅·피슈팅·파울 수치로 어느 쪽이 주도권을 잡고 어느 쪽이 내려앉을지 서술. 압박 강도 수치(PPDA 등)는 데이터에 없으니 절대 만들지 말 것
  3. 세트피스 — 코너킥 획득/허용 수치로 세트피스 비중을 서술. 세트피스 득점 수·키커 이름은 데이터에 없으니 언급 금지
  이 섹션은 "이번 주 주목할 전술 포인트" 정리이므로 예측·승패 단정은 하지 말 것`
    : "";
  const lengthReq = tactical ? "1600~2100자" : "1200~1600자";

  return `다음 데이터를 토대로 ${friendlyName} 시즌 종합 분석 기사를 작성해주세요.

[입력 데이터]
${lines.join("\n")}

[작성 요구사항]
- ${lengthReq} 분량의 한국어 분석 기사
- 제목은 시즌 흐름·핵심 키워드를 직관적으로 (예: "프리미어리그 막바지, 우승은 사실상 결정됐다")
- 리드(굵은 글씨) 한 줄: 시즌의 핵심 메시지
- H2 소제목 3~4개 추천 구성:
  · "선두 경쟁" 또는 "우승 흐름"
  · "공격·수비 맞붙은 팀들" (공격/수비 랭킹 활용)
  · "뜨거운 팀, 차가운 팀" (streak·최근 폼)
  · "Monte Carlo 시뮬레이션이 보는 시즌 끝" (있을 때)
  · "남은 빅매치" (있을 때)${tacticalReq}
- 마지막 한 문단은 차분한 정리 (단정 X)

[중요 주의]
- 팀명은 입력 데이터에 적힌 한글 표기를 글자 그대로 사용할 것 — 임의 음역·변형 금지 (예: "아스널"을 "아르센알"로 쓰지 말 것)
- 입력 데이터에 없는 사실(부상자·이적·코치 발언 등) 절대 만들어내지 말 것
- 베팅·픽·배당 관련 표현 절대 금지
- "이변" "파란" 같은 클릭베이트성 표현 자제`;
}
