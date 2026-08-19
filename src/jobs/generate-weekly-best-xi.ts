// 축구 리그 주간 베스트 XI·MVP 자동 발행 — ts 평점 기반. 빅5 주 1회(화요일 발행 기준).
// 같은 주 재실행은 slug 로 스킵. 집계 창은 라운드가 아니라 지난 7일(리그별 라운드가 겹쳐 흐름).
// 사용: npm run job:weekly-xi  (특정 리그/날짜: -- --league=LALIGA --end=2026-08-19 [--dry])
import "@/lib/env";
import { prisma } from "@/lib/db";
import { generateWithMinLength } from "@/lib/ai/generate-with-min-length";
import { SYSTEM_PROMPT } from "@/prompts/system";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import {
  getWeeklyBestXi,
  weeklyXiBrief,
  MIN_WEEK_MATCHES,
  WEEKLY_XI_LEAGUES,
  type WeeklyBestXi,
} from "@/lib/soccer/weekly-best-xi";
import { buildWeeklyXiPrompt } from "@/prompts/weekly-best-xi";

const MIN_LENGTH = 1200;
const MODEL = process.env.WEEKLY_XI_MODEL || "claude-sonnet-5";

/**
 * 결정론적 팩트 게이트 — 본문이 인용한 평점이 실제 데이터에 있는 값인지 확인한다.
 * LLM 판정은 불안정하므로 수치 대조만 하드 게이트로 둔다(야구 주간 글과 같은 원칙).
 */
export function checkWeeklyXiFacts(content: string, w: WeeklyBestXi): string[] {
  const known = new Set<string>();
  for (const p of [...w.xi, ...w.bench]) {
    known.add(p.rating.toFixed(2));
    known.add(p.rating.toFixed(1));
    known.add(String(p.rating));
  }
  const bad: string[] = [];
  // "평점 8.95" 꼴로 인용된 값만 검사 — 경기 스코어·순위는 대상이 아니다.
  for (const m of content.matchAll(/평점\s*\*{0,2}(\d+\.\d+)/g)) {
    if (!known.has(m[1])) bad.push(`평점 ${m[1]} 은 집계에 없는 값`);
  }
  const names = new Set([...w.xi, ...w.bench].map((p) => p.name));
  for (const m of content.matchAll(/\|\s*\*{0,2}\d+\.\d+\*{0,2}\s*\|\s*\*{0,2}([^|*]+?)\*{0,2}\s*\|/g)) {
    const nm = m[1].trim();
    if (nm && !names.has(nm)) bad.push(`표에 집계 밖 선수 "${nm}"`);
  }
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(content)) bad.push("이모지 포함");
  return [...new Set(bad)];
}

async function runLeague(league: string, end: string | undefined, dry: boolean, draft: boolean): Promise<boolean> {
  const leagueKo = LEAGUE_DISPLAY[league] ?? league;
  const w = await getWeeklyBestXi(league, end);
  if (!w) {
    console.log(`[weekly-xi] ${league} — 이번 주 완료 경기 없음, 스킵`);
    return false;
  }
  if (w.matchCount < MIN_WEEK_MATCHES) {
    console.log(`[weekly-xi] ${league} — ${w.matchCount}경기뿐(최소 ${MIN_WEEK_MATCHES}), 스킵`);
    return false;
  }
  if (!w.complete) {
    console.log(`[weekly-xi] ${league} — 베스트 XI ${w.xi.length}명뿐(평점 결손), 스킵`);
    return false;
  }

  const slug = `${league.toLowerCase()}-weekly-xi-${w.to}`;
  const dup = await prisma.article.findUnique({ where: { slug }, select: { id: true } });
  if (dup) {
    console.log(`[weekly-xi] ${league} — 이번 주 글 이미 있음 (#${dup.id}), 스킵`);
    return false;
  }

  const prompt = buildWeeklyXiPrompt(w, leagueKo);
  if (dry) {
    console.log(`\n===== [DRY] ${slug} =====\n${weeklyXiBrief(w, leagueKo)}\n`);
    return false;
  }

  const content = await generateWithMinLength(prompt, {
    system: SYSTEM_PROMPT,
    model: MODEL,
    maxTokens: 3500,
    temperature: 0.6,
    minLength: MIN_LENGTH,
    timeoutMs: 300_000,
    label: `weekly-xi:${league}`,
  });
  if (!content) {
    console.warn(`[weekly-xi] ${league} — 본문 길이 미달, 스킵`);
    return false;
  }
  const bad = checkWeeklyXiFacts(content, w);
  if (bad.length) {
    console.warn(`[weekly-xi] ${league} — 팩트 게이트 실패, 발행 안 함: ${bad.join(" / ")}`);
    return false;
  }

  const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? `${leagueKo} 주간 베스트 XI — ${w.to}`;
  const a = await prisma.article.create({
    data: {
      type: "ANALYSIS", league, title, slug, content,
      // --draft 는 사람 검수용(첫 편·프롬프트 수정 후). cron 은 항상 자동 발행.
      status: draft ? "DRAFT" : "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  console.log(`[weekly-xi] ${league} 발행: ${slug} (#${a.id}, ${content.length}자, MVP ${w.mvp?.name})`);
  return true;
}

/** @returns 발행 편수 (cron 기록용). */
export async function runWeeklyBestXi(opts: { league?: string; end?: string; dry?: boolean; draft?: boolean } = {}): Promise<number> {
  const leagues = opts.league ? [opts.league] : [...WEEKLY_XI_LEAGUES];
  let n = 0;
  for (const lg of leagues) {
    try {
      if (await runLeague(lg, opts.end, opts.dry ?? false, opts.draft ?? false)) n++;
    } catch (e) {
      // 리그별 격리 — 한 리그 실패가 나머지를 막지 않는다.
      console.error(`[weekly-xi] ${lg} 실패:`, (e as Error).message?.slice(0, 200));
    }
  }
  console.log(`[weekly-xi] 완료 — 발행 ${n}편`);
  return n;
}

if (require.main === module) {
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
  runWeeklyBestXi({
    league: arg("league")?.toUpperCase(),
    end: arg("end"),
    dry: process.argv.includes("--dry"),
    draft: process.argv.includes("--draft"),
  })
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
