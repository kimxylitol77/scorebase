// 2026 FIFA 월드컵 토너먼트 시뮬 결과를 분석 글 프롬프트로 변환.
// 시즌 리그 분석과 달리, 토너먼트는 진출 확률 / 조별 분포 / 한국 시청자
// 관점의 강조점이 다르다.

import type { WorldCupResult } from "@/lib/predict/world-cup-simulation";
import { WORLD_CUP_GROUPS } from "@/lib/predict/world-cup-elos";

interface BuildInput {
  results: WorldCupResult[];
  iterations: number;
  /** 한국 시청자 관점에서 한국 팀 키 (DB 표기 그대로) */
  koreaTeamName?: string;
}

const PCT = (p: number) => `${(p * 100).toFixed(1)}%`;

export function buildWorldCupAnalysisPrompt({
  results,
  iterations,
  koreaTeamName = "South Korea",
}: BuildInput): string {
  const lines: string[] = [];

  lines.push("[대회] FIFA 월드컵 2026 (북중미 — 미국·캐나다·멕시코 공동개최)");
  lines.push(`[일정] 2026-06-11 개막 ~ 2026-07-19 결승 (총 104경기 · 48팀)`);
  lines.push(
    `[시뮬레이션] eloratings.net 기반 시드 Elo + Monte Carlo ${iterations.toLocaleString()}회 토너먼트 시뮬`,
  );
  lines.push("");

  // 우승 후보
  lines.push("[우승 확률 TOP 12]");
  results.slice(0, 12).forEach((r, i) => {
    lines.push(
      ` ${i + 1}. ${r.teamName} (Group ${r.group}) — 우승 ${PCT(r.champion)} · 결승 ${PCT(r.final)} · 4강 ${PCT(r.sf)}`,
    );
  });
  lines.push("");

  // 4강 진출 TOP 10
  const sf = [...results].sort((a, b) => b.sf - a.sf).slice(0, 10);
  lines.push("[4강 진출 확률 TOP 10]");
  sf.forEach((r, i) => {
    lines.push(` ${i + 1}. ${r.teamName} ${PCT(r.sf)} (Group ${r.group})`);
  });
  lines.push("");

  // 12조별 통과 확률
  lines.push("[12조 — 조별예선 통과(32강 진출) 확률]");
  for (const g of Object.keys(WORLD_CUP_GROUPS).sort()) {
    const groupTeams = results
      .filter((r) => r.group === g)
      .sort((a, b) => b.groupPass - a.groupPass);
    if (groupTeams.length === 0) continue;
    const summary = groupTeams
      .map((r) => `${r.teamName} ${PCT(r.groupPass)}`)
      .join(" / ");
    lines.push(` Group ${g}: ${summary}`);
  }
  lines.push("");

  // 한국 상세
  const korea = results.find((r) =>
    /korea/i.test(r.teamName) || r.teamName === koreaTeamName,
  );
  if (korea) {
    const groupRivals = results
      .filter((r) => r.group === korea.group && r.teamName !== korea.teamName)
      .sort((a, b) => b.groupPass - a.groupPass);
    lines.push(`[🇰🇷 한국 (Group ${korea.group})]`);
    lines.push(
      ` 조별 통과 ${PCT(korea.groupPass)} · 16강 ${PCT(korea.r16)} · 8강 ${PCT(korea.qf)} · 4강 ${PCT(korea.sf)} · 결승 ${PCT(korea.final)} · 우승 ${PCT(korea.champion)}`,
    );
    lines.push(` 조별예선 평균 승점 ${korea.expectedPoints.toFixed(2)}점`);
    lines.push(" 조 라이벌 통과 확률:");
    groupRivals.forEach((r) =>
      lines.push(`   - ${r.teamName} ${PCT(r.groupPass)}`),
    );
    lines.push("");
  }

  // 다크호스 (우승 확률 1% 미만이지만 8강 가능성 5% 이상)
  const darkhorses = results
    .filter((r) => r.champion < 0.01 && r.qf >= 0.05)
    .sort((a, b) => b.qf - a.qf)
    .slice(0, 6);
  if (darkhorses.length > 0) {
    lines.push("[다크호스 후보 — 8강은 노릴 만한 팀]");
    darkhorses.forEach((r) =>
      lines.push(
        ` - ${r.teamName} (Group ${r.group}): 8강 ${PCT(r.qf)} · 16강 ${PCT(r.r16)}`,
      ),
    );
    lines.push("");
  }

  // 글 작성 가이드
  lines.push("---");
  lines.push("위 시뮬레이션 데이터를 근거로 다음 형식의 분석 글을 한국어로 작성하시오:");
  lines.push("");
  lines.push("# (제목 — 흥미로운 포인트 한 줄, 예: '데이터로 보는 2026 월드컵: 스페인 우세 속 한국 16강 가능성은?')");
  lines.push("");
  lines.push("## 우승 판도 — 데이터가 보는 톱 후보");
  lines.push("우승 확률 상위 4~5팀의 강점·약점·대진(조)을 한 문단씩.");
  lines.push("");
  lines.push("## 🇰🇷 한국 분석");
  lines.push("Group 의 라이벌 분석. 조별 통과 확률 근거. 시나리오별(1·2위·3위) 16강 진출 경로.");
  lines.push("");
  lines.push("## 데스 그룹 / 이지 그룹");
  lines.push("통과 확률 분포가 균등한 조 = 데스 그룹. 한 팀이 압도적 = 이지 그룹.");
  lines.push("");
  lines.push("## 다크호스 후보");
  lines.push("우승은 어려워도 8강·4강 진출 가능성이 있는 팀.");
  lines.push("");
  lines.push("## 한계와 주의 — 어떤 변수가 시뮬을 흔들 수 있나");
  lines.push("부상 / 라인업 변화 / 토너먼트 매치업 미정 등.");
  lines.push("");
  lines.push("규칙:");
  lines.push("- 모든 % 는 위에 제시된 시뮬 데이터를 그대로 인용 (가공·창작 금지).");
  lines.push("- 베팅·도박 권유 어조 금지. 분석/관전 가이드 어조 유지.");
  lines.push("- 본문은 800~1500자 내외. 너무 짧지도 길지도 않게.");
  lines.push("- 시뮬은 '참고용 모델 추정치'임을 글 말미에 한 문장으로 명시.");

  return lines.join("\n");
}
