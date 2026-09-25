// 일정 감시 cron — 빠진 경기·날짜 고착·팀 오매핑을 6시간마다 찾아 멱등 치유는 닫고, 남은 것만 텔레그램 한 통으로
import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { sendTelegram } from "@/lib/notify/telegram";
import { runScheduleWatch, type WatchFinding, type WatchKind } from "@/lib/schedule-watch/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SECTION: Record<WatchKind, string> = {
  "no-collection": "수집 경로 없음 (설정·코드 필요)",
  "missing-ts": "TheSports 리그 누락 (팀 매핑 추정)",
  "heal-exhausted": "자동 재수집 3회 실패 (사람 확인)",
  "drift-held": "날짜 교정 보류 (겹치는 경기)",
  "ts-unmapped": "팀 매핑 없어 버려진 경기 (전 종목)",
  "double-booked": "팀 오매핑 의심 (한 팀 3시간 내 두 경기)",
};

function buildMessage(r: Awaited<ReturnType<typeof runScheduleWatch>>): string {
  const lines = [
    `[일정 감시] 자동 복구 ${r.healedFixtures}경기 · 날짜 교정 ${r.driftFixed}경기 · 확인 필요 ${r.toAlert.length}건`,
  ];
  const byKind = new Map<WatchKind, WatchFinding[]>();
  for (const f of r.toAlert) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);
  for (const [kind, list] of byKind) {
    lines.push("", `■ ${SECTION[kind]} ${list.length}건`);
    for (const f of list.slice(0, 8)) lines.push(`- ${f.text}`);
    if (list.length > 8) lines.push(`  …외 ${list.length - 8}건 (/admin/health schedule-watch-alert)`);
  }
  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    // ?dry=1 — 탐지만(치유·기록·알림 없음). 사람이 지금 상태를 볼 때 쓴다.
    const dry = req.nextUrl.searchParams.get("dry") === "1";
    const r = await runScheduleWatch(new Date(), dry);
    // 고친 것만 있으면 조용히 — 사람이 볼 게 있을 때만 알린다
    if (!dry && r.toAlert.length > 0) await sendTelegram(buildMessage(r));
    if (!dry) await recordCronRun("schedule-watch", { count: r.toAlert.length });
    return NextResponse.json({
      ok: true,
      dry,
      afFixtures: r.afFixtures,
      missing: r.missing,
      healedFixtures: r.healedFixtures,
      healedPairs: r.healedPairs,
      driftFixed: r.driftFixed,
      driftSample: r.driftSample,
      findings: r.findings.length,
      alerted: r.toAlert.length,
      sample: r.findings.slice(0, 10).map((f) => `${f.kind} ${f.text}`),
    });
  } catch (e) {
    const msg = (e as Error).message;
    await recordCronRun("schedule-watch", { ok: false, error: msg });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
