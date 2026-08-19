// 관리자 — 방문자 회원(User) 가입 현황 + 회원별 접속 통계. 행 클릭 → 상세(활동 이력).
import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

/** KST 기준 N일 전 0시(UTC Date) */
function kstDayStart(daysAgo = 0): Date {
  const KST = 9 * 3600 * 1000;
  const nowKst = new Date(Date.now() + KST);
  return new Date(
    Date.UTC(
      nowKst.getUTCFullYear(),
      nowKst.getUTCMonth(),
      nowKst.getUTCDate() - daysAgo,
    ) - KST,
  );
}

function fmtKst(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const todayStart = kstDayStart(0);
  const yesterdayStart = kstDayStart(1);
  const last7Start = kstDayStart(6);

  const [
    total,
    todayCount,
    yesterdayCount,
    last7Count,
    verified,
    recent,
    pvByUser,
    activeToday,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.user.count({
      where: { createdAt: { gte: yesterdayStart, lt: todayStart } },
    }),
    prisma.user.count({ where: { createdAt: { gte: last7Start } } }),
    prisma.user.count({ where: { emailVerified: { not: null } } }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        email: true,
        nickname: true,
        emailVerified: true,
        createdAt: true,
      },
    }),
    // 회원별 접속 통계 — 로그인 상태 PV 만 (2026-07-28 이후 수집분).
    prisma.pageView.groupBy({
      by: ["userId"],
      where: { userId: { not: null } },
      _count: { _all: true },
      _max: { ts: true },
    }),
    // 오늘 접속한 회원 수 (distinct userId)
    prisma.pageView
      .groupBy({
        by: ["userId"],
        where: { userId: { not: null }, ts: { gte: todayStart } },
      })
      .then((r) => r.length),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const verifyRate = total > 0 ? Math.round((verified / total) * 100) : 0;
  const pvMap = new Map(
    pvByUser.map((p) => [
      p.userId as string,
      { count: p._count._all, lastTs: p._max.ts },
    ]),
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-black tracking-tight mb-1">회원 가입 현황</h1>
      <p className="text-sm text-neutral-500 mb-6">
        방문자 이메일 회원(User) 가입 통계 및 목록 — 닉네임 클릭 시 활동 상세.
        접속 PV 는 로그인 상태 조회만 집계 (2026-07-28 배포 이후 수집분).
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        <Kpi label="전체 회원" value={total} accent />
        <Kpi label="오늘 가입" value={todayCount} sub={`어제 ${yesterdayCount}명`} />
        <Kpi label="최근 7일" value={last7Count} />
        <Kpi label="오늘 접속 회원" value={activeToday} sub="로그인 PV 기준" />
        <Kpi
          label="이메일 인증"
          value={`${verifyRate}%`}
          sub={`${verified}/${total}`}
        />
      </div>

      <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 text-sm font-semibold">
          가입자 목록{" "}
          <span className="text-neutral-500 font-normal">
            (전체 {total}명 중 {total === 0 ? 0 : skip + 1}–{skip + recent.length}
            번째 · {page}/{totalPages} 페이지)
          </span>
        </div>
        {recent.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-neutral-500">
            {page > 1 ? "이 페이지에는 회원이 없습니다." : "아직 가입한 회원이 없습니다."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 text-xs">
                  <th className="text-left px-4 py-2 font-medium">닉네임</th>
                  <th className="text-left px-4 py-2 font-medium">이메일</th>
                  <th className="text-left px-4 py-2 font-medium">가입일 (KST)</th>
                  <th className="text-right px-4 py-2 font-medium">접속 PV</th>
                  <th className="text-left px-4 py-2 font-medium">마지막 접속</th>
                  <th className="text-center px-4 py-2 font-medium">인증</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((u) => {
                  const pv = pvMap.get(u.id);
                  return (
                  <tr
                    key={u.id}
                    className="border-b border-neutral-100 dark:border-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-900/40"
                  >
                    <td className="px-4 py-2 font-semibold">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {u.nickname}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">
                      {u.email}
                    </td>
                    <td className="px-4 py-2 text-neutral-500 tabular-nums whitespace-nowrap">
                      {fmtKst(u.createdAt)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {pv ? pv.count : <span className="text-neutral-400">–</span>}
                    </td>
                    <td className="px-4 py-2 text-neutral-500 tabular-nums whitespace-nowrap">
                      {pv?.lastTs ? fmtKst(pv.lastTs) : "–"}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {u.emailVerified ? (
                        <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                      ) : (
                        <span className="text-neutral-400">–</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && <Pager page={page} totalPages={totalPages} />}
    </div>
  );
}

/** 이전/다음 + 페이지 번호(현재 기준 최대 7개 윈도우) */
function Pager({ page, totalPages }: { page: number; totalPages: number }) {
  const start = Math.max(1, Math.min(page - 3, totalPages - 6));
  const end = Math.min(totalPages, start + 6);
  const nums: number[] = [];
  for (let i = start; i <= end; i++) nums.push(i);

  const base =
    "px-3 py-1.5 rounded-md text-sm transition whitespace-nowrap";
  const idle =
    "bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700";
  const off = "text-neutral-300 dark:text-neutral-700";

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 mt-6">
      {page > 1 ? (
        <Link href={`/admin/users?page=${page - 1}`} className={`${base} ${idle}`}>
          ← 이전
        </Link>
      ) : (
        <span className={`${base} ${off}`}>← 이전</span>
      )}

      {start > 1 && (
        <>
          <Link href="/admin/users?page=1" className={`${base} ${idle}`}>
            1
          </Link>
          <span className="text-neutral-400 text-sm">…</span>
        </>
      )}

      {nums.map((n) =>
        n === page ? (
          <span
            key={n}
            className={`${base} bg-blue-600 text-white font-semibold tabular-nums`}
          >
            {n}
          </span>
        ) : (
          <Link
            key={n}
            href={`/admin/users?page=${n}`}
            className={`${base} ${idle} tabular-nums`}
          >
            {n}
          </Link>
        ),
      )}

      {end < totalPages && (
        <>
          <span className="text-neutral-400 text-sm">…</span>
          <Link
            href={`/admin/users?page=${totalPages}`}
            className={`${base} ${idle} tabular-nums`}
          >
            {totalPages}
          </Link>
        </>
      )}

      {page < totalPages ? (
        <Link href={`/admin/users?page=${page + 1}`} className={`${base} ${idle}`}>
          다음 →
        </Link>
      ) : (
        <span className={`${base} ${off}`}>다음 →</span>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`border rounded-xl p-4 ${
        accent
          ? "border-blue-500/30 bg-blue-500/5"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-black tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-neutral-500">{sub}</div>}
    </div>
  );
}
