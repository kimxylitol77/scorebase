import { prisma } from "@/lib/db";
import { DailyArea, HourlyBar } from "@/components/charts/StatsChart";
import { detectBot, BOT_CATEGORY_LABEL, type BotCategory } from "@/lib/bot-detect";
import { detectDevice, DEVICE_LABEL, type DeviceType } from "@/lib/device-detect";
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
  const today00KST = new Date(dayKey(now) + "T00:00:00+09:00");
  const yesterday00KST = new Date(today00KST.getTime() - 24 * 60 * 60 * 1000);

  // 기간 선택용 — 인기 페이지/봇 TOP/디바이스 분포 / KPI 의 main range
  // 7d → 30000 take 한도. 30d → 100000. all → 200000 (DB 부담 회피)
  const rangeWhere =
    range === "all"
      ? {}
      : { ts: { gte: range === "30d" ? last30 : last7 } };
  const rangeTake = range === "all" ? 200000 : range === "30d" ? 100000 : 30000;

  // 모든 PageView 한 번에 가져와서 메모리에서 사람/봇 분리
  const [recent30Raw, recent24Raw, rangeRaw, totalAll] = await Promise.all([
    prisma.pageView.findMany({
      where: { ts: { gte: last30 } },
      select: { ts: true, path: true, userAgent: true, sessionId: true },
      take: 100000,
    }),
    prisma.pageView.findMany({
      where: { ts: { gte: last24h } },
      select: { ts: true, userAgent: true, sessionId: true },
      take: 20000,
    }),
    prisma.pageView.findMany({
      where: rangeWhere,
      select: { ts: true, path: true, userAgent: true, sessionId: true },
      take: rangeTake,
      orderBy: { ts: "desc" },
    }),
    prisma.pageView.count(),
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
  const humanTodayPV = filterRange(humans30 as Row[], today00KST);
  const humanTodayUnique = uniqueRange(humans30 as Row[], today00KST);
  const humanYesterdayPV = filterRange(humans30 as Row[], yesterday00KST, today00KST);
  const humanYesterdayUnique = uniqueRange(humans30 as Row[], yesterday00KST, today00KST);
  const humanRangePV = humansRange.length;
  const humanRangeUnique = new Set(
    humansRange.map((r) => r.sessionId).filter(Boolean) as string[],
  ).size;
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
  for (const r of humansRange) {
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
  for (const r of humansRange) {
    humanPathCount.set(r.path, (humanPathCount.get(r.path) ?? 0) + 1);
  }
  const topHumanPaths = Array.from(humanPathCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

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

  const totalBots = botsRange.length;
  const totalHumans = humansRange.length;
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
          페이지뷰(PV) 기준. 관리자 영역(/admin) 은 트래킹 제외. 봇과 사람을
          User-Agent 로 분리해서 표시합니다.
        </p>
        <RangeSelector active={range} />
      </header>

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

      {/* === 봇 트래픽 === */}
      <section className="space-y-6 pt-2 border-t-2 border-dashed border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2 pt-6">
          <span className="text-base">🤖</span>
          <h2 className="text-lg font-bold tracking-tight">봇 트래픽</h2>
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
  value: number;
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
        {value.toLocaleString()}
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

function EmptyHint({ message }: { message?: string } = {}) {
  return (
    <div className="text-sm text-neutral-500 py-8 text-center">
      {message ?? "아직 데이터가 충분하지 않습니다."}
    </div>
  );
}
