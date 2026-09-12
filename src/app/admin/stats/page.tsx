import { prisma } from "@/lib/db";
import { DailyArea, DailyTraffic, HourlyTraffic } from "@/components/charts/StatsChart";
import SectionRangeTabs, { type RangeKey } from "@/components/admin/SectionRangeTabs";
import LivePresencePanel from "@/components/admin/LivePresencePanel";
import { KpiCard, SectionCard, EmptyHint, MiniStat } from "@/components/admin/StatsCards";
import {
  RangeStatsProvider,
  HumanKpiCards,
  ConcurrentCard,
  DeviceCard,
  PopularPagesCard,
  ExitPagesCard,
  HostCard,
  AiServicesCard,
  SearchQueriesCard,
  ExternalLandingsCard,
  ReferralDomainsCard,
  AiBotRangeCards,
  BotRangeCards,
} from "@/components/admin/RangeStats";
import { computeRangeStats } from "@/lib/admin/stats-range";
import { detectBot, type BotCategory } from "@/lib/bot-detect";
import { suspiciousSessionIds } from "@/lib/traffic-filter";
import {
  classifyLanding,
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

export const dynamic = "force-dynamic";

function dayKey(d: Date) {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
function shortDay(d: Date) {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`;
}

type Range = "7d" | "30d" | "all";

const RANGE_LABEL: Record<Range, string> = {
  "7d": "최근 7일",
  "30d": "최근 30일",
  "all": "전체",
};

export default async function StatsPage() {
  // 기간(7일·30일·전체)은 카드마다 탭으로 고른다 — 초기값은 7일, 나머지는 클라이언트가 /api/admin/stats-range 로 받는다.
  const range: Range = "7d";
  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const today00KST = new Date(dayKey(now) + "T00:00:00+09:00");
  const yesterday00KST = new Date(today00KST.getTime() - 24 * 60 * 60 * 1000);

  // 모든 PageView 한 번에 가져와서 메모리에서 사람/봇 분리
  // (gsc 는 DB 와 무관한 Google API — 병렬로 같이 — unstable_cache 1h 라 보통 즉시)
  const [recent30Raw, totalAll, landing14Raw, memberPvRaw, allUsers, gsc, bing, dayUaAgg, hourUaAgg, landingAgg, initialStats] = await Promise.all([
    // ⚠️ orderBy 필수 — 30일 PV 가 take 를 넘으면(2026-08-01 실측 107k > 100k) 정렬 없는
    // findMany 는 임의 서브셋을 줘서 최신(오늘) 행이 잘렸다 → 오늘 KPI 가 1/5 로 축소 표시.
    // desc 로 최신부터 담으면 오늘·어제 KPI 는 항상 온전. 30일 차트는 2026-09-12 부터 SQL 집계(dayUaAgg)라 잘림 무관.
    prisma.pageView.findMany({
      where: { ts: { gte: last30 } },
      select: { ts: true, path: true, userAgent: true, sessionId: true },
      take: 150000,
      orderBy: { ts: "desc" },
    }),
    prisma.pageView.count(),
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
    // 항상 전체 기간(첫 기록 2026-05-09 부터, 8.8k 그룹·1.8s) — 카드 안 탭이 7일·30일·전체를 즉시 바꾼다(페이지 재요청 없음).
    prisma.$queryRaw<Array<{ day: string; ua: string | null; pv: number; visitors: number }>>`
      SELECT to_char(ts AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS day, "userAgent" AS ua,
             count(*)::int AS pv, count(DISTINCT "sessionId")::int AS visitors
      FROM "PageView" GROUP BY 1, 2`,
    prisma.$queryRaw<Array<{ hour: string; ua: string | null; pv: number; visitors: number }>>`
      SELECT to_char(ts AT TIME ZONE 'Asia/Seoul', 'HH24') AS hour, "userAgent" AS ua,
             count(*)::int AS pv, count(DISTINCT "sessionId")::int AS visitors
      FROM "PageView" WHERE ts >= ${last24h} GROUP BY 1, 2`,
    // 유입 채널 카드 — 랜딩 행 33만(30일만 21만)이라 take 10만은 잘린다. (일, referrer 호스트, utm, UA) 로 접어
    // 12k 그룹·2.8s. classifyLanding 은 호스트만 보므로 "https://host/" 로 되살려 넘긴다. 봇 판정은 detectBot(UA).
    prisma.$queryRaw<Array<{ day: string; host: string; utm: string | null; ua: string | null; n: number; sessions: number }>>`
      SELECT to_char(ts AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS day,
             split_part(split_part(coalesce(referrer, ''), '://', 2), '/', 1) AS host,
             "utmSource" AS utm, "userAgent" AS ua, count(*)::int AS n, count(DISTINCT "sessionId")::int AS sessions
      FROM "PageView" WHERE "isLanding" = true GROUP BY 1, 2, 3, 4`,
    // 기간 카드 초기값(7일) — 나머지 기간은 클라이언트가 API 로 받는다. 계산은 lib/admin/stats-range 한 곳.
    computeRangeStats(range),
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
  // 봇 오늘·어제 — 30일 원본(bots30) 기준, 기간과 무관.
  const inRange = (rows: Row[], from: Date, to?: Date) => rows.filter((r) => r.ts >= from && (!to || r.ts < to)).length;
  const botToday = inRange(bots30 as Row[], today00KST);
  const botYesterday = inRange(bots30 as Row[], yesterday00KST, today00KST);

  // 일별 — 사람 기준 30일 (차트는 30일 고정 — 시각화 일관성)
  // 일별 — (일, UA) SQL 집계(전체 기간) 위에 detectBot. take 잘림이 없어 어느 기간이든 전부 그려진다.
  const firstDay = dayUaAgg.reduce((m, g) => (g.day < m ? g.day : m), dayKey(now));
  const allDays =
    Math.round((new Date(dayKey(now) + "T00:00:00Z").getTime() - new Date(firstDay + "T00:00:00Z").getTime()) / 86400000) + 1;
  const humanByDay = new Map<string, { views: number; visitors: number }>();
  const botByDay = new Map<string, number>();
  for (let i = allDays - 1; i >= 0; i--) {
    const d = dayKey(new Date(now.getTime() - i * 24 * 60 * 60 * 1000));
    humanByDay.set(d, { views: 0, visitors: 0 });
    botByDay.set(d, 0);
  }
  for (const g of dayUaAgg) {
    if (detectBot(g.ua).isBot) {
      if (botByDay.has(g.day)) botByDay.set(g.day, (botByDay.get(g.day) ?? 0) + g.pv);
      continue;
    }
    const b = humanByDay.get(g.day);
    if (b) { b.views += g.pv; b.visitors += g.visitors; }
  }
  const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
  const allDaily = Array.from(humanByDay.entries()).map(([d, v]) => ({
    date: shortDay(new Date(d + "T12:00:00Z")),
    day: d,
    weekday: WEEKDAY[new Date(d + "T12:00:00+09:00").getUTCDay()],
    views: v.views,
    visitors: v.visitors,
  }));
  const RANGE_DAYS: Record<RangeKey, number> = { "7d": 7, "30d": 30, all: allDays };
  const dailyFor = (k: RangeKey) => {
    const rows = allDaily.slice(-RANGE_DAYS[k]);
    return {
      key: k,
      days: rows.length,
      rows,
      views: rows.reduce((a, d) => a + d.views, 0),
      visitors: rows.reduce((a, d) => a + d.visitors, 0),
      avgVisitors: Math.round(rows.reduce((a, d) => a + d.visitors, 0) / Math.max(1, rows.length)),
      peak: rows.reduce((best, d) => (d.visitors > best.visitors ? d : best), rows[0]),
    };
  };
  const dailyPanels = { "7d": dailyFor("7d"), "30d": dailyFor("30d"), all: dailyFor("all") } as const;
  // 봇 일별 차트(아래 봇 섹션) — 세 기간 패널.
  const botDailyAll = Array.from(botByDay.entries()).map(([d, v]) => ({ date: shortDay(new Date(d + "T12:00:00Z")), views: v }));
  const botDailyPanels = { "7d": botDailyAll.slice(-7), "30d": botDailyAll.slice(-30), all: botDailyAll } as const;

  // 유입 채널 — 세 기간 각각 채널별 유입·방문자(고유 세션). 같은 세션이 채널 안에서 다른 호스트로 두 번 랜딩하면 방문자가 1 더 세질 수 있다(드묾).
  const channelFor = (k: RangeKey) => {
    const cutoff = k === "all" ? "" : dayKey(new Date(now.getTime() - (RANGE_DAYS[k] - 1) * 24 * 60 * 60 * 1000));
    const agg = new Map<TrafficChannel, { count: number; unique: number }>();
    let total = 0;
    for (const g of landingAgg) {
      if (g.day < cutoff) continue;
      if (detectBot(g.ua).isBot) continue;
      const { channel } = classifyLanding(g.host ? `https://${g.host}/` : null, g.utm, g.ua);
      const e = agg.get(channel) ?? { count: 0, unique: 0 };
      e.count += g.n;
      e.unique += g.sessions;
      agg.set(channel, e);
      total += g.n;
    }
    return { total, rows: CHANNEL_ORDER.map((c) => ({ channel: c, count: agg.get(c)?.count ?? 0, unique: agg.get(c)?.unique ?? 0 })) };
  };
  const channelPanels = { "7d": channelFor("7d"), "30d": channelFor("30d"), all: channelFor("all") } as const;

  // 24시간 시간대 — 사람 기준 (24h 고정)
  const humanHourBuckets = new Map<string, { views: number; visitors: number }>();
  for (let h = 0; h < 24; h++)
    humanHourBuckets.set(String(h).padStart(2, "0"), { views: 0, visitors: 0 });
  for (const g of hourUaAgg) {
    if (detectBot(g.ua).isBot) continue;
    const b = humanHourBuckets.get(g.hour);
    if (b) { b.views += g.pv; b.visitors += g.visitors; }
  }
  const humanHourlyData = Array.from(humanHourBuckets.entries()).map(([h, v]) => ({
    hour: h,
    views: v.views,
    visitors: v.visitors,
  }));

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

  // 네이버·다음 검색어(검색 채널 종합 비교의 한 열) — 초기 기간(7일) 값. 기간 카드는 RangeStats 가 담당.
  const naverDaumQueries = initialStats.searchQueries
    .filter((q) => q.channel === "naver" || q.channel === "daum")
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
      const { channel } = classifyLanding(l.referrer, l.utmSource, l.userAgent);
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
  const aiTodayPV = aiBots30.filter((r) => r.ts >= today00KST).length;
  const aiYesterdayPV = aiBots30.filter(
    (r) => r.ts >= yesterday00KST && r.ts < today00KST,
  ).length;
  const aiLast24hPV = aiBots30.filter((r) => r.ts >= last24h).length;
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
  const rangeLabel = RANGE_LABEL[range];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">접속자 통계</h1>
        <p className="mt-1 text-sm text-neutral-500">
          실시간은 heartbeat 기준, 기간 통계는 페이지뷰(PV) 기준입니다. 관리자
          영역(/admin)은 제외하고 봇과 사람을 User-Agent로 분리합니다.
        </p>
      </header>

      <RangeStatsProvider initial={initialStats}>
      <LivePresencePanel />

      {/* === 사람 트래픽 === */}
      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <span className="text-base">🧑</span>
          <h2 className="text-lg font-bold tracking-tight">사람 트래픽</h2>
          <span className="text-xs text-neutral-500">(봇 제외)</span>
        </div>

        <HumanKpiCards totalAll={totalAll} />

        <ConcurrentCard />

        <DeviceCard />

        <SectionCard title="방문자 · 페이지뷰" subtitle="일별 · 사람만 (봇 제외) · 방문자 = 그날 고유 세션(날짜별 합이라 위 KPI 의 기간 고유 방문자보다 큼)">
          <SectionRangeTabs
            id="daily"
            panels={{ "7d": <DailyPanel p={dailyPanels["7d"]} />, "30d": <DailyPanel p={dailyPanels["30d"]} />, all: <DailyPanel p={dailyPanels.all} /> }}
          />
        </SectionCard>

        <SectionCard title="최근 24시간 시간대 분포" subtitle="KST 0~23시 · 막대 = 페이지뷰 · 선 = 방문자">
          {humanHourlyData.every((h) => h.views === 0) ? (
            <EmptyHint />
          ) : (
            <HourlyTraffic data={humanHourlyData} />
          )}
        </SectionCard>

        <PopularPagesCard />
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

        <ExitPagesCard />

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
            (사람 · 랜딩 기준) — 구글/네이버/SNS/직접 · 카드마다 기간 선택
          </span>
        </div>

        <SectionCard title="어디서 들어왔나" subtitle="랜딩 기준 · 봇 제외 · 방문자 = 고유 세션">
          <SectionRangeTabs
            id="channels"
            panels={{ "7d": <ChannelPanel p={channelPanels["7d"]} />, "30d": <ChannelPanel p={channelPanels["30d"]} />, all: <ChannelPanel p={channelPanels.all} /> }}
          />
        </SectionCard>

        <AiServicesCard />

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
          <SearchQueriesCard />
          <ExternalLandingsCard />
        </div>

        <ReferralDomainsCard />

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
            <SectionCard title="빙 검색어 TOP 30" subtitle="클릭순 · Bing Webmaster Tools 집계">
              {bing.queries.length === 0 ? (
                <EmptyHint message="빙 검색어 데이터가 아직 없습니다. 사이트 등록 직후면 며칠 뒤부터 쌓입니다." />
              ) : (
                <CollapsibleGscTable
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
            <SectionCard title="노출 많은 키워드 TOP 30" subtitle="노출순 · 클릭 여부와 무관">
              {bing.topImpressions.length === 0 ? (
                <EmptyHint message="빙 노출 데이터가 아직 없습니다." />
              ) : (
                <CollapsibleGscTable
                  rows={bing.topImpressions.map((q) => ({
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
              빙 검색어는 이 섹션이 유일한 소스입니다. <strong>클릭순</strong>은 실제로 유입을 만든 검색어,{" "}
              <strong>노출순</strong>은 클릭이 0이어도 수요가 큰 검색어라 메타·콘텐츠 보강 후보를 찾는 표입니다.
              빙 기회 검색어(보강 타겟)는 위{" "}
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
          <span className="text-xs text-neutral-500">(사람 기준 · 카드에서 기간 선택)</span>
        </div>

        <HostCard />

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

        <AiBotRangeCards today={aiTodayPV} yesterday={aiYesterdayPV} last24h={aiLast24hPV} />

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

        <BotRangeCards today={botToday} yesterday={botYesterday} />

        <SectionCard title="봇 트래픽 일별" subtitle="일별 합계 · 카드 안에서 기간 선택">
          <SectionRangeTabs
            id="봇 일별"
            panels={{
              "7d": <DailyArea data={botDailyPanels["7d"]} />,
              "30d": <DailyArea data={botDailyPanels["30d"]} />,
              all: <DailyArea data={botDailyPanels.all} />,
            }}
          />
        </SectionCard>
      </section>

      <p className="text-xs text-neutral-500 leading-relaxed">
        ⓘ 봇 분류는 User-Agent 헤더로 휴리스틱 판별 — 100% 정확하진 않으나
        주요 검색엔진·AI 크롤러는 정확히 잡습니다. 우리 사이트 SEO·AI 노출
        모니터링 용도로 활용 가능 (예: GPTBot 빈도 ↑ = ChatGPT 답변에 인용 가능성).
        디바이스 분포는 iPadOS 13+ Safari 가 desktop UA 와 동일해서 일부 iPad 가 데스크탑으로 잡힐 수 있습니다.
      </p>
      </RangeStatsProvider>
    </div>
  );
}

type DailyPanelData = {
  key: RangeKey;
  days: number;
  rows: Array<{ date: string; day: string; weekday: string; views: number; visitors: number }>;
  views: number;
  visitors: number;
  avgVisitors: number;
  peak: { date: string; day: string; visitors: number };
};

/** 방문자·페이지뷰 카드의 한 기간 패널 — 요약 칩 + 이축 차트 + 날짜별 표. 서버가 세 기간을 렌더해 탭 컴포넌트에 넘긴다. */
function DailyPanel({ p }: { p: DailyPanelData }) {
  if (p.views === 0) return <EmptyHint />;
  const label = RANGE_LABEL[p.key];
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label={`${label} 일별 방문자 합`} value={p.visitors} tone="emerald" />
        <MiniStat label={`${label} 페이지뷰`} value={p.views} tone="blue" />
        <MiniStat label="하루 평균 방문자" value={p.avgVisitors} tone="emerald" />
        <MiniStat label={`최다 방문일 (${p.peak.date})`} value={p.peak.visitors} tone="emerald" />
      </div>
      <DailyTraffic data={p.rows} tickEvery={p.days <= 7 ? 0 : p.days <= 31 ? 4 : Math.ceil(p.days / 10)} />
      <div className="mt-4 max-h-[320px] overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white dark:bg-neutral-950">
            <tr className="text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
              <th className="px-3 py-2 text-left font-medium">날짜</th>
              <th className="px-3 py-2 text-right font-medium text-emerald-600 dark:text-emerald-400">방문자</th>
              <th className="px-3 py-2 text-right font-medium text-blue-600 dark:text-blue-400">페이지뷰</th>
              <th className="px-3 py-2 text-right font-medium">1인당 페이지</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
            {[...p.rows].reverse().map((d) => {
              const weekend = d.weekday === "토" || d.weekday === "일";
              return (
                <tr key={d.day} className={d.day === p.peak.day ? "bg-emerald-50/60 dark:bg-emerald-500/10" : undefined}>
                  <td className="px-3 py-1.5 tabular-nums">
                    {d.day.slice(5).replace("-", "/")}
                    <span className={`ml-1 text-[11px] ${weekend ? "text-rose-500" : "text-neutral-400"}`}>{d.weekday}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{d.visitors.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.views.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-neutral-500">{d.visitors > 0 ? (d.views / d.visitors).toFixed(1) : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** 유입 채널 카드의 한 기간 패널 — 채널별 막대. 0 인 채널도 흐리게 남긴다(새 채널이 잡히는지 바로 보려고). */
function ChannelPanel({ p }: { p: { total: number; rows: Array<{ channel: TrafficChannel; count: number; unique: number }> } }) {
  if (p.total === 0) return <EmptyHint message="이 기간엔 랜딩 유입이 없습니다." />;
  const max = Math.max(...p.rows.map((x) => x.count));
  return (
    <>
      <p className="mb-2 text-[11px] text-neutral-500">유입 {p.total.toLocaleString()}회</p>
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {p.rows.map((c) => {
          const meta = CHANNEL_META[c.channel];
          const pct = max > 0 ? (c.count / max) * 100 : 0;
          const share = p.total > 0 ? Math.round((c.count / p.total) * 100) : 0;
          return (
            <li key={c.channel} className={`py-2.5 flex items-center gap-3 text-sm${c.count === 0 ? " opacity-40" : ""}`}>
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
    </>
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
// 검색어 표 접이식 래퍼 — 앞 head 행만 보이고 나머지는 펼치기.
// 유입 도메인 표(위)와 같은 details/summary 패턴 — JS 없이 동작한다.
function CollapsibleGscTable({
  rows,
  keyLabel,
  head = 10,
}: {
  rows: GscRow[];
  keyLabel: string;
  head?: number;
}) {
  const rest = rows.slice(head);
  return (
    <>
      <GscTable rows={rows.slice(0, head)} keyLabel={keyLabel} />
      {rest.length > 0 && (
        <details className="group mt-1">
          <summary className="cursor-pointer list-none py-2 text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline select-none">
            <span className="group-open:hidden">+ 나머지 {rest.length}개 펼치기</span>
            <span className="hidden group-open:inline">접기</span>
          </summary>
          <div className="border-t border-neutral-200 dark:border-neutral-800">
            <GscTable rows={rest} keyLabel={keyLabel} startIndex={head} hideHead />
          </div>
        </details>
      )}
    </>
  );
}

function GscTable({
  rows,
  keyLabel,
  isPage,
  startIndex = 0,
  hideHead,
}: {
  rows: GscRow[];
  keyLabel: string;
  isPage?: boolean;
  /** 접기로 표를 둘로 나눌 때 순번이 1부터 다시 시작하지 않도록 */
  startIndex?: number;
  /** 펼친 뒤쪽 표는 헤더를 반복하지 않는다 */
  hideHead?: boolean;
}) {
  return (
    <table className="w-full text-sm table-fixed">
      {/* 열 폭을 colgroup 에 고정 — 접기로 표가 둘로 나뉘면 뒤쪽 표엔 thead(w-14 등)가 없어
          table-fixed 가 첫 tbody 행 기준으로 폭을 다시 잡아 두 표의 열이 어긋난다. */}
      <colgroup>
        <col />
        <col className="w-14" />
        <col className="w-20" />
        <col className="w-14" />
        <col className="w-14" />
      </colgroup>
      {!hideHead && (
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
            <th className="text-left font-medium pb-2 pr-2">{keyLabel}</th>
            <th className="text-right font-medium pb-2 px-1 w-14">클릭</th>
            <th className="text-right font-medium pb-2 px-1 w-20">노출</th>
            <th className="text-right font-medium pb-2 px-1 w-14">CTR</th>
            <th className="text-right font-medium pb-2 pl-1 w-14">순위</th>
          </tr>
        </thead>
      )}
      <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {rows.map((r, i) => {
          const key = r.keys[0] ?? "";
          const display = isPage ? gscPageToPath(key) : key;
          return (
            <tr key={key || i}>
              <td className="py-2 pr-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 shrink-0 text-right tabular-nums text-neutral-400 font-bold text-xs">
                    {startIndex + i + 1}
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
