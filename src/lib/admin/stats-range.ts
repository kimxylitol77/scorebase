// /admin/stats 의 "기간 선택(7일·30일·전체)에 따라 달라지는 지표" 계산 — 페이지 초기 렌더와 /api/admin/stats-range 가 같이 쓴다.
// 상단 전역 기간 토글이 페이지 전체를 다시 불러와 느리다는 지적(2026-09-12)에 따라, 카드마다 기간 탭을 두고
// 다른 기간은 이 계산을 API 로 한 번만 받아 캐시한다. 계산 규칙은 페이지에 있던 것을 그대로 옮겼다(수치 동일).
// 반환값은 JSON 으로 직렬화되므로 Map/Set/Date 를 쓰지 않는다.

import "server-only";
import { prisma } from "@/lib/db";
import { detectBot, BOT_CATEGORY_LABEL, type BotCategory } from "@/lib/bot-detect";
import { suspiciousSessionIds, concurrentSeries, concurrentByDay } from "@/lib/traffic-filter";
import { detectDevice, type DeviceType } from "@/lib/device-detect";
import { classifyLanding, extractSearchQuery, aiServiceOf, AI_SERVICES, type TrafficChannel } from "@/lib/referrer-channel";

export type StatsRange = "7d" | "30d" | "all";
export const STATS_RANGE_LABEL: Record<StatsRange, string> = { "7d": "최근 7일", "30d": "최근 30일", all: "전체" };
export function parseStatsRange(v: string | string[] | null | undefined): StatsRange {
  return v === "30d" || v === "all" ? v : "7d";
}

export interface RangeStats {
  range: StatsRange;
  label: string;
  todayPV: number;
  todayUnique: number;
  yesterdayPV: number;
  yesterdayUnique: number;
  rangePV: number;
  rangeUnique: number;
  sessionCount: number;
  avgSessionSec: number;
  bounceRate: number;
  suspiciousCount: number;
  concurrent: { bucketMinutes: number; peak: number; peakAt: string | null; avg: number; median: number; p95: number };
  concurrentDays: Array<{ day: string; peak: number; peakAt: string; avg: number; partial: boolean }>;
  concurrentHours: Array<{ hour: number; avg: number; peak: number }>;
  device: { total: number; rows: Array<{ type: DeviceType; count: number; pct: number }> };
  topPaths: Array<{ path: string; count: number }>;
  exitPaths: Array<{ path: string; exits: number; seen: number; rate: number }>;
  hosts: { totalPv: number; rows: Array<{ host: string; pv: number; unique: number }> };
  referralDomains: Array<{ domain: string; count: number }>;
  searchQueries: Array<{ query: string; count: number; channel: TrafficChannel }>;
  externalLandings: Array<{ path: string; count: number }>;
  aiServices: Array<{ name: string; pv: number; unique: number; topPaths: Array<{ path: string; count: number }> }>;
  aiBots: { rangePV: number; byName: Array<{ name: string; count: number }>; topPaths: Array<{ path: string; count: number }> };
  bots: {
    rangeCount: number;
    ratio: number;
    total: number;
    categories: Array<{ category: BotCategory; count: number }>;
    top: Array<{ name: string; count: number; category: BotCategory }>;
  };
}

/** Host 헤더 → 사람이 읽을 도메인 라벨. 운영 2개 도메인 + 개발/프리뷰 그룹핑. */
export function friendlyHost(host: string | null): string {
  if (!host) return "도메인 미상 (이전 기록)";
  const h = host.toLowerCase().split(":")[0].replace(/^www\./, "");
  if (h.includes("xn--hy1bm7m1yevrd8pq")) return "스코어보드.kr";
  if (h.includes("scorebase.kr")) return "scorebase.kr";
  if (h === "localhost" || h.startsWith("127.")) return "localhost (개발)";
  if (h.endsWith(".vercel.app")) return "Vercel 프리뷰";
  return h || "(빈 host)";
}

function dayKeyKst(d: Date) {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function computeRangeStats(range: StatsRange): Promise<RangeStats> {
  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 86400000);
  const last7 = new Date(now.getTime() - 7 * 86400000);
  const today00KST = new Date(dayKeyKst(now) + "T00:00:00+09:00");
  const yesterday00KST = new Date(today00KST.getTime() - 86400000);

  // take 한도는 실측 행수(2026-08-01: 7d 49k · 30d 107k · all 153k) 대비 2배 여유. 초과하면 desc 정렬이라 옛쪽부터 잘린다.
  // (2026-09 실측 30d 27만·전체 48만 — 30d·전체는 잘린다. 잘리지 않는 카드는 page.tsx 의 SQL 집계 쪽으로 옮기는 중.)
  const rangeWhere = range === "all" ? {} : { ts: { gte: range === "30d" ? last30 : last7 } };
  const rangeTake = range === "all" ? 300000 : range === "30d" ? 200000 : 100000;
  const [rangeRaw, landingRaw, aiSvcRaw] = await Promise.all([
    prisma.pageView.findMany({
      where: rangeWhere,
      select: { ts: true, path: true, userAgent: true, sessionId: true, host: true },
      take: rangeTake,
      orderBy: { ts: "desc" },
    }),
    // 유입 채널 부속(검색어·랜딩 TOP·기타 사이트) — 랜딩 PV 만 (isLanding=true, 2026-06-11 이후 기록).
    prisma.pageView.findMany({
      where: { ...rangeWhere, isLanding: true },
      select: { referrer: true, userAgent: true, sessionId: true, path: true, utmSource: true },
      take: 100000,
      orderBy: { ts: "desc" },
    }),
    // AI 서비스별 유입 — referrer 또는 utm_source 에 AI 서비스 흔적이 있는 행만(수백 행).
    prisma.pageView.findMany({
      where: {
        ...rangeWhere,
        OR: ["chatgpt", "openai", "copilot", "perplexity", "claude", "anthropic", "gemini.google", "bard.google"].flatMap((k) => [
          { referrer: { contains: k, mode: "insensitive" as const } },
          { utmSource: { contains: k, mode: "insensitive" as const } },
        ]),
      },
      select: { ts: true, path: true, userAgent: true, sessionId: true, referrer: true, utmSource: true },
      take: 20000,
      orderBy: { ts: "desc" },
    }),
  ]);

  const humansRange = rangeRaw.filter((r) => !detectBot(r.userAgent).isBot);
  const botsRange = rangeRaw.filter((r) => detectBot(r.userAgent).isBot);
  // 의심 봇(위장 스크레이퍼) 세션 — 판정 규칙은 lib/traffic-filter 가 단일 출처.
  const suspiciousSids = suspiciousSessionIds(humansRange, landingRaw);
  const humansClean = humansRange.filter((r) => !r.sessionId || !suspiciousSids.has(r.sessionId));

  // 동시 접속(고정 창 안의 고유 세션) — heartbeat 는 이력이 없어 PV 로 근사한다. 전체 기간도 최근 30일까지만.
  const concFrom = range === "7d" ? last7 : last30;
  const conc = concurrentSeries(humansClean, concFrom, now, 5);
  const concurrentDays = concurrentByDay(conc).slice(-14);
  const concurrentHours = (() => {
    const per = new Map<number, { sum: number; n: number; peak: number }>();
    for (const b of conc.buckets) {
      const h = new Date(b.t + 9 * 3_600_000).getUTCHours();
      const e = per.get(h) ?? { sum: 0, n: 0, peak: 0 };
      e.sum += b.n;
      e.n++;
      if (b.n > e.peak) e.peak = b.n;
      per.set(h, e);
    }
    return Array.from({ length: 24 }, (_, h) => {
      const e = per.get(h) ?? { sum: 0, n: 0, peak: 0 };
      return { hour: h, avg: e.n ? e.sum / e.n : 0, peak: e.peak };
    });
  })();

  const countIn = (from: Date, to?: Date) => humansClean.filter((r) => r.ts >= from && (!to || r.ts < to)).length;
  const uniqueIn = (from: Date, to?: Date) => {
    const ids = new Set<string>();
    for (const r of humansClean) if (r.ts >= from && (!to || r.ts < to) && r.sessionId) ids.add(r.sessionId);
    return ids.size;
  };

  // 실제 체류·이탈률 — sessionId 는 영구 방문자 ID 라 30분 공백을 세션 경계로 쓴다. 이탈 = PV 1개짜리 세션.
  const SESSION_GAP_MS = 30 * 60 * 1000;
  const durations: number[] = [];
  let bounces = 0;
  const exitCountByPath = new Map<string, number>();
  const seenSessionsByPath = new Map<string, number>();
  {
    const bySid = new Map<string, Array<{ t: number; path: string }>>();
    for (const r of humansClean) {
      if (!r.sessionId) continue;
      const row = { t: r.ts.getTime(), path: r.path.split("?")[0] };
      const arr = bySid.get(r.sessionId);
      if (arr) arr.push(row);
      else bySid.set(r.sessionId, [row]);
    }
    const close = (start: number, end: number, pages: string[]) => {
      durations.push((end - start) / 1000);
      if (pages.length === 1) bounces++;
      const exit = pages[pages.length - 1];
      exitCountByPath.set(exit, (exitCountByPath.get(exit) ?? 0) + 1);
      for (const p of new Set(pages)) seenSessionsByPath.set(p, (seenSessionsByPath.get(p) ?? 0) + 1);
    };
    for (const rows of bySid.values()) {
      rows.sort((a, b) => a.t - b.t);
      let start = rows[0].t, prev = rows[0].t, pages: string[] = [rows[0].path];
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].t - prev > SESSION_GAP_MS) {
          close(start, prev, pages);
          start = rows[i].t;
          pages = [rows[i].path];
        } else pages.push(rows[i].path);
        prev = rows[i].t;
      }
      close(start, prev, pages);
    }
  }
  const sessionCount = durations.length;

  // 디바이스
  const deviceCount = new Map<DeviceType, number>([["mobile", 0], ["tablet", 0], ["desktop", 0]]);
  for (const r of humansClean) {
    const t = detectDevice(r.userAgent).type;
    deviceCount.set(t, (deviceCount.get(t) ?? 0) + 1);
  }
  const deviceTotal = [...deviceCount.values()].reduce((a, b) => a + b, 0);

  // 인기 페이지
  const pathCount = new Map<string, number>();
  for (const r of humansClean) pathCount.set(r.path, (pathCount.get(r.path) ?? 0) + 1);

  // 도메인별
  const hostAgg = new Map<string, { pv: number; ids: Set<string> }>();
  for (const r of humansClean) {
    const label = friendlyHost(r.host);
    const e = hostAgg.get(label) ?? { pv: 0, ids: new Set<string>() };
    e.pv++;
    if (r.sessionId) e.ids.add(r.sessionId);
    hostAgg.set(label, e);
  }
  const hosts = [...hostAgg.entries()].map(([host, e]) => ({ host, pv: e.pv, unique: e.ids.size })).sort((a, b) => b.pv - a.pv);

  // 유입 채널 부속 — 기타 사이트(referral 도메인)·검색어·외부 유입 랜딩 페이지
  const referralDomainAgg = new Map<string, number>();
  const searchQueryAgg = new Map<string, { count: number; channel: TrafficChannel }>();
  const externalLandingAgg = new Map<string, number>();
  for (const r of landingRaw) {
    if (detectBot(r.userAgent).isBot) continue;
    if (r.sessionId && suspiciousSids.has(r.sessionId)) continue;
    const { channel, domain } = classifyLanding(r.referrer, r.utmSource, r.userAgent);
    if (domain) referralDomainAgg.set(domain, (referralDomainAgg.get(domain) ?? 0) + 1);
    const q = extractSearchQuery(r.referrer);
    if (q) searchQueryAgg.set(q, { count: (searchQueryAgg.get(q)?.count ?? 0) + 1, channel });
    if (channel !== "direct") externalLandingAgg.set(r.path, (externalLandingAgg.get(r.path) ?? 0) + 1);
  }

  // AI 서비스별 유입 — utm_source·referrer 는 첫 페이지에만 남으므로 사실상 "AI 링크 클릭 수".
  const aiSvcAgg = new Map<string, { pv: number; ids: Set<string>; paths: Map<string, number> }>();
  for (const r of aiSvcRaw) {
    if (detectBot(r.userAgent).isBot) continue;
    if (r.sessionId && suspiciousSids.has(r.sessionId)) continue;
    const svc = aiServiceOf(r.referrer, r.utmSource);
    if (!svc) continue;
    const e = aiSvcAgg.get(svc) ?? { pv: 0, ids: new Set<string>(), paths: new Map<string, number>() };
    e.pv++;
    if (r.sessionId) e.ids.add(r.sessionId);
    e.paths.set(r.path, (e.paths.get(r.path) ?? 0) + 1);
    aiSvcAgg.set(svc, e);
  }

  // AI 크롤러(기간) · 봇 카테고리·TOP
  const aiBotsRange = botsRange.filter((r) => detectBot(r.userAgent).category === "ai");
  const aiByName = new Map<string, number>();
  const aiPath = new Map<string, number>();
  for (const r of aiBotsRange) {
    const name = detectBot(r.userAgent).name;
    if (name) aiByName.set(name, (aiByName.get(name) ?? 0) + 1);
    aiPath.set(r.path, (aiPath.get(r.path) ?? 0) + 1);
  }
  const botCat = new Map<BotCategory, number>();
  const botName = new Map<string, { count: number; category: BotCategory }>();
  for (const r of botsRange) {
    const info = detectBot(r.userAgent);
    if (!info.isBot || !info.category || !info.name) continue;
    botCat.set(info.category, (botCat.get(info.category) ?? 0) + 1);
    botName.set(info.name, { count: (botName.get(info.name)?.count ?? 0) + 1, category: info.category });
  }
  // 의심 봇(위장 스크레이퍼) PV 는 봇 쪽으로 집계 — 사람 vs 봇 비율을 정직하게
  const suspectPv = humansRange.length - humansClean.length;
  const totalBots = botsRange.length + suspectPv;
  const totalHumans = humansClean.length;

  const top = <T,>(m: Map<string, T>, n: number, val: (v: T) => number) =>
    [...m.entries()].sort((a, b) => val(b[1]) - val(a[1])).slice(0, n);

  return {
    range,
    label: STATS_RANGE_LABEL[range],
    todayPV: countIn(today00KST),
    todayUnique: uniqueIn(today00KST),
    yesterdayPV: countIn(yesterday00KST, today00KST),
    yesterdayUnique: uniqueIn(yesterday00KST, today00KST),
    rangePV: humansClean.length,
    rangeUnique: new Set(humansClean.map((r) => r.sessionId).filter(Boolean)).size,
    sessionCount,
    avgSessionSec: sessionCount ? Math.round(durations.reduce((a, b) => a + b, 0) / sessionCount) : 0,
    bounceRate: sessionCount ? Math.round((bounces / sessionCount) * 100) : 0,
    suspiciousCount: suspiciousSids.size,
    concurrent: { bucketMinutes: conc.bucketMinutes, peak: conc.peak, peakAt: conc.peakAt ? conc.peakAt.toISOString() : null, avg: conc.avg, median: conc.median, p95: conc.p95 },
    concurrentDays,
    concurrentHours,
    device: {
      total: deviceTotal,
      rows: (["mobile", "tablet", "desktop"] as DeviceType[]).map((t) => {
        const count = deviceCount.get(t) ?? 0;
        return { type: t, count, pct: deviceTotal > 0 ? Math.round((count / deviceTotal) * 100) : 0 };
      }),
    },
    // 카드는 10개 펼치고 나머지는 접힘(2026-09-13 요청) — 50개까지.
    topPaths: top(pathCount, 50, (v) => v).map(([path, count]) => ({ path, count })),
    exitPaths: top(exitCountByPath, 10, (v) => v).map(([path, exits]) => {
      const seen = seenSessionsByPath.get(path) ?? exits;
      return { path, exits, seen, rate: Math.round((exits / seen) * 100) };
    }),
    hosts: { totalPv: hosts.reduce((s, h) => s + h.pv, 0), rows: hosts },
    referralDomains: top(referralDomainAgg, 50, (v) => v).map(([domain, count]) => ({ domain, count })),
    searchQueries: top(searchQueryAgg, 15, (v) => v.count).map(([query, v]) => ({ query, count: v.count, channel: v.channel })),
    externalLandings: top(externalLandingAgg, 10, (v) => v).map(([path, count]) => ({ path, count })),
    aiServices: AI_SERVICES.map((name) => {
      const e = aiSvcAgg.get(name);
      return { name, pv: e?.pv ?? 0, unique: e?.ids.size ?? 0, topPaths: e ? top(e.paths, 3, (v) => v).map(([path, count]) => ({ path, count })) : [] };
    }),
    aiBots: {
      rangePV: aiBotsRange.length,
      byName: top(aiByName, 100, (v) => v).map(([name, count]) => ({ name, count })),
      topPaths: top(aiPath, 15, (v) => v).map(([path, count]) => ({ path, count })),
    },
    bots: {
      rangeCount: botsRange.length,
      ratio: totalBots + totalHumans > 0 ? Math.round((totalBots / (totalBots + totalHumans)) * 100) : 0,
      total: totalBots,
      categories: (Object.keys(BOT_CATEGORY_LABEL) as BotCategory[]).map((c) => ({ category: c, count: botCat.get(c) ?? 0 })),
      top: top(botName, 12, (v) => v.count).map(([name, v]) => ({ name, count: v.count, category: v.category })),
    },
  };
}
