// 일별 사람 트래픽(봇·위장 스크레이퍼 제외) — admin/stats 일별 표와 오늘·어제 KPI 의 단일 출처.
//
// 판정은 lib/traffic-filter 의 dailyCleanStats(그날 PV 만으로 판정). 55만 행을 매 요청 다시 판정할 수 없어
// 지난 날짜는 DailyTraffic 에 저장해 두고(cron daily-traffic 이 매일 00:10 KST 에 어제·그제분 저장),
// 오늘과 아직 저장되지 않은 어제만 즉석 계산한다.
import { prisma } from "@/lib/db";
import { dailyCleanStats } from "@/lib/traffic-filter";

export type DayTraffic = { visitors: number; pv: number };

export function kstDayKey(d: Date): string {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 그날(KST) PV·랜딩만으로 판정한 사람 방문자·PV. */
export async function computeDayTraffic(day: string): Promise<DayTraffic> {
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
  return dailyCleanStats(rows, landings);
}

export async function storeDayTraffic(day: string): Promise<DayTraffic> {
  const v = await computeDayTraffic(day);
  await prisma.dailyTraffic.upsert({ where: { day }, create: { day, ...v }, update: v });
  return v;
}

/** 전 기간 일별 값 — 저장분 + 오늘(항상 즉석) + 어제(cron 전이면 즉석). */
export async function getDailyTraffic(now: Date = new Date()): Promise<Map<string, DayTraffic>> {
  const today = kstDayKey(now);
  const yesterday = kstDayKey(new Date(now.getTime() - 24 * 3600 * 1000));
  const stored = await prisma.dailyTraffic.findMany({ select: { day: true, visitors: true, pv: true } });
  const map = new Map<string, DayTraffic>(stored.map((r) => [r.day, { visitors: r.visitors, pv: r.pv }]));
  const live = [today, ...(map.has(yesterday) ? [] : [yesterday])];
  const vals = await Promise.all(live.map((d) => computeDayTraffic(d)));
  live.forEach((d, i) => map.set(d, vals[i]));
  return map;
}
