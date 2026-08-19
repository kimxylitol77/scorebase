// LLM 비용 임계 감시 cron — 2시간 주기. 계기판(/admin/llm-usage)만 있고 알림이 없던 구멍을 닫는다.
//
// 임계 근거 (2026-08-17 계측 시작 후 실측): 평시 $1.5~2.5/일, 배포 러시일 $9/일,
// 최대 시간당 $4.77. 오늘 누적 $15 = 평시 6배·최대 관측일의 1.7배 — 정상 운영으로는
// 안 닿고 폭주(버그 루프·프롬프트 비대)만 잡는 선.
//
// 알림 규칙.
//  - 오늘(KST) 누적 > $15 → HIGH 텔레그램. 이후 배로 늘 때마다 재알림($30·$60…) —
//    tier = floor(log2(cost/15)) 가 지문이라 같은 tier 는 한 번만 알린다.
//  - 어제(KST) 합계 > $10 → 드리프트 경고 1회 (폭주가 아니라 서서히 오르는 것 감지).
//  - 단가 미등록 모델(openrouter·ollama·xai 패널)은 비용에 안 잡힌다 — 섞인 날은 "+" 표기.
// 발견은 HealthCheck(category="llm-cost") 에 남겨 dedup 상태 파일로 겸용한다(self-heal 패턴).

import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { recordCronRun } from "@/lib/cron-registry";
import { sendTelegram } from "@/lib/notify/telegram";
import { llmUsageDaily, llmUsageSince } from "@/lib/ai/usage-track";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TODAY_HIGH_USD = 15; // 오늘 누적 HIGH 임계 — 실측 평시의 6배
const YESTERDAY_WARN_USD = 10; // 어제 합계 드리프트 경고 임계

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const daily = await llmUsageDaily(3);
  const todayKst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const yesterdayKst = new Date(Date.now() + 9 * 3600_000 - 86400_000).toISOString().slice(0, 10);
  const today = daily.find((d) => d.date === todayKst);
  const yesterday = daily.find((d) => d.date === yesterdayKst);
  const fmt = (d?: { costUsd: number; hasUnpriced: boolean }) =>
    d ? `$${d.costUsd.toFixed(2)}${d.hasUnpriced ? "+" : ""}` : "$0";

  let alerted = 0;

  // ── 오늘 폭주 감시 — tier 가 오를 때만 알림 (0 = $15~30, 1 = $30~60, …)
  if (today && today.costUsd > TODAY_HIGH_USD) {
    const tier = Math.floor(Math.log2(today.costUsd / TODAY_HIGH_USD));
    const already = await prisma.healthCheck.findFirst({
      where: { category: "llm-cost", key: todayKst },
      orderBy: { runAt: "desc" },
      select: { metadata: true },
    });
    const prevTier = ((already?.metadata ?? {}) as { tier?: number }).tier ?? -1;
    if (tier > prevTier) {
      // 태그별 상위 — KST 자정 이후 사용분으로 원인 지목
      const sinceMidnightH = (Date.now() - (new Date(`${todayKst}T00:00:00+09:00`).getTime())) / 3600_000;
      const byTag = new Map<string, number>();
      for (const r of await llmUsageSince(Math.max(1, sinceMidnightH))) {
        if (r.costUsd != null) byTag.set(r.tag, (byTag.get(r.tag) ?? 0) + r.costUsd);
      }
      const top = [...byTag.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
        .map(([t, c]) => `${t} $${c.toFixed(2)}`).join(" · ");
      await prisma.healthCheck.create({
        data: {
          severity: "HIGH",
          category: "llm-cost",
          key: todayKst,
          message: `오늘 LLM 비용 ${fmt(today)} — 임계 $${TODAY_HIGH_USD} 초과 (tier ${tier})`,
          metadata: { tier, costUsd: today.costUsd, topTags: top },
        },
      });
      await sendTelegram(
        [
          `🚨 <b>LLM 비용 급증</b> — 오늘 ${fmt(today)} (임계 $${TODAY_HIGH_USD}${tier > 0 ? ` × 2^${tier}` : ""})`,
          `상위 태그: ${top || "-"}`,
          `어제 ${fmt(yesterday)} · 평시 $1.5~2.5`,
          `➡️ https://www.scorebase.kr/admin/llm-usage`,
        ].join("\n"),
      );
      alerted++;
    }
  }

  // ── 어제 드리프트 경고 — 하루 1회
  if (yesterday && yesterday.costUsd > YESTERDAY_WARN_USD) {
    const key = `y:${yesterdayKst}`;
    const already = await prisma.healthCheck.findFirst({ where: { category: "llm-cost", key }, select: { id: true } });
    if (!already) {
      await prisma.healthCheck.create({
        data: {
          severity: "MED",
          category: "llm-cost",
          key,
          message: `어제 LLM 비용 ${fmt(yesterday)} — 경고 $${YESTERDAY_WARN_USD} 초과`,
          metadata: { costUsd: yesterday.costUsd },
        },
      });
      await sendTelegram(
        [
          `⚠️ <b>LLM 비용 드리프트</b> — 어제 ${fmt(yesterday)} (경고 $${YESTERDAY_WARN_USD})`,
          `➡️ https://www.scorebase.kr/admin/llm-usage`,
        ].join("\n"),
      );
      alerted++;
    }
  }

  await recordCronRun("llm-cost-watch", { count: alerted });
  return NextResponse.json({
    ok: true,
    today: today ? { cost: today.costUsd, unpriced: today.hasUnpriced } : null,
    yesterday: yesterday ? { cost: yesterday.costUsd, unpriced: yesterday.hasUnpriced } : null,
    alerted,
  });
}

// POST 도 동일 허용 — 수동 호출용.
export const POST = GET;
