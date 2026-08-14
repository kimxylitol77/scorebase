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
// 추가 (2026-08-13): 경기 프리뷰 수치카드를 **하루 1건** 더 발행 → 총 2건/일.
//   - 기능 소개 7종은 주 단위로 같은 내용이 반복된다. 매일 바뀌는 콘텐츠가 하나도 없어
//     팔로워에겐 같은 광고가 도는 것으로 읽힌다. 프리뷰 카드는 매일 다른 경기다.
//   - 예전 DAILY_MATCHES 와 다르다: 그건 "오늘 경기 목록" 나열이었고, 이건 경기 1건에
//     분석 수치 3개(승률·맞대결/폼/배당·Strong Pick)를 얹은 카드다.
//   - 발행시각 기본 11:00 KST — 예측은 킥오프 임박해야 채워지고(pick-readiness 게이트),
//     KBO 는 선발이 10:30 이후에 들어온다. 08:00 에 내면 야구가 통째로 빠진다.
//   - 낼 경기가 없거나 예측이 없으면 그냥 큐에 안 넣는다(빈 카드 금지).
//   - dedup: ThreadsPost(kind="PREVIEW", refKey="preview-YYYY-MM-DD").
//
// 응답: { ok, count, items: [{ kind, refKey, text, imageUrl }] }
// 워커는 발행 성공 후 POST /api/internal/threads-posted 로 이력을 남긴다.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SITE_URL, snsLink } from "@/lib/site-url";
import { kstDayWindow, kstHour } from "@/lib/threads/kst";
import { buildFeatureCaption, buildPreviewCaption } from "@/lib/threads/caption";
import { featureForDate } from "@/lib/threads/features";
import { buildPreviewCard, pickCardMatch } from "@/lib/predict/preview-card";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAILY_HOUR_KST = Number(process.env.THREADS_DAILY_HOUR ?? "8");
const PREVIEW_HOUR_KST = Number(process.env.THREADS_PREVIEW_HOUR ?? "11");
/** /previews/[league] 가 실제로 존재하는 리그 (그 페이지의 LEAGUES 키와 일치시킬 것). */
const PREVIEW_PAGE_LEAGUES = new Set(["NPB", "KBO", "MLB"]);

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

  // ── 오늘의 경기 프리뷰 수치카드 (하루 1건) ──
  if (kstHour() >= PREVIEW_HOUR_KST) {
    const refKey = `preview-${dateKey}`;
    const already = await prisma.threadsPost.findUnique({
      where: { kind_refKey: { kind: "PREVIEW", refKey } },
    });
    if (!already) {
      const matchId = await pickCardMatch(24);
      const card = matchId ? await buildPreviewCard(matchId) : null;
      // 예측이 아직 없으면 큐잉하지 않는다. 다음 폴링에서 다시 시도된다.
      if (card) {
        // 단일 경기 페이지는 없다. 프리뷰 페이지가 있는 야구 3리그만 그쪽으로,
        // 나머지(축구·농구 등)는 /scores 로 보낸다. 없는 경로로 보내면 404 다.
        const landing = PREVIEW_PAGE_LEAGUES.has(card.league)
          ? `/previews/${card.league}`
          : "/scores";
        items.push({
          kind: "PREVIEW",
          refKey,
          text: buildPreviewCaption(
            { ...card, leagueLabel: LEAGUE_DISPLAY[card.league] ?? card.league },
            { url: snsLink(landing, "threads") },
          ),
          imageUrl: `${SITE_URL}/api/og/preview-card?m=${card.matchId}`,
        });
      }
    }
  }

  return NextResponse.json({ ok: true, count: items.length, items });
}
