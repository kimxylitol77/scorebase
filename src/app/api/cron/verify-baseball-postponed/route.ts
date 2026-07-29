// 야구 미래 POSTPONED 오분류 재대조 cron — 소스가 NS 로 정정한 매치를 SCHEDULED 로 되돌린다.
// league-sim-snapshot(22:00 UTC) 직전에 돌아 시즌 시뮬이 정확한 잔여 일정을 쓰게 한다.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { sendTelegram } from "@/lib/notify/telegram";
import { runVerifyBaseballPostponed } from "@/jobs/verify-baseball-postponed";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
// api-baseball 시즌 전량 조회 3회(KBO·NPB·MLB) + updateMany
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const results = await runVerifyBaseballPostponed({ apply: true });
    const total = results.reduce((s, r) => s + r.fixed, 0);
    await recordCronRun("verify-baseball-postponed", { count: total });

    // 정정이 0건이면 조용히 — 데이터를 바꿨을 때만 알린다.
    if (total > 0) {
      const lines = results
        .filter((r) => r.fixed > 0)
        .map((r) => `${r.league}: ${r.fixed}건 정정 (미래 POSTPONED ${r.checked}건 중)`)
        .join("\n");
      const keptLines = results
        .filter((r) => Object.keys(r.kept).length > 0)
        .map((r) => `${r.league}: ${JSON.stringify(r.kept)}`)
        .join("\n");
      await sendTelegram(
        `⚾ <b>야구 미래 POSTPONED ${total}건 → SCHEDULED 정정</b>\n\n` +
          `📍 <b>무엇</b>: 킥오프가 미래인데 POSTPONED 인 매치를 api-baseball 원본과 재대조\n` +
          `💥 <b>영향</b>: monte-carlo 는 SCHEDULED 만 시뮬 — 방치 시 /predictions 잔여 일정 과소 계산\n` +
          `🔍 <b>원인</b>: 시즌 백필 시점 소스가 CANC 응답 + collect 는 +7일 창만 봐서 재방문 없음\n\n` +
          `<code>${lines}</code>` +
          (keptLines ? `\n\n<b>유지 (소스가 여전히 연기·취소)</b>:\n<code>${keptLines}</code>` : ""),
        { parseMode: "HTML" },
      );
    }
    return NextResponse.json({ ok: true, total, results });
  } catch (e) {
    await recordCronRun("verify-baseball-postponed", {
      ok: false,
      error: (e as Error).message,
    });
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  } finally {
    await prisma.$disconnect();
  }
}
