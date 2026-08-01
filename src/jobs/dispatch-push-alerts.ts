// 웹 푸시 킥오프 알림 디스패처 — */10 크론. 미발송 알림 중 킥오프 15분 내 경기를 발송.
// 410/404(구독 만료) 는 구독 즉시 삭제, 5xx 는 failCount 3회 누적 시 삭제.
import webpush from "web-push";
import { prisma } from "@/lib/db";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";

const KICKOFF_WINDOW_MIN = 15; // 크론 주기(10분)보다 넉넉히 — 미발송 row 만 잡으므로 중복 없음
const MAX_FAILS = 3;

function vapidReady(): boolean {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails("mailto:kimxylitol77@gmail.com", pub, priv);
  return true;
}

export async function dispatchPushAlerts(): Promise<{ sent: number; expired: number; failed: number; skipped?: string }> {
  if (!vapidReady()) return { sent: 0, expired: 0, failed: 0, skipped: "vapid env 없음" };

  const now = new Date();
  const alerts = await prisma.pushMatchAlert.findMany({
    where: { sentAt: null, kind: "KICKOFF" },
    select: { id: true, matchId: true, subscription: { select: { id: true, endpoint: true, p256dh: true, auth: true, failCount: true } } },
  });
  if (alerts.length === 0) return { sent: 0, expired: 0, failed: 0 };

  // 킥오프 창에 든 경기만 — 연기·취소(status 변경)는 자연 제외
  const matches = await prisma.match.findMany({
    where: {
      id: { in: [...new Set(alerts.map((a) => a.matchId))] },
      status: "SCHEDULED",
      startTime: { gte: now, lte: new Date(now.getTime() + KICKOFF_WINDOW_MIN * 60_000) },
    },
    select: {
      id: true,
      league: true,
      startTime: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  if (matches.length === 0) return { sent: 0, expired: 0, failed: 0 };
  const byId = new Map(matches.map((m) => [m.id, m]));

  let sent = 0;
  let expired = 0;
  let failed = 0;

  for (const a of alerts) {
    const m = byId.get(a.matchId);
    if (!m) continue;
    const kst = new Date(m.startTime.getTime() + 9 * 3600_000);
    const hhmm = `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
    const league = LEAGUE_DISPLAY[m.league] ?? m.league;
    const payload = JSON.stringify({
      title: `곧 킥오프 — ${m.homeTeam?.name ?? "홈"} vs ${m.awayTeam?.name ?? "원정"}`,
      body: `${league} · ${hhmm} 시작. 라이브로 보기`,
      url: `/scores?utm_source=push`,
      tag: `kickoff-${m.id}`,
    });
    try {
      await webpush.sendNotification(
        { endpoint: a.subscription.endpoint, keys: { p256dh: a.subscription.p256dh, auth: a.subscription.auth } },
        payload,
        { TTL: 900 },
      );
      await prisma.pushMatchAlert.update({ where: { id: a.id }, data: { sentAt: new Date() } });
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode ?? 0;
      if (status === 404 || status === 410) {
        // 구독 만료 — 영구 죽음, 즉시 정리 (alert row 는 cascade)
        await prisma.pushSubscription.delete({ where: { id: a.subscription.id } }).catch(() => {});
        expired++;
      } else {
        failed++;
        const fails = a.subscription.failCount + 1;
        if (fails >= MAX_FAILS) {
          await prisma.pushSubscription.delete({ where: { id: a.subscription.id } }).catch(() => {});
        } else {
          await prisma.pushSubscription
            .update({ where: { id: a.subscription.id }, data: { failCount: fails } })
            .catch(() => {});
        }
      }
    }
  }
  return { sent, expired, failed };
}
