// scripts/ollama-translate-team-names.ts
// Ollama (Mac mini, Qwen 2.5 14B) 로 미매핑 축구 팀명 한글 음역 일괄 제안.
//
// 사용 예:
//   npx tsx scripts/ollama-translate-team-names.ts --league SERIE_B
//   npx tsx scripts/ollama-translate-team-names.ts --league LIGUE_2 --max 50
//   npx tsx scripts/ollama-translate-team-names.ts --league CHAMPIONSHIP --model llama3.1:8b
//
// 환경:
//   - DATABASE_URL — Neon scorebase DB
//   - OLLAMA_HOST  — 기본 http://localhost:11434 (Mac mini 에서 직접 실행 시)
//                    맥북에서 실행 시 케이블 직결 http://169.254.190.8:11434 사용
//
// 출력:
//   data/translations/team-{league}-{date}.json       (raw, 검토용)
//   data/translations/team-{league}-{date}.snippet.ts (paste-ready, team-names.ts 에 복사)
//
// 안전:
//   - dry-run only — DB 변경 X, team-names.ts 자동 수정 X
//   - 모든 제안은 사용자가 검토 후 수동 paste

import axios from "axios";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { prisma } from "../src/lib/db";
import { toKoreanTeamName } from "../src/lib/team-names";

interface Args {
  league: string;
  max: number;
  model: string;
  host: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const arg = (k: string, def?: string): string | undefined => {
    const i = argv.findIndex((a) => a === `--${k}`);
    return i === -1 ? def : argv[i + 1];
  };

  const league = arg("league");
  if (!league) {
    console.error(
      "Usage: tsx scripts/ollama-translate-team-names.ts --league <CODE> [--max 30] [--model qwen2.5:14b] [--host http://localhost:11434]",
    );
    console.error("예: tsx scripts/ollama-translate-team-names.ts --league SERIE_B");
    process.exit(1);
  }

  return {
    league,
    max: Number(arg("max", "30")),
    model: arg("model", "qwen2.5:14b")!,
    host: arg("host", process.env.OLLAMA_HOST ?? "http://localhost:11434")!,
  };
}

async function findUntranslated(league: string): Promise<{ name: string; shortName: string | null }[]> {
  const teams = await prisma.team.findMany({
    where: { league },
    select: { name: true, shortName: true },
    orderBy: { name: "asc" },
  });

  // toKoreanTeamName 이 원본 그대로 반환하면 매핑 없음 (fallback 동작)
  return teams.filter((t) => {
    const ko = toKoreanTeamName(t.name, league);
    return ko === t.name;
  });
}

/** Ollama 호출 — 1개 팀명 → 한글 표기 1줄.
 *  temperature 낮게 (0.1) — 일관성 우선. */
async function askOllama(host: string, model: string, league: string, name: string): Promise<string> {
  const prompt = `너는 한국 스포츠 미디어 편집자다. 다음 축구 클럽명을 한국어 표기로 음역하시오.

[규칙]
- 국립국어원 외래어 표기법 + 한국 스포츠 미디어 굳어진 관행 우선
- "FC" / "AC" / "AFC" 등 접두어/접미어는 통상 한국어 표기에 포함 (예: "Inter Milan" → "인터 밀란", "Real Sociedad" → "레알 소시에다드")
- 짧고 깔끔하게. 1줄.
- 설명·인사·코드블럭 금지. 한국어 표기만 출력.

[리그] ${league}
[원문] ${name}
[한국어]`;

  const { data } = await axios.post(
    `${host}/v1/chat/completions`,
    {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 60,
    },
    { timeout: 120_000 },
  );

  const raw: string = data.choices?.[0]?.message?.content?.trim() ?? "";
  // 첫 줄만 + 따옴표/마커 제거
  return raw
    .split(/\n/)[0]
    .trim()
    .replace(/^[-•·]\s*/, "")
    .replace(/^["'""「『]|["'""」』]$/g, "")
    .trim();
}

interface Suggestion {
  en: string;
  shortName: string | null;
  ko: string;
  /** Ollama 응답이 이상하면 (한글 0자, 너무 김 등) 표시 */
  flagged: boolean;
}

function isSuspicious(en: string, ko: string): boolean {
  if (!ko) return true;
  if (ko.length > en.length * 3) return true; // 너무 김
  if (ko.length < 1) return true;
  // 한글 문자 비율 낮으면 의심
  const hangulCount = [...ko].filter((c) => /[가-힣]/.test(c)).length;
  if (hangulCount / ko.length < 0.5) return true;
  return false;
}

async function main() {
  const args = parseArgs();
  console.log(`▶ 미매핑 팀 검색 (league=${args.league})...`);

  const untranslated = await findUntranslated(args.league);
  console.log(`   미매핑: ${untranslated.length}개`);

  if (untranslated.length === 0) {
    console.log("✅ 미매핑 팀 없음 — 종료");
    await prisma.$disconnect();
    return;
  }

  const targets = untranslated.slice(0, args.max);
  console.log(`   처리 대상 (max ${args.max}): ${targets.length}개`);
  console.log(`   ollama: ${args.host} model=${args.model}\n`);

  const suggestions: Suggestion[] = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const tag = `[${i + 1}/${targets.length}]`;
    process.stdout.write(`${tag} ${t.name} ... `);
    try {
      const t0 = Date.now();
      const ko = await askOllama(args.host, args.model, args.league, t.name);
      const dur = Date.now() - t0;
      const flagged = isSuspicious(t.name, ko);
      suggestions.push({ en: t.name, shortName: t.shortName, ko, flagged });
      console.log(`→ ${ko}${flagged ? " ⚠️" : ""} (${dur}ms)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`✗ ${msg}`);
      suggestions.push({ en: t.name, shortName: t.shortName, ko: "", flagged: true });
    }
  }

  // ── output ──────────────────────────────────────
  const date = new Date().toISOString().slice(0, 10);
  const baseDir = path.join(process.cwd(), "data", "translations");
  await fs.mkdir(baseDir, { recursive: true });

  const jsonPath = path.join(baseDir, `team-${args.league}-${date}.json`);
  const snippetPath = path.join(baseDir, `team-${args.league}-${date}.snippet.ts`);

  await fs.writeFile(
    jsonPath,
    JSON.stringify(
      { league: args.league, model: args.model, date, count: suggestions.length, suggestions },
      null,
      2,
    ),
    "utf-8",
  );

  // paste-ready snippet
  const lines: string[] = [
    `// ${args.league} — Ollama ${args.model} 제안 ${date} (${suggestions.length}건)`,
    `// 검토 후 src/lib/team-names.ts 의 RAW 객체에 paste.`,
    `// ⚠️ 표시는 의심 결과 (수동 확인 필수)`,
    "",
  ];
  for (const s of suggestions) {
    if (!s.ko) {
      lines.push(`  // FIXME (empty): "${s.en}": "?",`);
    } else if (s.flagged) {
      lines.push(`  // ⚠️ "${s.en}": "${s.ko}",`);
    } else {
      lines.push(`  "${s.en}": "${s.ko}",`);
    }
  }
  await fs.writeFile(snippetPath, lines.join("\n") + "\n", "utf-8");

  const flaggedCount = suggestions.filter((s) => s.flagged).length;
  console.log(`\n✅ 결과 저장:`);
  console.log(`   ${jsonPath}`);
  console.log(`   ${snippetPath}`);
  console.log(`\n📊 요약: ${suggestions.length}개 (정상 ${suggestions.length - flaggedCount}, 의심 ${flaggedCount})`);
  console.log(`\n다음:\n  1. ${snippetPath} 검토`);
  console.log(`  2. 정상 항목 — src/lib/team-names.ts 의 RAW 객체 끝에 paste`);
  console.log(`  3. ⚠️/FIXME 항목 — 수동 확인 후 추가`);
  console.log(`  4. git diff 확인 + commit`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
