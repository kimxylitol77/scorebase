// GET /api/internal/threads-queue
// Mac mini threads-auto-poster 워커가 "지금 Threads 에 올릴 항목"을 받아가는 큐.
// Bearer auth: INTERNAL_API_TOKEN.
//
// 정책 (2026-06-24~): scorebase 기능 소개를 **하루 1건** 로테이션 발행.
//   - KST 발행시각(기본 08:00) 이후 & 오늘자 미발행이면 → 오늘의 기능 1건.
//   - 어떤 기능인지는 날짜 기반 순환(featureForDate). 7개 풀, 일주일 주기.
//   - dedup: ThreadsPost(kind="FEATURE", refKey="feature-YYYY-MM-DD").
//   (이전의 오늘경기 카드 DAILY_MATCHES / 신규블로그 BLOG 자동발행은 중단)
//
// 응답: { ok, count, items: [{ kind, refKey, text, imageUrl }] }
// 워커는 발행 성공 후 POST /api/internal/threads-posted 로 이력을 남긴다.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SITE_URL, snsLink } from "@/lib/site-url";
import { kstDayWindow, kstHour } from "@/lib/threads/kst";
import { buildFeatureCaption } from "@/lib/threads/caption";
import { featureForDate } from "@/lib/threads/features";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAILY_HOUR_KST = Number(process.env.THREADS_DAILY_HOUR ?? "8");

interface QueueItem {
  kind: string;
  refKey: string;
  text: string;
  imageUrl: string | null;
}

function unauthorized(msg = "Unauthorized") {
  return NextResponse.json({ error: msg }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized("INTERNAL_API_TOKEN unset");
  if (auth !== expected) return unauthorized();

  const items: QueueItem[] = [];

  // ── 오늘의 기능 소개 (하루 1건, 날짜 로테이션) ──
  const { dateKey } = kstDayWindow();
  if (kstHour() >= DAILY_HOUR_KST) {
    const refKey = `feature-${dateKey}`;
    const already = await prisma.threadsPost.findUnique({
      where: { kind_refKey: { kind: "FEATURE", refKey } },
    });
    if (!already) {
      const f = featureForDate(dateKey);
      items.push({
        kind: "FEATURE",
        refKey,
        text: buildFeatureCaption(f, { url: snsLink(f.path, "threads") }),
        imageUrl: `${SITE_URL}/api/og/feature?key=${f.key}&d=${dateKey}`,
      });
    }
  }

  return NextResponse.json({ ok: true, count: items.length, items });
}
