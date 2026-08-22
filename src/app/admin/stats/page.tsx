import { prisma } from "@/lib/db";
import { DailyArea, HourlyBar } from "@/components/charts/StatsChart";
import LivePresencePanel from "@/components/admin/LivePresencePanel";
import { detectBot, BOT_CATEGORY_LABEL, type BotCategory } from "@/lib/bot-detect";
import { suspiciousSessionIds, concurrentSeries, concurrentByDay } from "@/lib/traffic-filter";
import { detectDevice, DEVICE_LABEL, type DeviceType } from "@/lib/device-detect";
import {
  classifyLanding,
  extractSearchQuery,
  CHANNEL_META,
  CHANNEL_ORDER,
  type TrafficChannel,
} from "@/lib/referrer-channel";
import { getGscOverview, gscPageToPath, type GscRow } from "@/lib/gsc";
import { getBingOverview } from "@/lib/bing-webmaster";
import {
  potentialClicks,
  OPP_MIN_IMPRESSIONS,
  OPP_MIN_POSITION,
  OPP_MAX_POSITION,
} from "@/lib/search-opportunity";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

function dayKey(d: Date) {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
function shortDay(d: Date) {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`;
}
function hourKey(d: Date) {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return String(kst.getUTCHours()).padStart(2, "0");
}

// Host 헤더 → 사람이 읽을 도메인 라벨. 운영 2개 도메인 + 개발/프리뷰 그룹핑.
function friendlyHost(host: string | null): string {
  if (!host) return "도메인 미상 (이전 기록)";
  const h = host.toLowerCase().split(":")[0].replace(/^www\./, "");
  if (h.includes("xn--hy1bm7m1yevrd8pq")) return "스코어보드.kr";
  if (h.includes("scorebase.kr")) return "scorebase.kr";
  if (h === "localhost" || h.startsWith("127.")) return "localhost (개발)";
  if (h.endsWith(".vercel.app")) return "Vercel 프리뷰";
  return h || "(빈 host)";
}

type Range = "7d" | "30d" | "all";

const RANGE_LABEL: Record<Range, string> = {
  "7d": "최근 7일",
  "30d": "최근 30일",
  "all": "전체",
};

function parseRange(v: string | string[] | undefined): Range {
  if (v === "30d" || v === "all") return v;
  return "7d";
}

interface Props {
  searchParams: Promise<{ range?: string }>;
}

export default async function StatsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const range = parseRange(sp.range);

  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const today00KST = new Date(dayKey(now) + "T00:00:00+09:00");
  const yesterday00KST = new Date(today00KST.getTime() - 24 * 60 * 60 * 1000);

  // 기간 선택용 — 인기 페이지/봇 TOP/디바이스 분포 / KPI 의 main range
  // take 한도는 실측 행수(2026-08-01: 7d 49k · 30d 107k · all 153k) 대비 2배 여유.
  // 초과하면 desc 정렬이라 옛쪽부터 잘린다 — 라벨 기간보다 짧게 집계되므로 주기 점검.
  const rangeWhere =
    range === "all"
      ? {}
      : { ts: { gte: range === "30d" ? last30 : last7 } };
  const rangeTake = range === "all" ? 300000 : range === "30d" ? 200000 : 100000;

  // 모든 PageView 한 번에 가져와서 메모리에서 사람/봇 분리
  // (gsc 는 DB 와 무관한 Google API — 병렬로 같이 — unstable_cache 1h 라 보통 즉시)
  const [recent30Raw, recent24Raw, rangeRaw, totalAll, landingRaw, landing14Raw, memberPvRaw, allUsers, gsc, bing] = await Promise.all([
    // ⚠️ orderBy 필수 — 30일 PV 가 take 를 넘으면(2026-08-01 실측 107k > 100k) 정렬 없는
    // findMany 는 임의 서브셋을 줘서 최신(오늘) 행이 잘렸다 → 오늘 KPI 가 1/5 로 축소 표시.
    // desc 로 최신부터 담으면 오늘·어제 KPI 는 항상 온전 (잘림은 30일 차트의 옛날쪽 며칠).
    prisma.pageView.findMany({
      where: { ts: { gte: last30 } },
      select: { ts: true, path: true, userAgent: true, sessionId: true },
      take: 150000,
      orderBy: { ts: "desc" },
    }),
    prisma.pageView.findMany({
      where: { ts: { gte: last24h } },
      select: { ts: true, userAgent: true, sessionId: true },
      take: 40000,
      orderBy: { ts: "desc" },
    }),
    prisma.pageView.findMany({
      where: rangeWhere,
      select: { ts: true, path: true, userAgent: true, sessionId: true, host: true },
      take: rangeTake,
      orderBy: { ts: "desc" },
    }),
    prisma.pageView.count(),
    // 유입 채널 — 랜딩 PV 만 (isLanding=true, 2026-06-11 이후 기록). 행 수가 적어
    // 별도 쿼리가 메인 rangeRaw 에 referrer 컬럼 얹는 것보다 가볍다.
    prisma.pageView.findMany({
      where: { ...rangeWhere, isLanding: true },
      select: { referrer: true, userAgent: true, sessionId: true, path: true, utmSource: true },
      take: 100000,
      orderBy: { ts: "desc" },
    }),
    // 유입 채널 주간 비교용 — range 와 무관하게 14일 고정(이번 주 7일 + 지난주 7일).
    // 위 landingRaw 와 같은 랜딩 1행 원칙, ts 만 추가로 가져와 코드에서 주 분리.
    prisma.pageView.findMany({
      where: { isLanding: true, ts: { gte: last14 } },
      select: { ts: true, referrer: true, userAgent: true, sessionId: true, path: true, utmSource: true },
      take: 100000,
      orderBy: { ts: "desc" },
    }),
    // 회원 이탈 분석용 — 로그인 상태 PV 전체 (userId 는 2026-07-28 이후 수집분만 존재).
    // range 와 무관하게 전체 기간 — 잠수 판정은 "마지막 접속이 언제냐" 라 절대 시점 기준.
    prisma.pageView.findMany({
      where: { userId: { not: null } },
      select: { userId: true, path: true, ts: true },
      orderBy: { ts: "desc" },
      take: 50000,
    }),
    prisma.user.findMany({ select: { id: true, createdAt: true } }),
    getGscOverview(),
    getBingOverview(),
  ]);

  // 사람 vs 봇 분리 (recent30 기준 — 차트용)
  type Row = {
    ts: Date;
    path: string;
    userAgent: string | null;
    sessionId: string | null;
  };
  const humans30: Row[] = [];
  const bots30: Array<Row & { botCategory: BotCategory; botName: string }> = [];
  for (const r of recent30Raw) {
    const info = detectBot(r.userAgent);
    if (info.isBot && info.category && info.name) {
      bots30.push({ ...r, botCategory: info.category, botName: info.name });
    } else {
      humans30.push(r);
    }
  }
  // 기간 선택 범위에서 사람/봇 분리
  const humansRange = rangeRaw.filter((r) => !detectBot(r.userAgent).isBot);
  const botsRange = rangeRaw.filter((r) => detectBot(r.userAgent).isBot);

  // 의심 봇(위장 스크레이퍼) 세션 — 판정 규칙은 lib/traffic-filter 가 단일 출처.
  // 화면과 세션 안 에이전트가 서로 다른 규칙으로 세던 것을 2026-08-22 에 그리로 합쳤다.
  const suspiciousSids = suspiciousSessionIds(humansRange, landingRaw);
  // 사람 지표는 의심 봇 제외본으로 계산 (원본 humansRange 는 봇 대비 비율 등에 유지)
  const humansClean = humansRange.filter((r) => !r.sessionId || !suspiciousSids.has(r.sessionId));

  // 동시 접속(고정 창 안의 고유 세션) — heartbeat 는 이력이 없어 PV 로 근사한다.
  const concFrom = range === "all" ? last30 : range === "30d" ? last30 : last7;
  const concurrent = concurrentSeries(humansClean, concFrom, now, 5);
  const concurrentDays = concurrentByDay(concurrent).slice(-14);
  const concurrentHours = (() => {
    const per = new Map<number, { sum: number; n: number; peak: number }>();
    for (const b of concurrent.buckets) {
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

  // KPI 계산 헬퍼
  const filterRange = (rows: Row[], from: Date, to?: Date) =>
    rows.filter((r) =>
      to ? r.ts >= from && r.ts < to : r.ts >= from,
    ).length;
  // unique sessionId 카운트 — 같은 방문자 여러 PV 도 1로 카운트
  const uniqueRange = (rows: Row[], from: Date, to?: Date) => {
    const ids = new Set<string>();
    for (const r of rows) {
      if (r.ts < from) continue;
      if (to && r.ts >= to) continue;
      if (r.sessionId) ids.add(r.sessionId);
    }
    return ids.size;
  };
  // 오늘·어제도 기간 지표와 같은 기준(의심 봇 제외)으로 센다 — 2026-08-22 이전에는 이 둘만
  // detectBot 만 적용해, 같은 화면의 "오늘 방문자"와 "기간 방문자"가 다른 기준이었다.
  // humansClean 은 range 와 무관하게 오늘·어제를 항상 포함한다(rangeRaw 가 ts desc 라 최신은 안 잘림).
  const humanTodayPV = filterRange(humansClean as Row[], today00KST);
  const humanTodayUnique = uniqueRange(humansClean as Row[], today00KST);
  const humanYesterdayPV = filterRange(humansClean as Row[], yesterday00KST, today00KST);
  const humanYesterdayUnique = uniqueRange(humansClean as Row[], yesterday00KST, today00KST);
  const humanRangePV = humansClean.length;
  const humanRangeUnique = new Set(
    humansClean.map((r) => r.sessionId).filter(Boolean) as string[],
  ).size;

  // 실제 체류·이탈률 — sessionId 는 localStorage 영구 ID(방문자 식별)라 세션이 아니므로,
  // 같은 sessionId 의 PV 를 시간순으로 훑어 30분 이상 공백이 나면 새 세션으로 끊는다.
  // 세션 체류 = 첫~마지막 PV 간격, 이탈 = PV 1개짜리 세션.
  const SESSION_GAP_MS = 30 * 60 * 1000;
  const sessionDurations: number[] = [];
  let sessionBounces = 0;
  {
    const bySid = new Map<string, number[]>();
    for (const r of humansClean) {
      if (!r.sessionId) continue;
      const arr = bySid.get(r.sessionId);
      if (arr) arr.push(r.ts.getTime());
      else bySid.set(r.sessionId, [r.ts.getTime()]);
    }
    const close = (start: number, end: number, count: number) => {
      sessionDurations.push((end - start) / 1000);
      if (count === 1) sessionBounces++;
    };
    for (const times of bySid.values()) {
      times.sort((a, b) => a - b);
      let start = times[0];
      let prev = times[0];
      let count = 1;
      for (let i = 1; i < times.length; i++) {
        if (times[i] - prev > SESSION_GAP_MS) {
          close(start, prev, count);
          start = times[i];
          count = 1;
        } else {
          count++;
        }
        prev = times[i];
      }
      close(start, prev, count);
    }
  }
  const sessionCount = sessionDurations.length;
  const avgSessionSec = sessionCount ? Math.round(sessionDurations.reduce((a, b) => a + b, 0) / sessionCount) : 0;
  const bounceRate = sessionCount ? Math.round((sessionBounces / sessionCount) * 100) : 0;
  const avgSessionLabel = avgSessionSec >= 60 ? `${Math.floor(avgSessionSec / 60)}분 ${avgSessionSec % 60}초` : `${avgSessionSec}초`;
  const botToday = filterRange(bots30 as Row[], today00KST);
  const botYesterday = filterRange(bots30 as Row[], yesterday00KST, today00KST);
  const botRangeCount = botsRange.length;

  // 일별 — 사람 기준 30일 (차트는 30일 고정 — 시각화 일관성)
  const humanDayBuckets = new Map<string, number>();
  const botDayBuckets = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    humanDayBuckets.set(dayKey(d), 0);
    botDayBuckets.set(dayKey(d), 0);
  }
  for (const r of humans30) {
    const k = dayKey(r.ts);
    if (humanDayBuckets.has(k))
      humanDayBuckets.set(k, (humanDayBuckets.get(k) ?? 0) + 1);
  }
  for (const r of bots30) {
    const k = dayKey(r.ts);
    if (botDayBuckets.has(k))
      botDayBuckets.set(k, (botDayBuckets.get(k) ?? 0) + 1);
  }
  const humanDailyData = Array.from(humanDayBuckets.entries()).map(([d, v]) => ({
    date: shortDay(new Date(d + "T12:00:00Z")),
    views: v,
  }));
  const botDailyData = Array.from(botDayBuckets.entries()).map(([d, v]) => ({
    date: shortDay(new Date(d + "T12:00:00Z")),
    views: v,
  }));

  // 24시간 시간대 — 사람 기준 (24h 고정)
  const humanHourBuckets = new Map<string, number>();
  for (let h = 0; h < 24; h++)
    humanHourBuckets.set(String(h).padStart(2, "0"), 0);
  for (const r of recent24Raw) {
    if (detectBot(r.userAgent).isBot) continue;
    humanHourBuckets.set(hourKey(r.ts), (humanHourBuckets.get(hourKey(r.ts)) ?? 0) + 1);
  }
  const humanHourlyData = Array.from(humanHourBuckets.entries()).map(([h, v]) => ({
    hour: h,
    views: v,
  }));

  // 디바이스 분포 (사람만, 선택 기간) — 모바일/태블릿/데스크탑
  const deviceCount = new Map<DeviceType, number>();
  deviceCount.set("mobile", 0);
  deviceCount.set("tablet", 0);
  deviceCount.set("desktop", 0);
  for (const r of humansClean) {
    const d = detectDevice(r.userAgent);
    deviceCount.set(d.type, (deviceCount.get(d.type) ?? 0) + 1);
  }
  const deviceTotal =
    (deviceCount.get("mobile") ?? 0) +
    (deviceCount.get("tablet") ?? 0) +
    (deviceCount.get("desktop") ?? 0);
  const deviceData = (["mobile", "tablet", "desktop"] as DeviceType[]).map((t) => {
    const count = deviceCount.get(t) ?? 0;
    return {
      type: t,
      count,
      pct: deviceTotal > 0 ? Math.round((count / deviceTotal) * 100) : 0,
    };
  });

  // 인기 페이지 (사람만, 선택 기간)
  const humanPathCount = new Map<string, number>();
  for (const r of humansClean) {
    humanPathCount.set(r.path, (humanPathCount.get(r.path) ?? 0) + 1);
  }
  const topHumanPaths = Array.from(humanPathCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // === 이탈 페이지 — 세션의 마지막 PV 가 어느 path 였는지 (사람만, 선택 기간) ===
  // 세션 정의는 위 체류·이탈률 블록과 동일 (같은 sessionId, 30분 공백 = 새 세션).
  // 이탈률 = 그 페이지를 본 세션 중 그 페이지가 마지막이었던 비율. path 는 쿼리 제거해 묶는다.
  const exitCountByPath = new Map<string, number>();
  const seenSessionsByPath = new Map<string, number>();
  {
    const rowsBySid = new Map<string, Array<{ t: number; path: string }>>();
    for (const r of humansClean) {
      if (!r.sessionId) continue;
      const row = { t: r.ts.getTime(), path: r.path.split("?")[0] };
      const arr = rowsBySid.get(r.sessionId);
      if (arr) arr.push(row);
      else rowsBySid.set(r.sessionId, [row]);
    }
    const closeSession = (pages: string[]) => {
      const exit = pages[pages.length - 1];
      exitCountByPath.set(exit, (exitCountByPath.get(exit) ?? 0) + 1);
      for (const p of new Set(pages)) {
        seenSessionsByPath.set(p, (seenSessionsByPath.get(p) ?? 0) + 1);
      }
    };
    for (const rows of rowsBySid.values()) {
      rows.sort((a, b) => a.t - b.t);
      let pages: string[] = [rows[0].path];
      let prev = rows[0].t;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].t - prev > SESSION_GAP_MS) {
          closeSession(pages);
          pages = [rows[i].path];
        } else {
          pages.push(rows[i].path);
        }
        prev = rows[i].t;
      }
      closeSession(pages);
    }
  }
  const topExitPaths = Array.from(exitCountByPath.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, exits]) => {
      const seen = seenSessionsByPath.get(path) ?? exits;
      return { path, exits, seen, rate: Math.round((exits / seen) * 100) };
    });

  // === 회원 이탈(잠수) — 로그인 PV 기준, range 무관 전체 ===
  // userId 는 2026-07-28 배포 이후에만 채워짐 — 그 전 접속은 "기록 없음" 으로 잡힌다.
  const MEMBER_PV_START = new Date("2026-07-28T00:00:00+09:00");
  const CHURN_DAYS = 7;
  const churnCutoff = new Date(now.getTime() - CHURN_DAYS * 24 * 60 * 60 * 1000);
  // memberPvRaw 는 ts desc — userId 첫 등장 행이 곧 마지막 접속
  const lastSeenByUser = new Map<string, { ts: Date; path: string }>();
  for (const r of memberPvRaw) {
    if (!r.userId || lastSeenByUser.has(r.userId)) continue;
    lastSeenByUser.set(r.userId, { ts: r.ts, path: r.path.split("?")[0] });
  }
  const totalUsers = allUsers.length;
  const createdAtByUser = new Map(allUsers.map((u) => [u.id, u.createdAt]));
  let activeMembers = 0; // 최근 7일 접속
  const dormantUsers: Array<{ id: string; ts: Date; path: string }> = [];
  for (const [id, last] of lastSeenByUser) {
    if (last.ts >= churnCutoff) activeMembers++;
    else dormantUsers.push({ id, ts: last.ts, path: last.path });
  }
  const noRecordMembers = totalUsers - lastSeenByUser.size;
  // 잠수 회원이 마지막으로 본 페이지 TOP
  const dormantLastPathAgg = new Map<string, number>();
  for (const u of dormantUsers) {
    dormantLastPathAgg.set(u.path, (dormantLastPathAgg.get(u.path) ?? 0) + 1);
  }
  const topDormantLastPaths = Array.from(dormantLastPathAgg.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  // 가입 → 마지막 접속 간격 (잠수 회원 중 로그인 PV 수집 시작 이후 가입자만 — 그 전
  // 가입자는 초기 활동이 기록에 없어 간격이 왜곡된다)
  const churnGapBuckets: Array<{ label: string; maxDays: number; count: number }> = [
    { label: "가입 당일", maxDays: 1, count: 0 },
    { label: "1~3일", maxDays: 4, count: 0 },
    { label: "4~7일", maxDays: 8, count: 0 },
    { label: "1~2주", maxDays: 15, count: 0 },
    { label: "2주 이상", maxDays: Infinity, count: 0 },
  ];
  let churnGapTotal = 0;
  for (const u of dormantUsers) {
    const created = createdAtByUser.get(u.id);
    if (!created || created < MEMBER_PV_START) continue;
    const days = (u.ts.getTime() - created.getTime()) / (24 * 60 * 60 * 1000);
    const bucket = churnGapBuckets.find((b) => days < b.maxDays);
    if (bucket) {
      bucket.count++;
      churnGapTotal++;
    }
  }

  // 도메인별 (사람만, 선택 기간) — scorebase.kr vs 스코어보드.kr 분리.
  const hostAgg = new Map<string, { pv: number; ids: Set<string> }>();
  for (const r of humansClean) {
    const label = friendlyHost(r.host);
    const e = hostAgg.get(label) ?? { pv: 0, ids: new Set<string>() };
    e.pv++;
    if (r.sessionId) e.ids.add(r.sessionId);
    hostAgg.set(label, e);
  }
  const hostData = Array.from(hostAgg.entries())
    .map(([host, e]) => ({ host, pv: e.pv, unique: e.ids.size }))
    .sort((a, b) => b.pv - a.pv);
  const hostTotalPv = hostData.reduce((s, h) => s + h.pv, 0);

  // === 유입 채널 (사람 랜딩 PV 기준) — 구글/네이버/다음/빙/인스타/스레드/X/직접 ===
  const channelAgg = new Map<TrafficChannel, { count: number; ids: Set<string> }>();
  const referralDomainAgg = new Map<string, number>();
  // 검색 키워드 (네이버·다음·빙 등 referrer 에 남는 검색어 — 구글은 GSC 전용)
  const searchQueryAgg = new Map<string, { count: number; channel: TrafficChannel }>();
  // 외부 유입(직접 제외)이 도착한 랜딩 페이지
  const externalLandingPathAgg = new Map<string, number>();
  let landingTotal = 0;
  for (const r of landingRaw) {
    if (detectBot(r.userAgent).isBot) continue;
    if (r.sessionId && suspiciousSids.has(r.sessionId)) continue; // 위장 스크레이퍼 랜딩 제외
    const { channel, domain } = classifyLanding(r.referrer, r.utmSource);
    const e = channelAgg.get(channel) ?? { count: 0, ids: new Set<string>() };
    e.count++;
    if (r.sessionId) e.ids.add(r.sessionId);
    channelAgg.set(channel, e);
    if (domain) referralDomainAgg.set(domain, (referralDomainAgg.get(domain) ?? 0) + 1);
    const q = extractSearchQuery(r.referrer);
    if (q) {
      const cur = searchQueryAgg.get(q);
      searchQueryAgg.set(q, { count: (cur?.count ?? 0) + 1, channel });
    }
    if (channel !== "direct") {
      externalLandingPathAgg.set(r.path, (externalLandingPathAgg.get(r.path) ?? 0) + 1);
    }
    landingTotal++;
  }
  // 유입 0 인 채널도 행 유지 — 신규 채널(유튜브 등) 개설 후 "잡히고는 있나" 를
  // 표에서 바로 확인하려면 0 행이 보여야 한다.
  const channelData = CHANNEL_ORDER.map((c) => ({
    channel: c,
    count: channelAgg.get(c)?.count ?? 0,
    unique: channelAgg.get(c)?.ids.size ?? 0,
  }));
  const topReferralDomains = Array.from(referralDomainAgg.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50);
  const topSearchQueries = Array.from(searchQueryAgg.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15);
  // 네이버·다음 검색어 (referrer 기반 방문) — 3채널 통합 비교의 한 열.
  const naverDaumQueries = Array.from(searchQueryAgg.entries())
    .filter(([, v]) => v.channel === "naver" || v.channel === "daum")
    .map(([query, v]) => ({ query, count: v.count, channel: v.channel }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const topExternalLandings = Array.from(externalLandingPathAgg.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // === 유입 채널 지난주 대비 — 이번 주(최근 7일) vs 지난주(그 전 7일), range 무관 고정 ===
  // 집계 원칙은 위 채널 집계와 동일(봇 제외·의심 스크레이퍼 제외·classifyLanding) — 기간 축만 주 단위.
  // 의심 봇 휴리스틱의 "기간 내 PV 1개" 판정이 기간 종속이라, 전역 suspiciousSids 대신
  // 각 주 윈도우 기준으로 같은 휴리스틱을 재계산한다 (사람 PV 는 humans30 이 14일을 포함).
  const aggChannelWeek = (from: Date, to: Date) => {
    const weekHumans = humans30.filter((r) => r.ts >= from && r.ts < to);
    const weekRows = landing14Raw.filter((l) => l.ts >= from && l.ts < to);
    const suspiciousWeek = suspiciousSessionIds(weekHumans, weekRows);
    const counts = new Map<TrafficChannel, number>();
    let total = 0;
    for (const l of weekRows) {
      if (detectBot(l.userAgent).isBot) continue;
      if (l.sessionId && suspiciousWeek.has(l.sessionId)) continue;
      const { channel } = classifyLanding(l.referrer, l.utmSource);
      counts.set(channel, (counts.get(channel) ?? 0) + 1);
      total++;
    }
    return { counts, total };
  };
  const weekCur = aggChannelWeek(last7, now);
  const weekPrev = aggChannelWeek(last14, last7);
  // 양주 모두 0 인 채널도 행 유지 (위 channelData 와 동일 이유).
  const weekChannelRows = CHANNEL_ORDER.map((c) => ({
    channel: c,
    cur: weekCur.counts.get(c) ?? 0,
    prev: weekPrev.counts.get(c) ?? 0,
  }));

  // === AI 크롤러 전용 분석 (ChatGPT/Claude/Perplexity 등) ===
  // bots30 / botsRange 안에서 category === "ai" 만 추출 → KPI + top paths + 일별.
  const aiBots30 = bots30.filter((r) => r.botCategory === "ai");
  const aiBotsRange = botsRange.filter((r) => detectBot(r.userAgent).category === "ai");
  const aiTodayPV = aiBots30.filter((r) => r.ts >= today00KST).length;
  const aiYesterdayPV = aiBots30.filter(
    (r) => r.ts >= yesterday00KST && r.ts < today00KST,
  ).length;
  const aiLast24hPV = aiBots30.filter((r) => r.ts >= last24h).length;
  const aiRangePV = aiBotsRange.length;
  // 일별 PV (최근 30일)
  const aiDailyBuckets = new Map<string, number>();
  const allDays30 = new Set<string>();
  {
    for (let i = 0; i < 30; i++) {
      const d = new Date(today00KST.getTime() - i * 24 * 60 * 60 * 1000);
      allDays30.add(dayKey(d));
    }
  }
  for (const day of allDays30) aiDailyBuckets.set(day, 0);
  for (const r of aiBots30) {
    const k = dayKey(r.ts);
    aiDailyBuckets.set(k, (aiDailyBuckets.get(k) ?? 0) + 1);
  }
  const aiDailyData = Array.from(aiDailyBuckets.entries())
    .map(([day, views]) => ({ day, date: shortDay(new Date(day + "T12:00:00Z")), views }))
    .sort((a, b) => a.day.localeCompare(b.day))
    .map(({ date, views }) => ({ date, views }));
  // AI bot 별 PV (이름별)
  const aiBotByName = new Map<string, number>();
  for (const r of aiBotsRange) {
    const info = detectBot(r.userAgent);
    if (!info.name) continue;
    aiBotByName.set(info.name, (aiBotByName.get(info.name) ?? 0) + 1);
  }
  const aiTopBots = Array.from(aiBotByName.entries()).sort((a, b) => b[1] - a[1]);
  // AI bot 이 본 top paths
  const aiPathCount = new Map<string, number>();
  for (const r of aiBotsRange) {
    aiPathCount.set(r.path, (aiPathCount.get(r.path) ?? 0) + 1);
  }
  const aiTopPaths = Array.from(aiPathCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  // 봇 카테고리별 합계 (선택 기간)
  const botCatCount = new Map<BotCategory, number>();
  const botNameCount = new Map<string, { count: number; category: BotCategory }>();
  for (const r of botsRange) {
    const info = detectBot(r.userAgent);
    if (!info.isBot || !info.category || !info.name) continue;
    botCatCount.set(info.category, (botCatCount.get(info.category) ?? 0) + 1);
    const cur = botNameCount.get(info.name);
    botNameCount.set(info.name, {
      count: (cur?.count ?? 0) + 1,
      category: info.category,
    });
  }
  const botCatData = (Object.keys(BOT_CATEGORY_LABEL) as BotCategory[]).map((c) => ({
    category: c,
    count: botCatCount.get(c) ?? 0,
  }));
  const topBots = Array.from(botNameCount.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12);

  // 의심 봇(위장 스크레이퍼) PV 는 봇 쪽으로 집계 — 사람 vs 봇 비율을 정직하게
  const suspectPv = humansRange.length - humansClean.length;
  const totalBots = botsRange.length + suspectPv;
  const totalHumans = humansClean.length;
  const botRatio =
    totalBots + totalHumans > 0
      ? Math.round((totalBots / (totalBots + totalHumans)) * 100)
      : 0;
  const rangeLabel = RANGE_LABEL[range];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">접속자 통계</h1>
        <p className="mt-1 text-sm text-neutral-500">
          실시간은 heartbeat 기준, 기간 통계는 페이지뷰(PV) 기준입니다. 관리자
          영역(/admin)은 제외하고 봇과 사람을 User-Agent로 분리합니다.
        </p>
        <RangeSelector active={range} />
      </header>

      <LivePresencePanel />

      {/* === 사람 트래픽 === */}
      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <span className="text-base">🧑</span>
          <h2 className="text-lg font-bold tracking-tight">사람 트래픽</h2>
          <span className="text-xs text-neutral-500">(봇 제외)</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="누적 PV (전체 — 사람+봇)" value={totalAll} />
          <KpiCard
            label="오늘 방문자"
            value={humanTodayUnique}
            sub={`PV ${humanTodayPV.toLocaleString()}`}
            accent
          />
          <KpiCard
            label="어제 방문자"
            value={humanYesterdayUnique}
            sub={`PV ${humanYesterdayPV.toLocaleString()}`}
          />
          <KpiCard
            label={`${rangeLabel} 방문자`}
            value={humanRangeUnique}
            sub={`PV ${humanRangePV.toLocaleString()}`}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label={`${rangeLabel} 평균 체류`} value={avgSessionLabel} accent sub="페이지 이동으로 관측된 시간만" />
          <KpiCard label="이탈률" value={bounceRate} suffix="%" sub={`1페이지 세션 · 열린 탭 체류 미반영 · 의심 봇 ${suspiciousSids.size.toLocaleString()}세션 제외`} />
          <KpiCard label="세션 수" value={sessionCount} sub={`방문자 ${humanRangeUnique.toLocaleString()}명 기준`} />
          <KpiCard label="세션당 PV" value={sessionCount ? (humanRangePV / sessionCount).toFixed(1) : "0"} sub="페이지 깊이" />
        </div>

        <SectionCard
          title="동시 접속"
          subtitle={`${concurrent.bucketMinutes}분 창 고유 세션 · ${rangeLabel}`}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <KpiCard
              label="피크"
              value={concurrent.peak}
              suffix="명"
              accent
              sub={
                concurrent.peakAt
                  ? `${new Date(concurrent.peakAt.getTime() + 9 * 3_600_000)
                      .toISOString()
                      .replace("T", " ")
                      .slice(5, 16)} KST`
                  : "—"
              }
            />
            <KpiCard label="평균" value={concurrent.avg.toFixed(1)} suffix="명" sub="빈 시간 포함" />
            <KpiCard label="중앙값" value={concurrent.median} suffix="명" />
            <KpiCard label="상위 5%" value={concurrent.p95} suffix="명" sub="붐빌 때 이 정도" />
          </div>
          <ConcurrentHourChart hours={concurrentHours} />
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
                  <th className="py-2 font-medium">날짜 (KST)</th>
                  <th className="py-2 font-medium text-right">피크</th>
                  <th className="py-2 font-medium text-right">시각</th>
                  <th className="py-2 font-medium text-right">평균</th>
                </tr>
              </thead>
              <tbody>
                {concurrentDays.map((d) => (
                  <tr key={d.day} className="border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                    <td className="py-1.5">
                      {d.day.slice(5)} ({DAY_KO[new Date(`${d.day}T00:00:00Z`).getUTCDay()]})
                      {d.partial && <span className="ml-1.5 text-[10px] text-neutral-400">부분</span>}
                    </td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">{d.peak}</td>
                    <td className="py-1.5 text-right text-neutral-500 tabular-nums">{d.peakAt}</td>
                    <td className={`py-1.5 text-right tabular-nums ${d.partial ? "text-neutral-400" : "text-neutral-500"}`}>
                      {d.avg.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-neutral-500 break-keep">
            heartbeat(실시간 패널)는 이력을 남기지 않아 과거 구간은 PV 로 근사합니다 — 같은 창 안에
            PV 를 낸 고유 세션 수(GA 활성 사용자와 같은 정의). 봇 {suspiciousSids.size.toLocaleString()}세션
            제외 기준은 위 방문자 지표와 동일합니다. &quot;부분&quot; 은 조회 구간에 하루가 다 담기지
            않은 날 — 평균은 담긴 시간대만의 값이라 다른 날과 직접 비교하지 마세요.
          </p>
        </SectionCard>

        <SectionCard title="디바이스 분포" subtitle={rangeLabel}>
          {deviceTotal === 0 ? (
            <EmptyHint />
          ) : (
            <ul className="grid grid-cols-3 gap-3">
              {deviceData.map((d) => {
                const meta = DEVICE_LABEL[d.type];
                return (
                  <li
                    key={d.type}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 text-center bg-white dark:bg-neutral-950"
                  >
                    <div className="text-3xl">{meta.emoji}</div>
                    <div className="mt-1 text-xs font-medium text-neutral-500">
                      {meta.label}
                    </div>
                    <div className="mt-1 text-2xl font-black tabular-nums">
                      {d.count.toLocaleString()}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                      {d.pct}%
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${d.pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="최근 30일 PV" subtitle="일별 합계">
          {humans30.length === 0 ? (
            <EmptyHint />
          ) : (
            <DailyArea data={humanDailyData} />
          )}
        </SectionCard>

        <SectionCard title="최근 24시간 시간대 분포" subtitle="KST 0~23시">
          {humanHourlyData.every((h) => h.views === 0) ? (
            <EmptyHint />
          ) : (
            <HourlyBar data={humanHourlyData} />
          )}
        </SectionCard>

        <SectionCard title="인기 페이지" subtitle={rangeLabel}>
          {topHumanPaths.length === 0 ? (
            <EmptyHint />
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {topHumanPaths.map(([path, count], i) => {
                const max = topHumanPaths[0][1];
                const pct = (count / max) * 100;
                return (
                  <li
                    key={path}
                    className="py-2.5 flex items-center gap-3 text-sm"
                  >
                    <span className="w-6 text-right tabular-nums text-neutral-400 font-bold">
                      {i + 1}
                    </span>
                    <a
                      href={path}
                      target="_blank"
                      rel="noopener"
                      className="font-medium hover:underline truncate max-w-[40%]"
                    >
                      {path}
                    </a>
                    <div className="flex-1 h-2 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="tabular-nums text-neutral-500 font-semibold w-12 text-right">
                      {count}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </section>

      {/* === 이탈 분석 (이탈 페이지 + 회원 잠수) === */}
      <section className="space-y-6 pt-2 border-t-2 border-dashed border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2 pt-6">
          <span className="text-base">📉</span>
          <h2 className="text-lg font-bold tracking-tight">이탈 분석</h2>
          <span className="text-xs text-neutral-500">
            어느 페이지에서 나가고, 어떤 회원이 발길을 끊는지
          </span>
        </div>

        <SectionCard
          title="이탈 페이지 TOP 10"
          subtitle={`${rangeLabel} · 세션의 마지막 페이지 기준 · 의심 봇 제외`}
        >
          {topExitPaths.length === 0 ? (
            <EmptyHint />
          ) : (
            <>
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {topExitPaths.map((e, i) => {
                  const max = topExitPaths[0].exits;
                  const pct = (e.exits / max) * 100;
                  return (
                    <li key={e.path} className="py-2.5 flex items-center gap-3 text-sm">
                      <span className="w-6 text-right tabular-nums text-neutral-400 font-bold">
                        {i + 1}
                      </span>
                      <a
                        href={e.path}
                        target="_blank"
                        rel="noopener"
                        className="font-medium hover:underline truncate max-w-[36%]"
                      >
                        {e.path}
                      </a>
                      <div className="flex-1 h-2 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                        <div className="h-full bg-rose-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="tabular-nums text-neutral-500 font-semibold w-16 text-right">
                        {e.exits.toLocaleString()}
                      </span>
                      <span
                        className="tabular-nums w-24 text-right text-xs text-neutral-500"
                        title="그 페이지를 본 세션 중 그 페이지가 마지막이었던 비율"
                      >
                        이탈률 {e.rate}%
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-[11px] text-neutral-500 leading-relaxed">
                이탈률 = 그 페이지를 본 세션 중 그 페이지에서 방문이 끝난 비율.
                많이 보이는 페이지일수록 이탈 세션 수도 자연히 크니, 순위(절대 수)와
                이탈률(비율)을 같이 보세요.
              </p>
            </>
          )}
        </SectionCard>

        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">회원 잠수 현황</h3>
          <span className="text-xs text-neutral-500">
            로그인 PV 기준 · 기간 선택과 무관 · 수집 시작 2026-07-28
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="전체 회원" value={totalUsers} />
          <KpiCard
            label={`최근 ${CHURN_DAYS}일 접속`}
            value={activeMembers}
            accent
            sub="로그인 상태 PV 있음"
          />
          <KpiCard
            label={`잠수 회원 (${CHURN_DAYS}일+ 무접속)`}
            value={dormantUsers.length}
            sub="접속 기록 있는 회원 중"
          />
          <KpiCard
            label="접속 기록 없음"
            value={noRecordMembers}
            sub="7-28 이후 로그인 PV 0건"
          />
        </div>

        <SectionCard
          title="잠수 회원이 마지막으로 본 페이지 TOP 10"
          subtitle={`${CHURN_DAYS}일 이상 무접속 회원 ${dormantUsers.length.toLocaleString()}명`}
        >
          {topDormantLastPaths.length === 0 ? (
            <EmptyHint message="아직 잠수 판정 가능한 회원이 없습니다. 로그인 PV 수집이 2026-07-28 시작이라 8월 초부터 채워집니다." />
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {topDormantLastPaths.map(([path, count], i) => {
                const max = topDormantLastPaths[0][1];
                const pct = (count / max) * 100;
                return (
                  <li key={path} className="py-2.5 flex items-center gap-3 text-sm">
                    <span className="w-6 text-right tabular-nums text-neutral-400 font-bold">
                      {i + 1}
                    </span>
                    <a
                      href={path}
                      target="_blank"
                      rel="noopener"
                      className="font-medium hover:underline truncate max-w-[40%]"
                    >
                      {path}
                    </a>
                    <div className="flex-1 h-2 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                      <div className="h-full bg-rose-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="tabular-nums text-neutral-500 font-semibold w-12 text-right">
                      {count}명
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="가입 후 며칠 만에 잠수하나"
          subtitle={`7-28 이후 가입한 잠수 회원 ${churnGapTotal.toLocaleString()}명 · 가입일 → 마지막 접속 간격`}
        >
          {churnGapTotal === 0 ? (
            <EmptyHint message="아직 표본이 없습니다. 로그인 PV 수집 시작(7-28) 이후 가입한 회원이 잠수로 판정되면 채워집니다." />
          ) : (
            <ul className="space-y-2">
              {churnGapBuckets.map((b) => {
                const pct = Math.round((b.count / churnGapTotal) * 100);
                return (
                  <li key={b.label} className="flex items-center gap-3 text-sm">
                    <span className="w-20 text-neutral-500 font-medium">{b.label}</span>
                    <div className="flex-1 h-2 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                      <div className="h-full bg-rose-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="tabular-nums text-neutral-500 font-semibold w-20 text-right">
                      {b.count}명 ({pct}%)
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <p className="text-xs text-neutral-500 leading-relaxed">
          ⓘ 잠수 판정은 로그인 상태 PV(2026-07-28 수집 시작) 기준이라, 그 전에만
          활동한 회원은 &quot;접속 기록 없음&quot; 으로 잡힙니다. 수집 {CHURN_DAYS}일
          경과 전까지는 잠수 회원이 0으로 보이는 게 정상입니다.
        </p>
      </section>

      {/* === 유입 채널 === */}
      <section className="space-y-6 pt-2 border-t-2 border-dashed border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2 pt-6">
          <span className="text-base">🚪</span>
          <h2 className="text-lg font-bold tracking-tight">유입 채널</h2>
          <span className="text-xs text-neutral-500">
            (사람 · 랜딩 기준 · {rangeLabel}) — 구글/네이버/SNS/직접
          </span>
        </div>

        <SectionCard title="어디서 들어왔나" subtitle={`유입 ${landingTotal.toLocaleString()}회`}>
          {landingTotal === 0 ? (
            <EmptyHint message="유입 기록은 2026-06-11 기능 추가 이후 랜딩 PV부터 쌓입니다. 하루 정도 지나면 채널 분포가 보입니다." />
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {channelData.map((c) => {
                const meta = CHANNEL_META[c.channel];
                const max = Math.max(...channelData.map((x) => x.count));
                const pct = max > 0 ? (c.count / max) * 100 : 0;
                const share =
                  landingTotal > 0 ? Math.round((c.count / landingTotal) * 100) : 0;
                return (
                  <li
                    key={c.channel}
                    className={`py-2.5 flex items-center gap-3 text-sm${c.count === 0 ? " opacity-40" : ""}`}
                  >
                    <span className="text-base w-6 text-center">{meta.emoji}</span>
                    <span className="font-medium truncate w-40 sm:w-48">{meta.label}</span>
                    <div className="flex-1 h-2 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                      <div className="h-full bg-sky-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="tabular-nums text-neutral-500 font-semibold w-36 text-right">
                      방문자 {c.unique.toLocaleString()} · {c.count.toLocaleString()}회
                      <span className="text-neutral-400"> ({share}%)</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="지난주 대비"
          subtitle="이번 주 = 최근 7일 · 지난주 = 그 전 7일 (기간 선택과 무관)"
        >
          {weekCur.total === 0 && weekPrev.total === 0 ? (
            <EmptyHint message="최근 14일 랜딩 유입이 없어 비교할 데이터가 없습니다." />
          ) : (
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
                  <th className="text-left font-medium pb-2 pr-2">채널</th>
                  <th className="text-right font-medium pb-2 px-1 w-20">이번 주</th>
                  <th className="text-right font-medium pb-2 px-1 w-20">지난주</th>
                  <th className="text-right font-medium pb-2 pl-1 w-36">증감</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                <tr className="font-bold bg-neutral-50 dark:bg-neutral-900/60">
                  <td className="py-2.5 pr-2">전체 (사람 랜딩)</td>
                  <td className="py-2.5 px-1 text-right tabular-nums">
                    {weekCur.total.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-1 text-right tabular-nums text-neutral-500">
                    {weekPrev.total.toLocaleString()}
                  </td>
                  <td className="py-2.5 pl-1 text-right">
                    <WeekDelta cur={weekCur.total} prev={weekPrev.total} />
                  </td>
                </tr>
                {weekChannelRows.map((r) => (
                  <tr
                    key={r.channel}
                    className={r.cur === 0 && r.prev === 0 ? "opacity-40" : undefined}
                  >
                    <td className="py-2 pr-2 truncate">
                      <span className="mr-1.5">{CHANNEL_META[r.channel].emoji}</span>
                      <span className="font-medium">{CHANNEL_META[r.channel].label}</span>
                    </td>
                    <td className="py-2 px-1 text-right tabular-nums font-semibold">
                      {r.cur.toLocaleString()}
                    </td>
                    <td className="py-2 px-1 text-right tabular-nums text-neutral-500">
                      {r.prev.toLocaleString()}
                    </td>
                    <td className="py-2 pl-1 text-right">
                      <WeekDelta cur={r.cur} prev={r.prev} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard
            title="검색 키워드 (네이버·다음·빙)"
            subtitle={`${rangeLabel} · 검색 유입 ${topSearchQueries.reduce((s, [, v]) => s + v.count, 0)}회`}
          >
            {topSearchQueries.length === 0 ? (
              <EmptyHint message="아직 검색어가 잡힌 유입이 없습니다. 네이버·다음 검색 유입부터 쌓입니다 (구글·빙 검색어는 아래 '검색 성과' 섹션에서 확인 — referrer 에 검색어를 안 남김)." />
            ) : (
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {topSearchQueries.map(([query, info], i) => {
                  const max = topSearchQueries[0][1].count;
                  const pct = max > 0 ? (info.count / max) * 100 : 0;
                  return (
                    <li key={query} className="py-2 flex items-center gap-3 text-sm">
                      <span className="w-5 text-right tabular-nums text-neutral-400 font-bold">
                        {i + 1}
                      </span>
                      <span className="text-base">{CHANNEL_META[info.channel].emoji}</span>
                      <span className="font-medium truncate max-w-[45%]">{query}</span>
                      <div className="flex-1 h-1.5 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                        <div className="h-full bg-teal-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="tabular-nums text-neutral-500 font-semibold w-10 text-right">
                        {info.count}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="외부 유입 랜딩 페이지 TOP 10" subtitle={`${rangeLabel} · 직접 제외`}>
            {topExternalLandings.length === 0 ? (
              <EmptyHint message="외부(검색·SNS·타 사이트) 유입이 도착한 페이지가 아직 없습니다." />
            ) : (
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {topExternalLandings.map(([path, count], i) => {
                  const max = topExternalLandings[0][1];
                  const pct = max > 0 ? (count / max) * 100 : 0;
                  return (
                    <li key={path} className="py-2 flex items-center gap-3 text-xs">
                      <span className="w-5 text-right tabular-nums text-neutral-400 font-bold">
                        {i + 1}
                      </span>
                      <a
                        href={path}
                        target="_blank"
                        rel="noopener"
                        className="font-mono truncate max-w-[55%] hover:underline"
                      >
                        {path}
                      </a>
                      <div className="flex-1 h-1.5 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                        <div className="h-full bg-indigo-400/80" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="tabular-nums text-neutral-500 font-semibold w-10 text-right">
                        {count}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </div>

        {topReferralDomains.length > 0 && (
          <SectionCard
            title={`기타 사이트 상세 (referral ${topReferralDomains.length}개)`}
            subtitle={rangeLabel}
          >
            {(() => {
              const max = topReferralDomains[0][1];
              const row = ([domain, count]: [string, number], i: number) => {
                const pct = max > 0 ? (count / max) * 100 : 0;
                return (
                  <li key={domain} className="py-2 flex items-center gap-3 text-sm">
                    <span className="w-6 text-right tabular-nums text-neutral-400 font-bold">
                      {i + 1}
                    </span>
                    <span className="font-mono text-xs truncate max-w-[45%]">{domain}</span>
                    <div className="flex-1 h-1.5 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                      <div className="h-full bg-sky-400/80" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="tabular-nums text-neutral-500 font-semibold w-10 text-right">
                      {count}
                    </span>
                  </li>
                );
              };
              const head = topReferralDomains.slice(0, 10);
              const rest = topReferralDomains.slice(10);
              return (
                <>
                  <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {head.map(row)}
                  </ul>
                  {rest.length > 0 && (
                    <details className="group mt-1">
                      <summary className="cursor-pointer list-none py-2 text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline select-none">
                        <span className="group-open:hidden">
                          + 나머지 {rest.length}개 펼치기
                        </span>
                        <span className="hidden group-open:inline">접기</span>
                      </summary>
                      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 border-t border-neutral-200 dark:border-neutral-800">
                        {rest.map((entry, i) => row(entry, i + 10))}
                      </ul>
                    </details>
                  )}
                </>
              );
            })()}
          </SectionCard>
        )}

        <p className="text-xs text-neutral-500 leading-relaxed">
          ⓘ 랜딩(외부→사이트 첫 진입) 1회 = 1유입으로 집계 — 내부 페이지 이동은 세지 않습니다.
          referrer 를 안 남기는 유입(즐겨찾기·주소창 직접 입력 + 카카오톡 등 일부 앱)은 모두
          &ldquo;직접&rdquo;에 합산되므로, SNS 수치는 하한선으로 보는 게 정확합니다. 인스타그램·스레드·X
          인앱 브라우저는 대부분 referrer 가 잡힙니다. 기록은 2026-06-11 이후 PV부터.
          <br />
          ⓘ <strong>구글 검색어</strong>는 구글이 referrer 에서 숨겨(2011~) 여기서 볼 수 없습니다 —
          바로 아래 <strong>&lsquo;구글 검색 성과&rsquo; 섹션</strong>(Search Console 연동)에서 노출·클릭·순위까지
          확인하세요. 네이버·다음은 referrer 에 검색어가 남아 위 표에 잡히고, 빙은 아래 &lsquo;빙 검색 성과&rsquo; 섹션에서 봅니다.
          <br />
          ⓘ SNS 프로필·공유 링크에 <code>?utm_source=instagram</code> / <code>threads</code> /{" "}
          <code>x</code> / <code>kakao</code> 를 붙이면 referrer 가 안 남는 인앱 유입도 100% 해당
          채널로 분류됩니다 (카카오톡은 utm 없이는 식별 불가).
        </p>
      </section>

      {/* === 검색 채널 종합 비교 (구글·빙·네이버/다음 한 화면) === */}
      <section className="space-y-4 pt-2 border-t-2 border-dashed border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2 pt-6">
          <span className="text-base">🔍</span>
          <h2 className="text-lg font-bold tracking-tight">검색 채널 종합 비교</h2>
          <span className="text-xs text-neutral-500">구글 · 빙 · 네이버/다음 한 화면</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SearchCompareColumn
            emoji="🟢"
            label="구글"
            sub="GSC · 최근 28일 · 노출순"
            metricLabel="노출"
            summary={
              gsc.totals28
                ? `클릭 ${gsc.totals28.clicks.toLocaleString()} · 노출 ${gsc.totals28.impressions.toLocaleString()}`
                : gsc.configured
                  ? "데이터 없음"
                  : "연동 대기"
            }
            // 클릭순이면 클릭 0 검색어가 다 밀려 "구글에 뭐가 뜨는지"를 못 본다 — 노출순.
            rows={gsc.queriesByImpressions28.slice(0, 10).map((r) => ({
              query: r.keys[0] ?? "",
              value: r.impressions.toLocaleString(),
            }))}
            emptyHint="구글 검색어 데이터 없음 (색인·노출 누적 대기)"
          />
          <SearchCompareColumn
            emoji="🔷"
            label="빙"
            sub="Bing Webmaster"
            metricLabel="클릭"
            summary={
              bing.totals
                ? `클릭 ${bing.totals.clicks.toLocaleString()} · 노출 ${bing.totals.impressions.toLocaleString()}`
                : bing.configured
                  ? "데이터 없음"
                  : "연동 대기"
            }
            rows={bing.queries.slice(0, 10).map((q) => ({
              query: q.query,
              value: q.clicks.toLocaleString(),
            }))}
            emptyHint="빙 검색어 데이터 없음"
          />
          <SearchCompareColumn
            emoji="🟩"
            label="네이버·다음"
            sub={`referrer 방문 · ${rangeLabel}`}
            metricLabel="방문"
            summary={`방문 ${naverDaumQueries.reduce((s, q) => s + q.count, 0).toLocaleString()}회`}
            rows={naverDaumQueries.map((q) => ({
              query: q.query,
              value: q.count.toLocaleString(),
            }))}
            emptyHint="네이버·다음 검색 유입 아직 없음"
          />
        </div>
        <p className="text-xs text-neutral-500 leading-relaxed">
          ⓘ 측정 단위가 채널마다 다릅니다. <strong>구글·빙</strong>은 Search Console/Webmaster API 의
          노출 기반 클릭(검색결과에 뜬 뒤 눌린 수), <strong>네이버·다음</strong>은 우리 사이트 PV
          로그의 referrer 에 남은 실제 방문 검색어입니다. 기간도 제각각(구글 28일·빙 API 기본·
          네이버/다음 {rangeLabel})이라 절대 수치 비교보다 <strong>채널별 검색어 구성</strong> 비교로
          보세요. 채널별 상세·기회 검색어는 아래 각 섹션에 있습니다.
        </p>
      </section>

      {/* === 기회 검색어 (보강 타겟) — 구글·빙 통합 === */}
      <section className="space-y-4 pt-2 border-t-2 border-dashed border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2 pt-6">
          <span className="text-base">🎯</span>
          <h2 className="text-lg font-bold tracking-tight">기회 검색어 (보강 타겟)</h2>
          <span className="text-xs text-neutral-500">
            노출 있는데 {OPP_MIN_POSITION}~{OPP_MAX_POSITION}위라 클릭 못 받는 검색어 · 잠재 클릭순
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard
            title="🟢 구글 기회 검색어"
            subtitle={`최근 28일 · ${gsc.opportunities.length}개`}
          >
            {!gsc.configured ? (
              <EmptyHint message="구글(GSC) 연동 대기 — 아래 '구글 검색 성과' 섹션 참고." />
            ) : gsc.error ? (
              <EmptyHint message="GSC 호출 실패 — 아래 '구글 검색 성과' 섹션에서 원인 확인." />
            ) : gsc.opportunities.length === 0 ? (
              // 색인 초기엔 검색어당 노출이 1~2회라 기회 기준(10회+)을 아무도 못 넘는다.
              // 빈 칸 대신 "구글에 뜨기 시작한 검색어"를 노출순으로 보여준다.
              gsc.queriesByImpressions28.length === 0 ? (
                <EmptyHint message="구글 노출 검색어 없음 (색인·노출 누적 대기)." />
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-neutral-500">
                    기회 기준(노출 {OPP_MIN_IMPRESSIONS}회+ · {OPP_MIN_POSITION}~
                    {OPP_MAX_POSITION}위)을 넘은 검색어는 아직 없습니다. 대신 지금 구글에 뜨는
                    검색어를 노출순으로 봅니다.
                  </p>
                  <OpportunityTable rows={gsc.queriesByImpressions28} engine="google" />
                </div>
              )
            ) : (
              <OpportunityTable rows={gsc.opportunities} engine="google" />
            )}
          </SectionCard>

          <SectionCard
            title="🔷 빙 기회 검색어"
            subtitle={`Bing Webmaster · ${bing.opportunities.length}개`}
          >
            {!bing.configured ? (
              <EmptyHint message="빙 연동 대기 — 아래 '빙 검색 성과' 섹션 참고." />
            ) : bing.error ? (
              <EmptyHint message="빙 호출 실패 — 아래 '빙 검색 성과' 섹션에서 원인 확인." />
            ) : bing.opportunities.length === 0 ? (
              <EmptyHint message={`기회 검색어 없음 (노출 10회+ · ${OPP_MIN_POSITION}~${OPP_MAX_POSITION}위 조건).`} />
            ) : (
              <OpportunityTable
                rows={bing.opportunities.map((q) => ({
                  keys: [q.query],
                  clicks: q.clicks,
                  impressions: q.impressions,
                  ctr: q.ctr,
                  position: q.position,
                }))}
                engine="bing"
              />
            )}
          </SectionCard>
        </div>
        <p className="text-xs text-neutral-500 leading-relaxed">
          ⓘ <strong>기회 검색어</strong>는 검색 노출(수요)은 있는데 순위가 낮아 클릭을 못 받는 것 —
          해당 주제 글·페이지를 보강하거나 새로 쓰면 순위·클릭을 끌어올릴 1순위 타겟입니다.{" "}
          <strong>잠재 클릭</strong>은 그 검색어가 상위(약 3위권)로 올라갔을 때 더 얻을 수 있는
          클릭의 추정치(우선순위 비교용 근사값)입니다. 검색어를 누르면 실제 검색 결과가 열려 현재
          우리 노출·경쟁 페이지를 바로 확인할 수 있습니다. {OPP_MAX_POSITION}위 밖은 단기 보강으로
          진입이 어려워 제외했습니다.
        </p>
      </section>

      {/* === 구글 검색 성과 (GSC) === */}
      <section className="space-y-6 pt-2 border-t-2 border-dashed border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2 pt-6">
          <span className="text-base">🔎</span>
          <h2 className="text-lg font-bold tracking-tight">구글 검색 성과</h2>
          <span className="text-xs text-neutral-500">
            (Google Search Console · 확정 데이터 2~3일 지연)
          </span>
        </div>

        {!gsc.configured ? (
          <SectionCard title="GSC 연동 대기" subtitle="인증 환경변수 미설정">
            <div className="text-sm text-neutral-500 leading-relaxed py-2 space-y-2">
              <p>
                Google Search Console API 를 연동하면 구글 검색어별
                노출·클릭·CTR·평균순위가 여기 표시됩니다. 인증 방법 (둘 중 하나):
              </p>
              <ol className="list-decimal list-inside space-y-1">
                <li>
                  <strong>OAuth (속성 소유자 계정 — 권장)</strong>: Cloud Console 에서 데스크톱 앱
                  OAuth 클라이언트 생성 → 1회 동의로 refresh token 발급 →{" "}
                  <code>GSC_OAUTH_CLIENT_ID</code> / <code>GSC_OAUTH_CLIENT_SECRET</code> /{" "}
                  <code>GSC_OAUTH_REFRESH_TOKEN</code> 등록
                </li>
                <li>
                  <strong>서비스 계정</strong>: Search Console API 활성화 → 서비스 계정 키 JSON →
                  GSC 속성 [설정 → 사용자 및 권한] 에 <strong>제한된 사용자</strong>로 추가 →{" "}
                  <code>GSC_SERVICE_ACCOUNT_JSON</code> 등록 (GSC 가 서비스 계정 추가를
                  거부하면 1번 방식 사용)
                </li>
              </ol>
              <p>.env.local 과 Vercel 양쪽에 등록해야 합니다.</p>
            </div>
          </SectionCard>
        ) : gsc.error ? (
          <SectionCard title="GSC 호출 실패" subtitle="설정 점검 필요">
            <div className="text-sm text-red-600 dark:text-red-400 py-4 break-all">
              {gsc.error}
            </div>
          </SectionCard>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard
                label="클릭 (최근 7일)"
                value={gsc.totals7?.clicks ?? 0}
                accent
                sub={gsc.totals7 ? `CTR ${(gsc.totals7.ctr * 100).toFixed(1)}%` : undefined}
              />
              <KpiCard
                label="노출 (최근 7일)"
                value={gsc.totals7?.impressions ?? 0}
                sub={gsc.totals7 ? `평균 ${gsc.totals7.position.toFixed(1)}위` : undefined}
              />
              <KpiCard
                label="클릭 (최근 28일)"
                value={gsc.totals28?.clicks ?? 0}
                sub={gsc.totals28 ? `CTR ${(gsc.totals28.ctr * 100).toFixed(1)}%` : undefined}
              />
              <KpiCard
                label="노출 (최근 28일)"
                value={gsc.totals28?.impressions ?? 0}
                sub={gsc.totals28 ? `평균 ${gsc.totals28.position.toFixed(1)}위` : undefined}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SectionCard
                title="구글 검색어 TOP 20"
                subtitle={`최근 7일 (${gsc.range7.start} ~ ${gsc.range7.end})`}
              >
                {gsc.queries7.length === 0 ? (
                  <EmptyHint message="해당 기간 구글 검색 데이터가 없습니다. GSC 는 2~3일 지연되므로 최근 유입은 아직 안 보일 수 있습니다." />
                ) : (
                  <GscTable rows={gsc.queries7} keyLabel="검색어" />
                )}
              </SectionCard>

              <SectionCard
                title="구글 검색어 TOP 20"
                subtitle={`최근 28일 (${gsc.range28.start} ~ ${gsc.range28.end})`}
              >
                {gsc.queries28.length === 0 ? (
                  <EmptyHint message="해당 기간 구글 검색 데이터가 없습니다." />
                ) : (
                  <GscTable rows={gsc.queries28} keyLabel="검색어" />
                )}
              </SectionCard>
            </div>

            <SectionCard
              title="클릭 많은 페이지 TOP 10"
              subtitle={`최근 28일 (${gsc.range28.start} ~ ${gsc.range28.end}) · 구글 검색 유입`}
            >
              {gsc.pages28.length === 0 ? (
                <EmptyHint message="해당 기간 구글 검색으로 클릭된 페이지가 없습니다." />
              ) : (
                <GscTable rows={gsc.pages28} keyLabel="페이지" isPage />
              )}
            </SectionCard>
          </>
        )}

        <p className="text-xs text-neutral-500 leading-relaxed">
          ⓘ GSC 데이터는 구글이 <strong>2~3일 후 확정</strong>하므로 오늘·어제 검색 유입은 아직
          반영되지 않습니다 (조회 종료일 = 오늘−3일, 구글 PT 기준 일자). 수치는 1시간 캐시되어
          Search Console 웹 화면과 약간 차이날 수 있습니다.
          {gsc.siteUrl && (
            <>
              {" "}
              연동 속성: <code>{gsc.siteUrl}</code>
            </>
          )}
        </p>
      </section>

      {/* === 빙 검색 성과 (Bing Webmaster) === */}
      <section className="space-y-6 pt-2 border-t-2 border-dashed border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2 pt-6">
          <span className="text-base">🔷</span>
          <h2 className="text-lg font-bold tracking-tight">빙 검색 성과</h2>
          <span className="text-xs text-neutral-500">(Bing Webmaster Tools)</span>
        </div>

        {!bing.configured ? (
          <SectionCard title="빙 연동 대기" subtitle="API 키 미설정">
            <div className="text-sm text-neutral-500 leading-relaxed py-2 space-y-2">
              <p>
                빙도 구글처럼 referrer 에 검색어를 안 남기므로(위 검색어 표에 안 잡힘),
                빙 검색어는 Bing Webmaster Tools API 로만 볼 수 있습니다. 셋업:
              </p>
              <ol className="list-decimal list-inside space-y-1">
                <li>
                  <a href="https://www.bing.com/webmasters" target="_blank" rel="noopener noreferrer" className="underline">
                    bing.com/webmasters
                  </a>{" "}
                  에서 사이트 등록·소유권 인증 (GSC 에서 가져오기 지원)
                </li>
                <li>설정 → API 액세스 → <strong>API 키 생성</strong></li>
                <li>
                  <code>BING_WEBMASTER_API_KEY</code> 등록 (.env.local + Vercel). 등록 URL 이{" "}
                  <code>https://www.scorebase.kr</code> 와 다르면 <code>BING_SITE_URL</code> 도 지정
                </li>
              </ol>
            </div>
          </SectionCard>
        ) : bing.error ? (
          <SectionCard title="빙 호출 실패" subtitle="설정 점검 필요">
            <div className="text-sm text-red-600 dark:text-red-400 py-4 break-all">{bing.error}</div>
          </SectionCard>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <KpiCard label="클릭 (빙)" value={bing.totals?.clicks ?? 0} accent />
              <KpiCard label="노출 (빙)" value={bing.totals?.impressions ?? 0} />
            </div>
            <SectionCard title="빙 검색어 TOP 20" subtitle="클릭순 · Bing Webmaster Tools 집계">
              {bing.queries.length === 0 ? (
                <EmptyHint message="빙 검색어 데이터가 아직 없습니다. 사이트 등록 직후면 며칠 뒤부터 쌓입니다." />
              ) : (
                <GscTable
                  rows={bing.queries.map((q) => ({
                    keys: [q.query],
                    clicks: q.clicks,
                    impressions: q.impressions,
                    ctr: q.ctr,
                    position: q.position,
                  }))}
                  keyLabel="검색어"
                />
              )}
            </SectionCard>
            <p className="text-xs text-neutral-500 leading-relaxed">
              ⓘ 빙은 referrer 에 검색어를 안 남겨(구글과 동일) 위 &lsquo;검색어&rsquo; 표엔 안 잡힙니다 —
              빙 검색어는 이 섹션이 유일한 소스입니다. 빙 기회 검색어(보강 타겟)는 위{" "}
              <strong>&lsquo;기회 검색어&rsquo; 섹션</strong>에서 구글과 나란히 봅니다. 수치는 1시간 캐시됩니다.
              {bing.siteUrl && (
                <>
                  {" "}
                  연동 사이트: <code>{bing.siteUrl}</code>
                </>
              )}
            </p>
          </>
        )}
      </section>

      {/* === 도메인별 === */}
      <section className="space-y-6 pt-2 border-t-2 border-dashed border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2 pt-6">
          <span className="text-base">🌐</span>
          <h2 className="text-lg font-bold tracking-tight">도메인별</h2>
          <span className="text-xs text-neutral-500">(사람 기준 · {rangeLabel})</span>
        </div>

        <SectionCard title="도메인별 방문자·PV" subtitle={rangeLabel}>
          {hostData.length === 0 ? (
            <EmptyHint message="아직 도메인이 기록된 방문이 없습니다. host 기록은 추가(2026-06-04) 이후 PV 부터 — 이전 PV 는 '도메인 미상'." />
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {hostData.map((h, i) => {
                const max = hostData[0].pv;
                const pct = max > 0 ? (h.pv / max) * 100 : 0;
                const share = hostTotalPv > 0 ? Math.round((h.pv / hostTotalPv) * 100) : 0;
                return (
                  <li key={h.host} className="py-2.5 flex items-center gap-3 text-sm">
                    <span className="w-6 text-right tabular-nums text-neutral-400 font-bold">
                      {i + 1}
                    </span>
                    <span className="font-medium truncate max-w-[38%]">{h.host}</span>
                    <div className="flex-1 h-2 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                      <div className="h-full bg-violet-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="tabular-nums text-neutral-500 font-semibold w-32 text-right">
                      방문자 {h.unique.toLocaleString()} · PV {h.pv.toLocaleString()}
                      <span className="text-neutral-400"> ({share}%)</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <p className="text-xs text-neutral-500 leading-relaxed">
          ⓘ scorebase.kr 과 스코어보드.kr 은 같은 앱을 공유합니다. 스코어보드.kr 루트(/)는
          /scores 화면으로 rewrite 되며 URL 은 유지됩니다. host 기록은 이 기능 추가 시점부터라
          이전 PV 는 “도메인 미상”으로 합산됩니다. (봇 제외, 사람 기준)
        </p>
      </section>

      {/* === AI 크롤러 전용 (ChatGPT/Claude/Perplexity 등) === */}
      <section className="space-y-6 pt-2 border-t-2 border-dashed border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2 pt-6">
          <span className="text-base">🤖</span>
          <h2 className="text-lg font-bold tracking-tight">AI 크롤러</h2>
          <span className="text-xs text-neutral-500">
            (GPTBot · ClaudeBot · PerplexityBot · Google-Extended · Applebot 등)
          </span>
        </div>

        {/* KPI — 오늘/어제/24h/기간 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="오늘 AI PV" value={aiTodayPV} accent sub="ChatGPT·Claude 등" />
          <KpiCard label="어제 AI PV" value={aiYesterdayPV} sub="비교 baseline" />
          <KpiCard label="최근 24시간" value={aiLast24hPV} sub="rolling window" />
          <KpiCard label={`${rangeLabel} AI PV`} value={aiRangePV} sub="기간 합계" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard title="AI 봇별 PV" subtitle={rangeLabel}>
            {aiTopBots.length === 0 ? (
              <EmptyHint message="AI 크롤러 방문이 아직 없습니다. 색인되면 GPTBot/ClaudeBot 등이 잡힙니다." />
            ) : (
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {aiTopBots.map(([name, count], i) => {
                  const max = aiTopBots[0][1];
                  const pct = max > 0 ? (count / max) * 100 : 0;
                  return (
                    <li key={name} className="py-2.5 flex items-center gap-3 text-sm">
                      <span className="w-6 text-right tabular-nums text-neutral-400 font-bold">
                        {i + 1}
                      </span>
                      <span className="font-medium truncate max-w-[50%]">{name}</span>
                      <div className="flex-1 h-2 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-neutral-600 dark:text-neutral-300 font-semibold w-12 text-right">
                        {count}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="AI 봇이 본 페이지 TOP 15" subtitle={rangeLabel}>
            {aiTopPaths.length === 0 ? (
              <EmptyHint />
            ) : (
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {aiTopPaths.map(([path, count], i) => {
                  const max = aiTopPaths[0][1];
                  const pct = max > 0 ? (count / max) * 100 : 0;
                  return (
                    <li key={path} className="py-2 flex items-center gap-3 text-xs">
                      <span className="w-5 text-right tabular-nums text-neutral-400 font-bold">
                        {i + 1}
                      </span>
                      <Link
                        href={path}
                        target="_blank"
                        className="font-mono truncate max-w-[55%] hover:underline text-emerald-700 dark:text-emerald-400"
                      >
                        {path}
                      </Link>
                      <div className="flex-1 h-1.5 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                        <div className="h-full bg-emerald-400/80" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="tabular-nums text-neutral-500 font-semibold w-10 text-right">
                        {count}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </div>

        <SectionCard title="최근 30일 AI 봇 PV" subtitle="일별 합계 — 인용·색인 추세">
          {aiBots30.length === 0 ? (
            <EmptyHint />
          ) : (
            <DailyArea data={aiDailyData} />
          )}
        </SectionCard>

        <p className="text-xs text-neutral-500 leading-relaxed">
          ⓘ AI 크롤러가 우리 사이트를 fetch 하면 ChatGPT/Claude/Perplexity 답변에 인용될
          가능성이 높아집니다. <code>llms.txt</code> + SportsEvent JSON-LD 가 색인 품질에 영향.
        </p>
      </section>

      {/* === 봇 트래픽 (전체) === */}
      <section className="space-y-6 pt-2 border-t-2 border-dashed border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2 pt-6">
          <span className="text-base">🕷</span>
          <h2 className="text-lg font-bold tracking-tight">전체 봇 트래픽</h2>
          <span className="text-xs text-neutral-500">
            검색엔진 / AI 크롤러 / SNS 미리보기 / 모니터 등
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label={`봇 비율 (${rangeLabel})`} value={botRatio} suffix="%" />
          <KpiCard label="봇 오늘" value={botToday} accent />
          <KpiCard label="봇 어제" value={botYesterday} />
          <KpiCard label={`봇 ${rangeLabel}`} value={botRangeCount} />
        </div>

        <SectionCard title={`봇 카테고리 분포 (${rangeLabel})`} subtitle="유형별 합계">
          {totalBots === 0 ? (
            <EmptyHint message="봇 트래픽이 잡히지 않았습니다." />
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              {botCatData.map((c) => {
                const meta = BOT_CATEGORY_LABEL[c.category];
                const pct =
                  totalBots > 0 ? Math.round((c.count / totalBots) * 100) : 0;
                return (
                  <li
                    key={c.category}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 text-center bg-white dark:bg-neutral-950"
                  >
                    <div className="text-2xl">{meta.emoji}</div>
                    <div className="mt-1 text-[11px] font-medium text-neutral-500">
                      {meta.label}
                    </div>
                    <div className="mt-0.5 text-lg font-bold tabular-nums">
                      {c.count}
                    </div>
                    <div className="text-[10px] text-neutral-400">{pct}%</div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="최근 30일 봇 PV" subtitle="일별 합계">
          {bots30.length === 0 ? (
            <EmptyHint />
          ) : (
            <DailyArea data={botDailyData} />
          )}
        </SectionCard>

        <SectionCard title={`봇 TOP 12 (${rangeLabel})`} subtitle="이름별 PV">
          {topBots.length === 0 ? (
            <EmptyHint />
          ) : (
            <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {topBots.map(([name, info], i) => {
                const max = topBots[0][1].count;
                const pct = (info.count / max) * 100;
                const meta = BOT_CATEGORY_LABEL[info.category];
                return (
                  <li
                    key={name}
                    className="py-2.5 flex items-center gap-3 text-sm"
                  >
                    <span className="w-6 text-right tabular-nums text-neutral-400 font-bold">
                      {i + 1}
                    </span>
                    <span className="text-base">{meta.emoji}</span>
                    <span className="font-medium truncate max-w-[40%]">
                      {name}
                    </span>
                    <div className="flex-1 h-2 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                      <div
                        className="h-full bg-amber-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="tabular-nums text-neutral-500 font-semibold w-12 text-right">
                      {info.count}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </section>

      <p className="text-xs text-neutral-500 leading-relaxed">
        ⓘ 봇 분류는 User-Agent 헤더로 휴리스틱 판별 — 100% 정확하진 않으나
        주요 검색엔진·AI 크롤러는 정확히 잡습니다. 우리 사이트 SEO·AI 노출
        모니터링 용도로 활용 가능 (예: GPTBot 빈도 ↑ = ChatGPT 답변에 인용 가능성).
        디바이스 분포는 iPadOS 13+ Safari 가 desktop UA 와 동일해서 일부 iPad 가 데스크탑으로 잡힐 수 있습니다.
      </p>
    </div>
  );
}

function RangeSelector({ active }: { active: Range }) {
  const ranges: Range[] = ["7d", "30d", "all"];
  return (
    <div className="mt-4 inline-flex rounded-lg border border-neutral-200 dark:border-neutral-800 p-0.5 bg-neutral-50 dark:bg-neutral-900">
      {ranges.map((r) => {
        const isActive = r === active;
        return (
          <Link
            key={r}
            href={r === "7d" ? "/admin/stats" : `/admin/stats?range=${r}`}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              isActive
                ? "bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            }`}
            prefetch={false}
          >
            {RANGE_LABEL[r]}
          </Link>
        );
      })}
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
  suffix,
  sub,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
  suffix?: string;
  sub?: string;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent
          ? "border-blue-200 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-900/10"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-black tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
        {suffix && (
          <span className="text-base font-bold text-neutral-500">{suffix}</span>
        )}
      </div>
      {sub && (
        <div className="mt-0.5 text-[11px] text-neutral-500 tabular-nums">
          {sub}
        </div>
      )}
    </div>
  );
}

const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

/** 시간대별 평균 동시 접속 — 막대 하나가 KST 한 시간. 골든타임을 눈으로 찾으라고 둔다. */
function ConcurrentHourChart({ hours }: { hours: Array<{ hour: number; avg: number; peak: number }> }) {
  const max = Math.max(1, ...hours.map((h) => h.avg));
  return (
    <div>
      <div className="flex items-end gap-[3px] h-28">
        {hours.map((h) => (
          <div key={h.hour} className="flex-1 flex flex-col justify-end items-center group relative">
            <div
              className="w-full rounded-t bg-sky-500/70 group-hover:bg-sky-500 transition-colors"
              style={{ height: `${Math.max(2, (h.avg / max) * 100)}%` }}
            />
            <span className="absolute -top-5 hidden group-hover:block text-[10px] font-semibold whitespace-nowrap">
              {h.avg.toFixed(1)} / 최대 {h.peak}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-[3px] mt-1">
        {hours.map((h) => (
          <span key={h.hour} className="flex-1 text-center text-[9px] text-neutral-400 tabular-nums">
            {h.hour % 3 === 0 ? h.hour : ""}
          </span>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-neutral-400 text-center">KST 시간대별 평균 (막대에 올리면 최대값)</p>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-semibold">{title}</h3>
        {subtitle && (
          <span className="text-xs text-neutral-500">{subtitle}</span>
        )}
      </div>
      {children}
    </section>
  );
}

/** 지난주 대비 증감 셀 — 절대 건수 + %, 방향은 lucide 아이콘. 지난주 0건이면 "신규". */
function WeekDelta({ cur, prev }: { cur: number; prev: number }) {
  if (prev === 0) {
    if (cur === 0) {
      return <span className="text-neutral-400">—</span>;
    }
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
        <ArrowUpRight size={14} />
        신규
      </span>
    );
  }
  const diff = cur - prev;
  const pct = Math.round((diff / prev) * 100);
  if (diff === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-neutral-400 tabular-nums">
        <Minus size={14} />0 (0%)
      </span>
    );
  }
  const up = diff > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold tabular-nums ${
        up
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400"
      }`}
    >
      {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
      {up ? "+" : ""}
      {diff.toLocaleString()} ({up ? "+" : ""}
      {pct}%)
    </span>
  );
}

function EmptyHint({ message }: { message?: string } = {}) {
  return (
    <div className="text-sm text-neutral-500 py-8 text-center">
      {message ?? "아직 데이터가 충분하지 않습니다."}
    </div>
  );
}

/** 검색 채널 종합 비교의 한 열 — 채널 헤더 + 요약 + 검색어 TOP10 미니 리스트. */
function SearchCompareColumn({
  emoji,
  label,
  sub,
  metricLabel,
  summary,
  rows,
  emptyHint,
}: {
  emoji: string;
  label: string;
  sub: string;
  metricLabel: string;
  summary: string;
  rows: { query: string; value: string }[];
  emptyHint: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="text-base">{emoji}</span>
        <span className="font-bold text-sm">{label}</span>
        <span className="text-[11px] text-neutral-400">{sub}</span>
      </div>
      <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 tabular-nums">
        {summary}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-neutral-400 py-2">{emptyHint}</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.query || i} className="flex items-center gap-2 text-xs">
              <span className="w-4 text-right tabular-nums text-neutral-400 font-bold shrink-0">
                {i + 1}
              </span>
              <span className="truncate flex-1" title={r.query}>
                {r.query}
              </span>
              <span className="tabular-nums text-neutral-500 font-semibold shrink-0">
                {r.value}
                <span className="text-neutral-400 font-normal"> {metricLabel}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** GSC 검색어/페이지 공용 표 — 노출·클릭·CTR·평균순위. isPage 면 키를 path 로 표시 + 링크. */
function GscTable({
  rows,
  keyLabel,
  isPage,
}: {
  rows: GscRow[];
  keyLabel: string;
  isPage?: boolean;
}) {
  return (
    <table className="w-full text-sm table-fixed">
      <thead>
        <tr className="text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
          <th className="text-left font-medium pb-2 pr-2">{keyLabel}</th>
          <th className="text-right font-medium pb-2 px-1 w-14">클릭</th>
          <th className="text-right font-medium pb-2 px-1 w-20">노출</th>
          <th className="text-right font-medium pb-2 px-1 w-14">CTR</th>
          <th className="text-right font-medium pb-2 pl-1 w-14">순위</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {rows.map((r, i) => {
          const key = r.keys[0] ?? "";
          const display = isPage ? gscPageToPath(key) : key;
          return (
            <tr key={key || i}>
              <td className="py-2 pr-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 shrink-0 text-right tabular-nums text-neutral-400 font-bold text-xs">
                    {i + 1}
                  </span>
                  {isPage ? (
                    <a
                      href={key}
                      target="_blank"
                      rel="noopener"
                      className="font-mono text-xs truncate hover:underline"
                      title={display}
                    >
                      {display}
                    </a>
                  ) : (
                    <span className="font-medium truncate" title={display}>
                      {display}
                    </span>
                  )}
                </div>
              </td>
              <td className="py-2 px-1 text-right tabular-nums font-semibold">
                {r.clicks.toLocaleString()}
              </td>
              <td className="py-2 px-1 text-right tabular-nums text-neutral-500">
                {r.impressions.toLocaleString()}
              </td>
              <td className="py-2 px-1 text-right tabular-nums text-neutral-500">
                {(r.ctr * 100).toFixed(1)}%
              </td>
              <td className="py-2 pl-1 text-right tabular-nums text-neutral-500">
                {r.position.toFixed(1)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** 기회 검색어 표 — 검색어(실검색 링크)·노출·현재순위·CTR·잠재클릭(상위 진입 시 추가 클릭 추정).
 *  engine 으로 검색 결과 URL(구글/빙)을 결정 — 클릭하면 현재 우리 노출·경쟁 페이지를 바로 확인. */
function OpportunityTable({ rows, engine }: { rows: GscRow[]; engine: "google" | "bing" }) {
  const searchBase =
    engine === "google" ? "https://www.google.com/search?q=" : "https://www.bing.com/search?q=";
  const engineLabel = engine === "google" ? "구글" : "빙";
  return (
    <table className="w-full text-sm table-fixed">
      <thead>
        <tr className="text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
          <th className="text-left font-medium pb-2 pr-2">검색어</th>
          <th className="text-right font-medium pb-2 px-1 w-14">노출</th>
          <th className="text-right font-medium pb-2 px-1 w-12">순위</th>
          <th className="text-right font-medium pb-2 px-1 w-12">CTR</th>
          <th className="text-right font-medium pb-2 pl-1 w-16">잠재클릭</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {rows.map((r, i) => {
          const q = r.keys[0] ?? "";
          const pot = potentialClicks(r.impressions, r.clicks);
          return (
            <tr key={q || i}>
              <td className="py-2 pr-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 shrink-0 text-right tabular-nums text-neutral-400 font-bold text-xs">
                    {i + 1}
                  </span>
                  <a
                    href={`${searchBase}${encodeURIComponent(q)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium truncate hover:underline"
                    title={`"${q}" ${engineLabel} 검색결과 열기`}
                  >
                    {q}
                  </a>
                </div>
              </td>
              <td className="py-2 px-1 text-right tabular-nums text-neutral-500">
                {r.impressions.toLocaleString()}
              </td>
              <td className="py-2 px-1 text-right tabular-nums text-neutral-500">
                {r.position.toFixed(1)}
              </td>
              <td className="py-2 px-1 text-right tabular-nums text-neutral-500">
                {(r.ctr * 100).toFixed(1)}%
              </td>
              <td className="py-2 pl-1 text-right tabular-nums font-bold text-amber-600 dark:text-amber-400">
                +{pot.toLocaleString()}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
