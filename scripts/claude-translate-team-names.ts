// scripts/claude-translate-team-names.ts
// Claude API 로 영문 팀명 → 한국어 음역 (Ollama 보다 정확).
//
// Use case:
//   1) ollama-translate-team-names.ts 가 의심 (⚠️) 마크 한 항목들
//   2) 또는 직접 list 지정
//
// 사용 예:
//   npx tsx scripts/claude-translate-team-names.ts --league SERIE_B
//   npx tsx scripts/claude-translate-team-names.ts --names "FC Schalke 04,Hertha BSC"
//
// 출력: paste-ready snippet + JSON

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { prisma } from "../src/lib/db";
import { toKoreanTeamName } from "../src/lib/team-names";
import { generate } from "../src/lib/ai/claude";

interface Args {
  league?: string;
  names?: string[];
  max: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const arg = (k: string, def?: string): string | undefined => {
    const i = argv.findIndex((a) => a === `--${k}`);
    return i === -1 ? def : argv[i + 1];
  };
  const league = arg("league");
  const namesStr = arg("names");
  const names = namesStr ? namesStr.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  if (!league && !names) {
    console.error(
      "Usage: tsx scripts/claude-translate-team-names.ts --league <CODE> | --names 'A,B,C' [--max 30]",
    );
    process.exit(1);
  }
  return { league, names, max: Number(arg("max", "30")) };
}

async function findUntranslated(league: string): Promise<string[]> {
  const teams = await prisma.team.findMany({
    where: { league },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  return teams
    .filter((t) => toKoreanTeamName(t.name, league) === t.name)
    .map((t) => t.name);
}

async function main() {
  const args = parseArgs();
  let names: string[];
  if (args.names) {
    names = args.names;
    console.log(`▶ 직접 지정 ${names.length}개`);
  } else {
    names = await findUntranslated(args.league!);
    console.log(`▶ ${args.league} 미매핑: ${names.length}개`);
  }
  const targets = names.slice(0, args.max);

  if (targets.length === 0) {
    console.log("✅ 처리할 팀 없음");
    await prisma.$disconnect();
    return;
  }

  const prompt = `다음 축구 클럽명을 한국어 표기로 음역하시오.

[규칙]
- 국립국어원 외래어 표기법 + 한국 스포츠 미디어 굳어진 관행 우선
- 출력 형식: "원문 => 한국어" 한 줄씩
- 줄 번호 없이, 설명 없이, JSON 없이, 그저 매핑만
- 약자(FC, BSC, SC 등)는 한국 미디어 표기 따름 (예: "FC 샬케 04", "헤르타 BSC")
- 한자/카타카나/태국어 등 다른 문자 절대 섞지 말 것

[원문 목록]
${targets.map((n) => `- ${n}`).join("\n")}`;

  console.log(`▶ Claude 호출 중 (${targets.length}개)...`);
  const t0 = Date.now();
  const result = await generate(prompt, { temperature: 0.1, maxTokens: 2000 });
  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  ${dur}s\n`);

  // 파싱: "원문 => 한국어"
  const lines = result.split("\n").map((l) => l.trim()).filter(Boolean);
  const suggestions: Array<{ en: string; ko: string }> = [];
  for (const ln of lines) {
    const cleaned = ln.replace(/^[-*•·\d.)\s]+/, "");
    const m = cleaned.match(/^(.+?)\s*(?:=>|→|->)\s*(.+)$/);
    if (m) {
      suggestions.push({ en: m[1].trim(), ko: m[2].trim() });
    }
  }

  // 결과 출력
  console.log("=== 결과 ===\n");
  for (const s of suggestions) {
    console.log(`  "${s.en}": "${s.ko}",`);
  }

  // 누락 체크
  const matched = new Set(suggestions.map((s) => s.en.toLowerCase()));
  const missing = targets.filter((t) => !matched.has(t.toLowerCase()));
  if (missing.length > 0) {
    console.log(`\n⚠️ 누락 (${missing.length}개) — 수동 확인:`);
    for (const m of missing) console.log(`  // FIXME: "${m}": "?",`);
  }

  // 저장
  const date = new Date().toISOString().slice(0, 10);
  const baseDir = path.join(process.cwd(), "data", "translations");
  await fs.mkdir(baseDir, { recursive: true });
  const suffix = args.league ?? "custom";
  const snippetPath = path.join(baseDir, `team-${suffix}-${date}.claude.snippet.ts`);
  const lines2 = [
    `// Claude API 결과 ${date} — ${suggestions.length}건 (${missing.length} missing)`,
    `// 검토 후 src/lib/team-names.ts 에 paste`,
    "",
    ...suggestions.map((s) => `  "${s.en}": "${s.ko}",`),
    ...missing.map((m) => `  // FIXME: "${m}": "?",`),
    "",
  ];
  await fs.writeFile(snippetPath, lines2.join("\n"), "utf-8");
  console.log(`\n✅ ${snippetPath}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
