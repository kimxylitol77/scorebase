// af fixture·팀 id 자리에 우리 externalId 를 넘기는 코드를 찾아내는 정적 검사.
//
// 배경 — 2026-08-22. `Match.externalId` 도 `Team.externalId` 도 af id 가 아닌 리그가 있는데
// (EPL 은 둘 다 football-data 대역) 그대로 af 에 넘겨, 매치 상세의 라이브 중계·AI 예측·
// 라운드 라벨·양 팀 시즌 통계가 통째로 남의 경기 것이 됐다(독일 U19·Piast Gliwice·Norwich).
// 런타임 방어(afTeamsMatch)가 화면 노출은 막지만, 애초에 잘못 부르는 코드는 여기서 잡는다.
//
// 실행: npx tsx scripts/check-af-id-misuse.ts   (위반 있으면 exit 1)

import { readFileSync } from "fs";
import { execSync } from "child_process";

/** af 에 id 를 넘기는 함수·URL 패턴. 여기 인자로 externalId·gameId 가 들어오면 위반이다. */
const RULES: Array<{ re: RegExp; why: string }> = [
  {
    re: /\bfetch(MatchPrediction|FixtureRound|FixtureOdds|SoccerEventsByFixture)\s*\(\s*(m\.)?(externalId|gameId|match\.externalId|String\(\s*m?\.?externalId)/,
    why: "af fixture id 자리에 externalId/gameId 를 넘기고 있다",
  },
  {
    re: /\bfetchTeamSeasonStats\s*\(\s*parseInt\(\s*\w*(ExtId|externalId)/,
    why: "af 팀 id 자리에 Team.externalId 를 넘기고 있다",
  },
  {
    re: /(predictions|fixtures|odds|teams)\?(fixture|id|team)=\$\{\s*(gameId|externalId|m\.externalId|match\.externalId)\s*\}/,
    why: "af URL 에 externalId/gameId 를 직접 끼워넣고 있다",
  },
];

/** 헬퍼 자신과 이 검사 파일은 패턴을 문서로 담고 있으므로 제외. */
const EXEMPT = [
  "src/lib/sports/af-match-ref.ts",
  "scripts/check-af-id-misuse.ts",
];

const PRE_FILTER =
  /fetch(MatchPrediction|FixtureRound|FixtureOdds|SoccerEventsByFixture|TeamSeasonStats)|api-sports\.io|v3\.football/;

function sourceFiles(): string[] {
  const out = execSync("git ls-files 'src/**/*.ts' 'src/**/*.tsx' 'scripts/**/*.ts'", {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  return out.split("\n").filter((f) => f && !EXEMPT.includes(f));
}

const violations: string[] = [];
for (const file of sourceFiles()) {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  // 사전 필터는 규칙이 겨냥하는 호출부가 있는 파일만 남긴다.
  // ⚠ 예전엔 `includes("af")` 였는데, `homeAfExtId` 처럼 대문자면 걸러져 파일이 통째로
  //    건너뛰어졌다(검사가 조용히 아무것도 안 잡음). 함수명으로 정확히 좁힌다.
  if (!PRE_FILTER.test(text)) continue;
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) return;
    // 정당한 예외는 그 줄이나 바로 윗줄에 `af-id-ok: 사유` 를 적어 표시한다.
    // 사유 없이 끄지 말 것 — 왜 af id 가 맞는지가 다음 사람에게 유일한 근거다.
    if (line.includes("af-id-ok") || (i > 0 && lines[i - 1].includes("af-id-ok"))) return;
    for (const { re, why } of RULES) {
      if (re.test(line)) {
        violations.push(`${file}:${i + 1}  ${why}\n    ${line.trim()}`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error(`af id 오용 ${violations.length}건 발견 — af 참조는 afMatchRef()/afFixtureId() 로만 얻는다.\n`);
  for (const v of violations) console.error(`  ${v}\n`);
  console.error("  이유: Match.externalId·Team.externalId 는 af id 가 아닌 리그가 있다(EPL=football-data).");
  console.error("        진짜 af 값은 Match.raw 안에 있고, src/lib/sports/af-match-ref.ts 가 단일 창구다.");
  process.exit(1);
}

console.log("af id 오용 0건 — af 참조는 모두 헬퍼 경유.");
