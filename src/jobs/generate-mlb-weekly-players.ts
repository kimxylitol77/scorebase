// MLB 주간 베스트 선수 ANALYSIS 자동 발행 — statsapi 주간 타자/투수 리더 기반. 주 1회.
// 팀 주간 리뷰(generate-baseball-weekly-review)와 같은 발행 골격. 같은 주 재실행은 slug 로 스킵.
// 사용: npm run job:mlb-weekly-players  (특정 날짜: -- 2026-07-14 [--dry])
import "@/lib/env";
import { prisma } from "@/lib/db";
import { generateWithMinLength } from "@/lib/ai/generate-with-min-length";
import { SYSTEM_PROMPT } from "@/prompts/system";
import {
  buildMlbWeeklyPlayers,
  serializeMlbWeeklyFacts,
  checkMlbWeeklyFaithfulness,
  type MlbWeeklyPlayersData,
  type FaithfulnessResult,
} from "@/lib/sports/baseball/mlb-weekly-players";
import {
  buildMlbWeeklyPlayersPrompt,
  MLB_WEEKLY_PLAYERS_RUBRIC,
} from "@/prompts/baseball-weekly-players";
import { judgeArticle, formatJudgeVerdict, type JudgeResult } from "@/lib/ai/article-judge";

function extractTitle(md: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "MLB 주간 베스트 선수";
}

/** 그 주 월요일(KST) 날짜 — 주 단위 idempotent slug 용. */
function weekStartKst(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 3600000);
  const day = kst.getUTCDay() || 7; // 월=1 … 일=7
  const monday = new Date(kst.getTime() - (day - 1) * 86400000);
  return monday.toISOString().slice(0, 10);
}

interface RunOpts {
  refDate?: Date;
  dry?: boolean; // 프롬프트만 출력(생성·판정·발행 없음, 무비용)
  review?: boolean; // 생성 + 심판관 판정 + 본문/판정 출력. 발행은 안 함(검수용)
}

interface Attempt {
  content: string;
  det: FaithfulnessResult; // 결정론 팩트 검증(권위)
  verdict: JudgeResult; // LLM 심판관(페르소나/SEO — 팩트는 참고용)
  llmHard: JudgeResult["issues"]; // LLM 의 비-팩트 BLOCKER(예: 베팅 어조)
}

/** 결정론 팩트 blocker 또는 LLM 의 비-팩트 BLOCKER 가 있으면 발행 차단. */
function isHardFail(a: Attempt): boolean {
  return a.det.blockers.length > 0 || a.llmHard.length > 0;
}

function logAttempt(a: Attempt, retry = false) {
  const tag = retry ? "재검증" : "검증";
  console.log(
    `[mlb-weekly-players] ${tag} · 팩트 blocker ${a.det.blockers.length} warn ${a.det.warnings.length} · ${formatJudgeVerdict(a.verdict)}`,
  );
  for (const b of a.det.blockers) console.log(`   [팩트-BLOCKER] ${b}`);
  for (const w of a.det.warnings) console.log(`   [팩트-warn] ${w}`);
  for (const i of a.llmHard) console.log(`   [LLM-BLOCKER] ${i.dimension}: ${i.message}`);
}

/** 본문 생성 → 결정론 팩트검증 + LLM 심판관. 하드 FAIL 이면 지적을 붙여 1회 교정 재생성. */
async function generateAndJudge(
  prompt: string,
  data: MlbWeeklyPlayersData,
  facts: string,
): Promise<Attempt | null> {
  const genOpts = {
    system: SYSTEM_PROMPT,
    maxTokens: 9000,
    temperature: 0.6,
    minLength: 2200,
    label: "mlb-weekly-players",
  };

  const attempt = async (p: string): Promise<Attempt | null> => {
    const content = await generateWithMinLength(p, genOpts);
    if (!content) return null;
    const det = checkMlbWeeklyFaithfulness(content, data); // 결정론(무비용·정확)
    const verdict = await judgeArticle({
      content,
      sourceFacts: facts,
      rubric: MLB_WEEKLY_PLAYERS_RUBRIC,
      label: "mlb-weekly-players",
    });
    // LLM 의 팩트 판정은 불안정 → 참고용. 페르소나/SEO 의 BLOCKER 만 하드 게이트에 반영.
    const llmHard = verdict.issues.filter(
      (i) => i.dimension !== "faithfulness" && i.severity === "BLOCKER",
    );
    return { content, det, verdict, llmHard };
  };

  let r = await attempt(prompt);
  if (!r) return null;
  logAttempt(r);

  if (isHardFail(r)) {
    const fixes = [
      ...r.det.blockers.map((b) => `- [팩트 오류] ${b}`),
      ...r.llmHard.map((i) => `- [${i.dimension}] ${i.message}`),
    ].join("\n");
    console.log("[mlb-weekly-players] 하드 FAIL — 교정 재생성 1회");
    const fixPrompt = `${prompt}\n\n[검수 지적 — 아래를 반드시 고쳐 처음부터 다시 작성. 표 수치는 원천 데이터와 정확히 일치시키고, 원천에 없는 선수·수치는 절대 쓰지 말 것]\n${fixes}`;
    const retry = await attempt(fixPrompt);
    if (retry) {
      r = retry;
      logAttempt(r, true);
    }
  }

  return r;
}

export async function runMlbWeeklyPlayers(opts: RunOpts = {}) {
  const refDate = opts.refDate ?? new Date();
  console.log("[mlb-weekly-players] 시작");

  try {
    const slug = `mlb-players-weekly-${weekStartKst(refDate)}`;
    const existing = await prisma.article.findUnique({ where: { slug } });
    if (existing && !opts.review) {
      console.log(`[mlb-weekly-players] 이번 주 글 이미 있음 (#${existing.id}) — 스킵`);
      return;
    }

    const data = await buildMlbWeeklyPlayers(refDate);
    if (!data) {
      console.log("[mlb-weekly-players] 자격 선수 부족(비시즌·얇은 주) — 스킵");
      return;
    }

    const prompt = buildMlbWeeklyPlayersPrompt(data);
    if (opts.dry) {
      console.log(`\n===== [DRY] → ${slug} =====`);
      console.log(prompt);
      return;
    }

    const facts = serializeMlbWeeklyFacts(data);
    const r = await generateAndJudge(prompt, data, facts);
    if (!r) {
      console.log("[mlb-weekly-players] 본문 길이 미달 — 스킵");
      return;
    }

    // 검수 모드 — 본문·판정만 출력하고 발행하지 않는다.
    if (opts.review) {
      console.log(`\n===== [REVIEW] → ${slug} =====`);
      console.log(r.content);
      console.log(`\n----- 검증 결과 -----`);
      console.log(JSON.stringify({ hardFail: isHardFail(r), det: r.det, verdict: r.verdict }, null, 2));
      return;
    }

    // 하드 FAIL(교정 후에도)이면 발행 차단 — 근거 없는 수치가 남아 있을 수 있다.
    if (isHardFail(r)) {
      console.error("[mlb-weekly-players] ❌ 검수 하드 FAIL — 발행 차단:");
      for (const b of r.det.blockers) console.error(`   [팩트] ${b}`);
      for (const i of r.llmHard) console.error(`   [${i.dimension}] ${i.message}`);
      return;
    }

    const title = extractTitle(r.content);
    const article = await prisma.article.create({
      data: {
        type: "ANALYSIS",
        league: "MLB",
        title,
        slug,
        content: r.content,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    console.log(
      `[mlb-weekly-players] ✅ #${article.id} ${title} (${r.content.length}자) → /articles/${slug} · 게이트 통과(팩트 blocker 0·warn ${r.det.warnings.length}, 페르소나 ${r.verdict.persona} SEO ${r.verdict.seo})`,
    );
  } catch (e) {
    console.error("[mlb-weekly-players] 실패:", (e as Error).message?.slice(0, 160));
  }

  console.log("[mlb-weekly-players] 완료");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const review = args.includes("--review");
  const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  runMlbWeeklyPlayers({
    refDate: dateArg ? new Date(`${dateArg}T12:00:00+09:00`) : undefined,
    dry,
    review,
  })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
