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
  lines.push("위 시뮬레이션 데이터를 근거로 한국 독자를 위한 시각적으로 풍부한 분석 글을 작성하시오.");
  lines.push("렌더링: react-markdown + GitHub Flavored Markdown (표 / blockquote / 링크 / 체크리스트 모두 지원).");
  lines.push("");
  lines.push("[필수 구조 — 이 순서·헤딩 그대로]");
  lines.push("");
  lines.push("# (이모지 1개 + 후크 한 줄 제목)");
  lines.push("");
  lines.push("> **TL;DR**");
  lines.push("> 시뮬에서 도출된 가장 흥미로운 사실 2~3개를 한 줄씩. 각 줄 첫 칸에 이모지 사용 (🇪🇸·🇰🇷·🐎 등).");
  lines.push("> 예) ");
  lines.push("> > 🇪🇸 스페인 우승 확률 38.8% — 시드 Elo 1위의 압도적 우세");
  lines.push("> > 🇰🇷 한국 조별예선 통과 84.5% (Group A) — 16강은 10.8%");
  lines.push("> > 🐎 세네갈·벨기에가 의외의 8강 후보로 떠오름");
  lines.push("");
  lines.push("## 🥇 우승 판도");
  lines.push("도입 한 단락 (2~3문장).");
  lines.push("");
  lines.push("**우승 확률 TOP 8** — 다음 형식의 markdown 표:");
  lines.push("");
  lines.push("| 순위 | 팀 | 조 | 우승 | 결승 | 4강 |");
  lines.push("|---|---|---|---|---|---|");
  lines.push("(상위 8팀 한 줄씩, 우승/결승/4강 % 표기)");
  lines.push("");
  lines.push("표 아래에 1·2위 팀의 강점/대진 코멘트 한 단락.");
  lines.push("");
  lines.push("## 🇰🇷 한국 — Group 분석");
  lines.push("blockquote(>) 로 핵심 수치 강조:");
  lines.push("");
  lines.push("> **조별 통과 확률 XX.X%** · 16강 X.X% · 8강 X.X%");
  lines.push("> 평균 승점 X.XX점");
  lines.push("");
  lines.push("Group 라이벌 분석 markdown 표 (상대팀 / 통과확률 / 평가 칼럼). 그 뒤 한국이 16강 가려면 어떤 결과가 필요한지 한 단락.");
  lines.push("");
  lines.push("## 🌍 12조 통과 확률 한눈에");
  lines.push("12개 조 모두 표로 (조 / 1순위 / 2순위 / 다크호스 — 통과확률 표기).");
  lines.push("표 아래에 '데스 그룹' 1~2개와 '이지 그룹' 1~2개 코멘트.");
  lines.push("");
  lines.push("## 🐎 다크호스 후보");
  lines.push("8강 가능성 있는 비주류 팀 3~4팀을 불릿(`-`)으로:");
  lines.push("- **팀명** (Group X) — 8강 X% / 16강 X% — 한 줄 코멘트");
  lines.push("");
  lines.push("## ⚠️ 시뮬레이션의 한계");
  lines.push("3~4개 항목 체크리스트 형식 (`- [ ]` 사용 X, 그냥 `-` 불릿):");
  lines.push("- 부상·라인업 변화");
  lines.push("- 32강 매치업 미정");
  lines.push("- 토너먼트 단판 변동성");
  lines.push("");
  lines.push("## 📊 더 자세한 데이터");
  lines.push("마지막 단락에 자연스럽게 예측 페이지 링크 삽입:");
  lines.push("> 위 수치는 5,000회 Monte Carlo 시뮬레이션 결과입니다. 실시간 갱신되는 [전체 우승·진출 확률 데이터](/predictions/WORLD_CUP) 와 [월드컵 매치 일정](/leagues/WORLD_CUP) 도 참고하세요.");
  lines.push("");
  lines.push("[규칙]");
  lines.push("- 모든 % 와 평균 승점은 위에 제시된 시뮬 데이터를 그대로 인용 (창작·반올림 변형 금지).");
  lines.push("- 베팅·도박 권유 어조 금지. 데이터 저널리즘 톤 유지.");
  lines.push("- 본문 1,500~2,500자 분량 (표 포함).");
  lines.push("- 표는 markdown 표 문법(`|`)으로만. ASCII art 금지.");
  lines.push("- 한국 부분은 🇰🇷 이모지로 시각적 강조.");
  lines.push("- 결과 자체에 '결론' 헤딩 추가 금지 — 마지막 섹션이 '더 자세한 데이터'.");

  return lines.join("\n");
}
