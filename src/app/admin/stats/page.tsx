import { prisma } from "@/lib/db";
import { DailyArea, HourlyBar } from "@/components/charts/StatsChart";

export const dynamic = "force-dynamic";

function dayKey(d: Date) {
  // KST 기준 YYYY-MM-DD
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function shortDay(d: Date) {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const m = kst.getUTCMonth() + 1;
  const dd = kst.getUTCDate();
  return `${m}/${dd}`;
}

function hourKey(d: Date) {
  // KST 기준 0~23
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return String(kst.getUTCHours()).padStart(2, "0");
}

export default async function StatsPage() {
  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const today00KST = new Date(dayKey(now) + "T00:00:00+09:00");
  const yesterday00KST = new Date(today00KST.getTime() - 24 * 60 * 60 * 1000);

  const [total, todayCount, yesterdayCount, last7dCount, recent30, recent24, topPaths] =
    await Promise.all([
      prisma.pageView.count(),
      prisma.pageView.count({ where: { ts: { gte: today00KST } } }),
      prisma.pageView.count({
        where: { ts: { gte: yesterday00KST, lt: today00KST } },
      }),
      prisma.pageView.count({ where: { ts: { gte: last7 } } }),
      prisma.pageView.findMany({
        where: { ts: { gte: last30 } },
        select: { ts: true, path: true },
        take: 50000,
      }),
      prisma.pageView.findMany({
        where: { ts: { gte: last24h } },
        select: { ts: true },
        take: 5000,
      }),
      prisma.pageView.groupBy({
        by: ["path"],
        where: { ts: { gte: last7 } },
        _count: { _all: true },
        orderBy: { _count: { path: "desc" } },
        take: 10,
      }),
    ]);

  // 일별 집계 (최근 30일)
  const dayBuckets = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    dayBuckets.set(dayKey(d), 0);
  }
  for (const r of recent30) {
    const k = dayKey(r.ts);
    if (dayBuckets.has(k)) dayBuckets.set(k, (dayBuckets.get(k) ?? 0) + 1);
  }
  const dailyData = Array.from(dayBuckets.entries()).map(([d, v]) => ({
    date: shortDay(new Date(d + "T12:00:00Z")),
    views: v,
  }));

  // 시간별 집계 (최근 24시간 — KST 0~23시 분포)
  const hourBuckets = new Map<string, number>();
  for (let h = 0; h < 24; h++) hourBuckets.set(String(h).padStart(2, "0"), 0);
  for (const r of recent24) {
    const k = hourKey(r.ts);
    hourBuckets.set(k, (hourBuckets.get(k) ?? 0) + 1);
  }
  const hourlyData = Array.from(hourBuckets.entries()).map(([h, v]) => ({
    hour: h,
    views: v,
  }));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">접속자 통계</h1>
        <p className="mt-1 text-sm text-neutral-500">
          페이지뷰(PV) 기준. 관리자 영역(/admin) 은 트래킹에서 제외됩니다.
        </p>
      </header>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="누적 PV" value={total} />
        <KpiCard label="오늘" value={todayCount} accent />
        <KpiCard label="어제" value={yesterdayCount} />
        <KpiCard label="최근 7일" value={last7dCount} />
      </div>

      {/* 일별 30일 area */}
      <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-semibold">최근 30일 PV</h2>
          <span className="text-xs text-neutral-500">일별 합계</span>
        </div>
        {recent30.length === 0 ? (
          <EmptyHint />
        ) : (
          <DailyArea data={dailyData} />
        )}
      </section>

      {/* 시간별 24시간 */}
      <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-semibold">최근 24시간 시간대 분포</h2>
          <span className="text-xs text-neutral-500">KST 0~23시</span>
        </div>
        {recent24.length === 0 ? (
          <EmptyHint />
        ) : (
          <HourlyBar data={hourlyData} />
        )}
      </section>

      {/* 인기 페이지 */}
      <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
        <h2 className="font-semibold mb-4">인기 페이지 (최근 7일)</h2>
        {topPaths.length === 0 ? (
          <EmptyHint />
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {topPaths.map((p, i) => {
              const max = topPaths[0]._count._all;
              const pct = (p._count._all / max) * 100;
              return (
                <li
                  key={p.path}
                  className="py-2.5 flex items-center gap-3 text-sm"
                >
                  <span className="w-6 text-right tabular-nums text-neutral-400 font-bold">
                    {i + 1}
                  </span>
                  <a
                    href={p.path}
                    target="_blank"
                    rel="noopener"
                    className="font-medium hover:underline truncate max-w-[40%]"
                  >
                    {p.path}
                  </a>
                  <div className="flex-1 h-2 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="tabular-nums text-neutral-500 font-semibold w-12 text-right">
                    {p._count._all}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-xs text-neutral-500">
        ⓘ 자체 트래킹입니다. 클라이언트가 JS 비활성화 시 잡히지 않으며, 봇·검색엔진
        크롤러 일부도 제외될 수 있습니다.
      </p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
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
      </div>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="text-sm text-neutral-500 py-8 text-center">
      아직 데이터가 충분하지 않습니다. 사이트에 방문자가 들어오면 자동으로
      쌓입니다.
    </div>
  );
}
