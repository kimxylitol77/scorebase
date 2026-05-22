// /admin/health — Health-check 봇 결과 대시보드.
// 오늘 issue 카드 + 최근 7일 추세 + 카테고리별 분포.

import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const SEVERITY_COLOR: Record<string, { bg: string; text: string; emoji: string; label: string }> = {
  HIGH: {
    bg: "bg-rose-50 dark:bg-rose-500/10 border-rose-300 dark:border-rose-500/30",
    text: "text-rose-700 dark:text-rose-300",
    emoji: "🚨",
    label: "HIGH",
  },
  MED: {
    bg: "bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/30",
    text: "text-amber-700 dark:text-amber-300",
    emoji: "⚠️",
    label: "MED",
  },
  LOW: {
    bg: "bg-sky-50 dark:bg-sky-500/10 border-sky-300 dark:border-sky-500/30",
    text: "text-sky-700 dark:text-sky-300",
    emoji: "ℹ️",
    label: "LOW",
  },
  OK: {
    bg: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30",
    text: "text-emerald-700 dark:text-emerald-300",
    emoji: "✅",
    label: "OK",
  },
};

function fmtKstDate(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}
function fmtKstDateTime(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${String(kst.getUTCMonth() + 1).padStart(2, "0")}/${String(kst.getUTCDate()).padStart(2, "0")} ${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
}

export default async function HealthPage() {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

  // 최신 1회 run 의 모든 finding (한 run = 같은 분 안에 insert 된 row 들)
  const latest = await prisma.healthCheck.findFirst({
    orderBy: { runAt: "desc" },
    select: { runAt: true },
  });
  const latestFindings = latest
    ? await prisma.healthCheck.findMany({
        where: {
          runAt: {
            gte: new Date(latest.runAt.getTime() - 60 * 1000), // 같은 run 의 row들 (insert 시각 1분 이내)
            lte: new Date(latest.runAt.getTime() + 60 * 1000),
          },
        },
        orderBy: [{ severity: "asc" }, { category: "asc" }],
      })
    : [];

  // 최근 30일 모든 row — 일별·심각도별 집계
  const recent30 = await prisma.healthCheck.findMany({
    where: { runAt: { gte: since30 } },
    select: { runAt: true, severity: true, category: true },
    take: 5000,
  });
  // 일별 카운트 (KST 일자 키)
  const byDay = new Map<string, { HIGH: number; MED: number; LOW: number; OK: number }>();
  for (const r of recent30) {
    const k = fmtKstDate(r.runAt);
    const e = byDay.get(k) ?? { HIGH: 0, MED: 0, LOW: 0, OK: 0 };
    e[(r.severity as "HIGH" | "MED" | "LOW" | "OK") ?? "LOW"]++;
    byDay.set(k, e);
  }
  const days = Array.from(byDay.keys()).sort().reverse().slice(0, 14);

  // 카테고리 분포 (최근 30일)
  const byCategory = new Map<string, number>();
  for (const r of recent30) {
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
  }
  const topCategories = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // stale-cleanup 최근 10건 — 봇이 자동 정리한 매치 + Haiku 진단
  const staleCleanups = await prisma.healthCheck.findMany({
    where: { category: "stale-cleanup" },
    orderBy: { runAt: "desc" },
    take: 10,
  });

  // 그룹화 — severity 순
  type FindingRow = (typeof latestFindings)[number];
  const findingsBySev: Record<string, FindingRow[]> = { HIGH: [], MED: [], LOW: [], OK: [] };
  for (const f of latestFindings) {
    (findingsBySev[f.severity as keyof typeof findingsBySev] ??= []).push(f);
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* 헤더 */}
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">사이트 상태 보드</h1>
          <p className="text-sm text-neutral-500 mt-1">
            매일 06:30 KST 자동 체크 · {latest ? `마지막 실행 ${fmtKstDateTime(latest.runAt)} KST` : "아직 실행 안 됨"}
          </p>
        </div>
        <form action="/api/cron/health-check" method="post" className="shrink-0">
          <button
            type="submit"
            className="text-xs px-3 py-1.5 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 transition font-semibold"
          >
            지금 실행
          </button>
        </form>
      </header>

      {/* 요약 카드 4개 */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(["HIGH", "MED", "LOW", "OK"] as const).map((sev) => {
          const meta = SEVERITY_COLOR[sev];
          const cnt = findingsBySev[sev]?.length ?? 0;
          return (
            <div
              key={sev}
              className={`rounded-xl border ${meta.bg} px-4 py-3`}
            >
              <div className={`text-xs font-bold tracking-wider uppercase ${meta.text}`}>
                {meta.emoji} {meta.label}
              </div>
              <div className="text-3xl font-black mt-1 tabular-nums">{cnt}</div>
            </div>
          );
        })}
      </section>

      {/* 최신 run 의 issue 카드 */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold border-b border-neutral-200 dark:border-neutral-800 pb-2">
          최신 체크 결과
        </h2>
        {latestFindings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center text-sm text-neutral-500">
            아직 데이터가 없습니다. "지금 실행" 을 눌러 첫 체크를 돌려보세요.
          </div>
        ) : (
          (["HIGH", "MED", "LOW"] as const).map((sev) => {
            const list = findingsBySev[sev] ?? [];
            if (list.length === 0) return null;
            const meta = SEVERITY_COLOR[sev];
            return (
              <div key={sev} className="space-y-2">
                <h3 className={`text-sm font-bold ${meta.text}`}>
                  {meta.emoji} {meta.label} ({list.length})
                </h3>
                <div className="space-y-2">
                  {list.map((f) => (
                    <div
                      key={f.id}
                      className={`rounded-lg border ${meta.bg} px-4 py-3`}
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold tracking-wider uppercase opacity-70">
                            {f.category}
                          </span>
                          <span className="text-xs font-bold">{f.key}</span>
                        </div>
                        <span className="text-[10px] text-neutral-500 tabular-nums">
                          {fmtKstDateTime(f.runAt)}
                        </span>
                      </div>
                      <div className="text-sm mt-1">{f.message}</div>
                      {f.metadata && (
                        <details className="mt-2 text-[11px] text-neutral-600 dark:text-neutral-400">
                          <summary className="cursor-pointer hover:text-neutral-900 dark:hover:text-white">
                            메타데이터
                          </summary>
                          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap bg-white/40 dark:bg-black/30 p-2 rounded text-[10px]">
                            {JSON.stringify(f.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* 일별 추세 — 14일 */}
      <section>
        <h2 className="text-lg font-bold border-b border-neutral-200 dark:border-neutral-800 pb-2 mb-3">
          최근 14일 추세
        </h2>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">날짜</th>
                <th className="text-right px-3 py-2 font-medium text-rose-600 dark:text-rose-400">HIGH</th>
                <th className="text-right px-3 py-2 font-medium text-amber-600 dark:text-amber-400">MED</th>
                <th className="text-right px-3 py-2 font-medium text-sky-600 dark:text-sky-400">LOW</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {days.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-neutral-500 text-xs">
                    데이터 없음
                  </td>
                </tr>
              )}
              {days.map((day) => {
                const e = byDay.get(day)!;
                return (
                  <tr key={day} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                    <td className="px-3 py-2 tabular-nums">{day}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                      {e.HIGH > 0 ? <span className="text-rose-600 dark:text-rose-400">{e.HIGH}</span> : <span className="text-neutral-400">0</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {e.MED > 0 ? <span className="text-amber-600 dark:text-amber-400">{e.MED}</span> : <span className="text-neutral-400">0</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {e.LOW > 0 ? <span className="text-sky-600 dark:text-sky-400">{e.LOW}</span> : <span className="text-neutral-400">0</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* stale 매치 자동 정리 이력 */}
      {staleCleanups.length > 0 && (
        <section>
          <h2 className="text-lg font-bold border-b border-neutral-200 dark:border-neutral-800 pb-2 mb-3">
            🧹 stale 매치 자동 정리 (cleanup-stale-scheduled)
          </h2>
          <p className="text-xs text-neutral-500 mb-3">
            시작 + 12h 지났는데 SCHEDULED 인 매치를 자동 POSTPONED 처리. 4시간 주기.
            처리 시 Haiku 가 원인 진단.
          </p>
          <div className="space-y-3">
            {staleCleanups.map((c) => {
              const md = (c.metadata ?? {}) as {
                marked?: number;
                byLeague?: Record<string, number>;
                diagnosis?: string | null;
                sample?: Array<{ league: string; source: string; teams: string; startTime: string }>;
              };
              const sevColor =
                c.severity === "HIGH"
                  ? "text-rose-600"
                  : c.severity === "MED"
                    ? "text-amber-600"
                    : c.severity === "LOW"
                      ? "text-neutral-600"
                      : "text-emerald-600";
              return (
                <div
                  key={c.id}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className={`font-bold ${sevColor}`}>[{c.severity}]</span>
                    <span className="font-medium flex-1 truncate">{c.message}</span>
                    <span className="text-xs text-neutral-500 tabular-nums shrink-0">
                      {fmtKstDateTime(c.runAt)} KST
                    </span>
                  </div>
                  {md.byLeague && Object.keys(md.byLeague).length > 0 && (
                    <div className="text-xs text-neutral-600 dark:text-neutral-400">
                      <span className="font-semibold">리그별:</span>{" "}
                      {Object.entries(md.byLeague)
                        .sort((a, b) => b[1] - a[1])
                        .map(([l, n]) => `${l} ${n}`)
                        .join(" · ")}
                    </div>
                  )}
                  {md.sample && md.sample.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-neutral-500 hover:text-neutral-700">
                        sample {md.sample.length}건 보기
                      </summary>
                      <ul className="mt-1.5 space-y-0.5 pl-3 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                        {md.sample.map((s, i) => (
                          <li key={i}>
                            {s.startTime.slice(5, 16)} · {s.league} ({s.source}) · {s.teams}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {md.diagnosis && (
                    <div className="rounded bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200 dark:border-white/10 p-2 text-xs leading-relaxed">
                      <div className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        🤖 Haiku 진단
                      </div>
                      <pre className="whitespace-pre-wrap text-neutral-600 dark:text-neutral-400 font-sans">
                        {md.diagnosis}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 카테고리 분포 */}
      {topCategories.length > 0 && (
        <section>
          <h2 className="text-lg font-bold border-b border-neutral-200 dark:border-neutral-800 pb-2 mb-3">
            카테고리 분포 (30일)
          </h2>
          <div className="grid sm:grid-cols-2 gap-2">
            {topCategories.map(([cat, cnt]) => (
              <div
                key={cat}
                className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2 text-sm"
              >
                <span className="font-medium truncate">{cat}</span>
                <span className="tabular-nums font-semibold text-neutral-500">{cnt}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
