// LLM 호출 계측 — (태그, 모델, 시간) 버킷에 토큰을 누적하고 단가표로 비용을 환산한다.
//
// 왜 필요한가. api-football 은 AfUsageStat 으로 호출을 귀속시켜 왔지만 LLM 쪽은
// 토큰·비용을 기록하는 코드가 아예 없어, 글 생성이 하루 얼마를 쓰는지 측정 자체가
// 불가능했다(2026-08-17 실측). 루프의 안전장치 4겹 중 "비용 한도" 겹이 비어 있던 셈.
//
// 설계 원칙.
//  - 계측이 본 기능을 절대 방해하지 않는다. 기록 실패는 조용히 삼킨다.
//  - 호출마다 row 를 쌓지 않는다. (tag, model, 정시) 버킷에 누적 upsert.
//  - 비용은 저장하지 않는다. 단가가 바뀌면 표만 고치면 과거분도 다시 계산된다.

import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "@/lib/db";

const tagStore = new AsyncLocalStorage<string>();

/**
 * 이 안에서 일어나는 모든 LLM 호출을 하나의 태그로 귀속시킨다.
 * cron 라우트가 잡 함수를 감싸는 용도 — 잡 함수까지 인자를 관통시키지 않아도 되고,
 * 모듈 전역 변수와 달리 서버리스 동시 요청에서 서로 오염되지 않는다.
 */
export function withLlmTag<T>(tag: string, fn: () => Promise<T>): Promise<T> {
  return tagStore.run(tag, fn);
}

/**
 * 실행 진입점 파일명에서 태그를 유추한다 — `npx tsx src/jobs/xxx.ts` 처럼
 * cron 라우트를 안 거치고 직접 도는 잡·스크립트(맥미니 launchd, 수동 실행)를
 * 위한 것. 이게 없으면 그런 실행분이 전부 "unknown" 으로 뭉쳐 알림이 범인을
 * 못 가린다(2026-08-19 $8 급증이 그랬다).
 *
 * 웹 서버 프로세스의 argv[1] 은 Next 런타임이라 오히려 해가 되므로,
 * repo 의 잡·스크립트 경로일 때만 쓴다.
 */
function entryScriptTag(): string | null {
  const argv1 = process.argv[1];
  if (!argv1) return null;
  const m = /\/(src\/jobs|scripts)\/([\w.-]+)\.(ts|mts|js|mjs)$/.exec(argv1);
  if (!m) return null;
  return `${m[1] === "scripts" ? "script" : "job"}:${m[2]}`;
}

/** 현재 컨텍스트의 태그. 잡 스크립트는 LLM_TAG env 로도 지정할 수 있다. */
export function currentLlmTag(): string {
  return tagStore.getStore() ?? process.env.LLM_TAG ?? entryScriptTag() ?? "unknown";
}

function hourBucket(): Date {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  return d;
}

/**
 * 호출 1건 기록. 토큰 수를 모르면(예외 경로) 부르지 않는다 — calls 만 세는 건
 * 비용 계기판에 도움이 안 되고, 실패 호출은 대체로 과금되지 않는다.
 */
export async function trackLlmUsage(
  model: string,
  inTokens: number,
  outTokens: number,
  tag: string = currentLlmTag(),
): Promise<void> {
  try {
    const hour = hourBucket();
    await prisma.llmUsageStat.upsert({
      where: { tag_model_hour: { tag, model, hour } },
      create: { tag, model, hour, calls: 1, inTokens, outTokens },
      update: {
        calls: { increment: 1 },
        inTokens: { increment: inTokens },
        outTokens: { increment: outTokens },
      },
    });
  } catch {
    // 계측 실패가 글 생성을 막아선 안 된다
  }
}

/**
 * 100만 토큰당 USD. 모델 id **접두사**로 매칭한다(날짜 suffix 흡수).
 *
 * ⚠️ 더 구체적인 접두사를 먼저 둘 것 — 앞에서부터 first-match 라
 *    "gpt-4o" 가 "gpt-4o-mini" 보다 앞에 있으면 mini 가 4o 단가로 잡힌다.
 * ⚠️ 캐시 입력 할인가는 반영하지 않는다(프롬프트 캐싱 미사용).
 * 출처 — Anthropic 공식 가격표(claude-api 스킬, 2026-06-24) /
 *        OpenAI developers.openai.com/api/docs/pricing (2026-08-17 조회).
 * 표에 없는 모델은 비용 null — 토큰은 그대로 남으므로 단가만 추가하면 소급 계산된다.
 */
const PRICING: { prefix: string; in: number; out: number }[] = [
  { prefix: "claude-haiku-4-5", in: 1.0, out: 5.0 },
  // sonnet-5 는 2026-08-31 까지 인트로 $2/$10 이나 정가로 둔다(상한 추정).
  { prefix: "claude-sonnet-5", in: 3.0, out: 15.0 },
  { prefix: "claude-sonnet-4-6", in: 3.0, out: 15.0 },
  { prefix: "claude-opus-5", in: 5.0, out: 25.0 },
  { prefix: "gpt-4o-mini", in: 0.15, out: 0.6 }, // gpt-4o 보다 반드시 앞
  { prefix: "gpt-4o", in: 2.5, out: 10.0 },
  { prefix: "gpt-5.5", in: 5.0, out: 30.0 },
  // gpt-5.6 은 변형별로 단가가 25배 차이(luna/terra/sol)라 **총칭 "gpt-5.6" 은 일부러
  // 등록하지 않는다.** 응답의 실제 모델명(res.model)이 변형까지 알려주면 그때 매칭된다.
  { prefix: "gpt-5.6-luna", in: 0.2, out: 1.2 },
  { prefix: "gpt-5.6-terra", in: 2.0, out: 12.0 },
  { prefix: "gpt-5.6-sol", in: 5.0, out: 30.0 },
];

/** 토큰 → USD. 단가를 모르는 모델이면 null (모른다고 말하는 편이 0 보다 낫다). */
export function estimateCostUsd(
  model: string,
  inTokens: number,
  outTokens: number,
): number | null {
  const p = PRICING.find((x) => model.startsWith(x.prefix));
  if (!p) return null;
  return (inTokens * p.in + outTokens * p.out) / 1_000_000;
}

export interface LlmUsageRow {
  tag: string;
  model: string;
  calls: number;
  inTokens: number;
  outTokens: number;
  costUsd: number | null; // 단가 미등록 모델은 null
}

export interface LlmDailyRow {
  /** KST 기준 날짜 (YYYY-MM-DD) */
  date: string;
  calls: number;
  inTokens: number;
  outTokens: number;
  costUsd: number;
  /** 단가 미등록 모델이 섞여 costUsd 가 실제보다 작을 수 있음 */
  hasUnpriced: boolean;
}

/**
 * 최근 N일 사용량을 KST 날짜별로 합산. 추이 그래프용.
 * hour 버킷은 UTC 라 DB 에서 날짜로 못 묶는다(9시간 밀림) — 행이 적으므로 JS 에서 묶는다.
 */
export async function llmUsageDaily(days: number): Promise<LlmDailyRow[]> {
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await prisma.llmUsageStat.findMany({
    where: { hour: { gte: since } },
    select: { hour: true, model: true, calls: true, inTokens: true, outTokens: true },
  });

  const byDate = new Map<string, LlmDailyRow>();
  for (const r of rows) {
    // UTC+9 로 옮긴 뒤 UTC 날짜를 읽으면 KST 날짜가 된다
    const date = new Date(r.hour.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
    const cur =
      byDate.get(date) ??
      { date, calls: 0, inTokens: 0, outTokens: 0, costUsd: 0, hasUnpriced: false };
    const cost = estimateCostUsd(r.model, r.inTokens, r.outTokens);
    cur.calls += r.calls;
    cur.inTokens += r.inTokens;
    cur.outTokens += r.outTokens;
    if (cost == null) cur.hasUnpriced = true;
    else cur.costUsd += cost;
    byDate.set(date, cur);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** 최근 N시간 사용량을 (태그, 모델) 단위로 합산. 비용 계기판용. */
export async function llmUsageSince(hours: number): Promise<LlmUsageRow[]> {
  const since = new Date(Date.now() - hours * 3600_000);
  const rows = await prisma.llmUsageStat.groupBy({
    by: ["tag", "model"],
    where: { hour: { gte: since } },
    _sum: { calls: true, inTokens: true, outTokens: true },
  });
  return rows
    .map((r) => {
      const inTokens = r._sum.inTokens ?? 0;
      const outTokens = r._sum.outTokens ?? 0;
      return {
        tag: r.tag,
        model: r.model,
        calls: r._sum.calls ?? 0,
        inTokens,
        outTokens,
        costUsd: estimateCostUsd(r.model, inTokens, outTokens),
      };
    })
    .sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0));
}
