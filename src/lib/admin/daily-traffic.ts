// 일별 사람 트래픽(봇·위장 스크레이퍼 제외) — admin/stats 일별 표와 오늘·어제 KPI 의 단일 출처.
//
// 판정은 lib/traffic-filter 의 dailyCleanStats(그날 PV 만으로 판정). 55만 행을 매 요청 다시 판정할 수 없어
// 지난 날짜는 DailyTraffic 에 저장해 두고(cron daily-traffic 이 매일 00:10 KST 에 어제·그제분 저장),
// 오늘과 아직 저장되지 않은 어제만 즉석 계산한다.
import { prisma } from "@/lib/db";
import { automatedUserAgents, dailyCleanStats, filterHumans, type ChannelCounts } from "@/lib/traffic-filter";

/** channels — 그날 채널별 사람 랜딩(유입 채널 카드 합산 재료). 저장 전 날짜는 빈 객체. */
export type DayTraffic = { visitors: number; pv: number; suspicious: number; channels: ChannelCounts };
/** 그날 세션을 가장 많이 만든 자동화 UA(traffic-filter 규칙 C) — 스크레이퍼 급증 알림 재료. */
export type TopAutomated = { ua: string; sessions: number; topPaths: Array<{ path: string; pv: number }> };

export function kstDayKey(d: Date): string {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 그날(KST) PV·랜딩만으로 판정한 사람 방문자·PV + 최다 자동화 UA. */
export async function computeDayTraffic(day: string): Promise<DayTraffic & { topAutomated: TopAutomated | null }> {
  const from = new Date(`${day}T00:00:00+09:00`);
  const to = new Date(from.getTime() + 24 * 3600 * 1000);
  const [rows, landings] = await Promise.all([
    prisma.pageView.findMany({
      where: { ts: { gte: from, lt: to } },
      select: { ts: true, path: true, userAgent: true, sessionId: true },
    }),
    prisma.pageView.findMany({
      where: { ts: { gte: from, lt: to }, isLanding: true },
      select: { sessionId: true, userAgent: true, path: true, referrer: true, utmSource: true },
    }),
  ]);
  const humans = filterHumans(rows);
  const auto = automatedUserAgents(humans);
  const byUa = new Map<string, { sessions: Set<string>; paths: Map<string, number> }>();
  for (const r of humans) {
    const ua = r.userAgent ?? "";
    if (!r.sessionId || !auto.has(ua)) continue;
    const e = byUa.get(ua) ?? { sessions: new Set<string>(), paths: new Map<string, number>() };
    e.sessions.add(r.sessionId);
    e.paths.set(r.path, (e.paths.get(r.path) ?? 0) + 1);
    byUa.set(ua, e);
  }
  const top = [...byUa].sort((a, b) => b[1].sessions.size - a[1].sessions.size)[0];
  return {
    ...dailyCleanStats(rows, landings),
    topAutomated: top
      ? {
          ua: top[0],
          sessions: top[1].sessions.size,
          topPaths: [...top[1].paths].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([path, pv]) => ({ path, pv })),
        }
      : null,
  };
}

export async function storeDayTraffic(day: string) {
  const v = await computeDayTraffic(day);
  const row = { visitors: v.visitors, pv: v.pv, suspicious: v.suspicious, channels: v.channels };
  await prisma.dailyTraffic.upsert({ where: { day }, create: { day, ...row }, update: row });
  return v;
}

/** 전 기간 일별 값 — 저장분 + 오늘(항상 즉석) + 어제(cron 전이면 즉석). */
export async function getDailyTraffic(now: Date = new Date()): Promise<Map<string, DayTraffic>> {
  const today = kstDayKey(now);
  const yesterday = kstDayKey(new Date(now.getTime() - 24 * 3600 * 1000));
  const stored = await prisma.dailyTraffic.findMany({ select: { day: true, visitors: true, pv: true, suspicious: true, channels: true } });
  const map = new Map<string, DayTraffic>(
    stored.map((r) => [r.day, { visitors: r.visitors, pv: r.pv, suspicious: r.suspicious, channels: (r.channels as ChannelCounts | null) ?? {} }]),
  );
  const live = [today, ...(map.has(yesterday) ? [] : [yesterday])];
  const vals = await Promise.all(live.map((d) => computeDayTraffic(d)));
  live.forEach((d, i) => map.set(d, { visitors: vals[i].visitors, pv: vals[i].pv, suspicious: vals[i].suspicious, channels: vals[i].channels }));
  return map;
}
