// 관리자 — 방문자 회원(User) 가입 현황. middleware 가 /admin/* 보호하므로 별도 가드 불필요.
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

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

export default async function AdminUsersPage() {
  const todayStart = kstDayStart(0);
  const yesterdayStart = kstDayStart(1);
  const last7Start = kstDayStart(6);

  const [total, todayCount, yesterdayCount, last7Count, verified, recent] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.user.count({
        where: { createdAt: { gte: yesterdayStart, lt: todayStart } },
      }),
      prisma.user.count({ where: { createdAt: { gte: last7Start } } }),
      prisma.user.count({ where: { emailVerified: { not: null } } }),
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          email: true,
          nickname: true,
          emailVerified: true,
          createdAt: true,
        },
      }),
    ]);

  const verifyRate = total > 0 ? Math.round((verified / total) * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-black tracking-tight mb-1">회원 가입 현황</h1>
      <p className="text-sm text-neutral-500 mb-6">
        방문자 이메일 회원(User) 가입 통계 및 목록
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Kpi label="전체 회원" value={total} accent />
        <Kpi label="오늘 가입" value={todayCount} sub={`어제 ${yesterdayCount}명`} />
        <Kpi label="최근 7일" value={last7Count} />
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
            (최근 {recent.length}명)
          </span>
        </div>
        {recent.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-neutral-500">
            아직 가입한 회원이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 text-xs">
                  <th className="text-left px-4 py-2 font-medium">닉네임</th>
                  <th className="text-left px-4 py-2 font-medium">이메일</th>
                  <th className="text-left px-4 py-2 font-medium">가입일 (KST)</th>
                  <th className="text-center px-4 py-2 font-medium">인증</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-neutral-100 dark:border-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-900/40"
                  >
                    <td className="px-4 py-2 font-semibold">{u.nickname}</td>
                    <td className="px-4 py-2 text-neutral-600 dark:text-neutral-400">
                      {u.email}
                    </td>
                    <td className="px-4 py-2 text-neutral-500 tabular-nums whitespace-nowrap">
                      {fmtKst(u.createdAt)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {u.emailVerified ? (
                        <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                      ) : (
                        <span className="text-neutral-400">–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
