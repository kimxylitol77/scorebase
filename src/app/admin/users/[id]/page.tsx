// 관리자 — 회원 1명 활동 상세: 접속 통계·방문 페이지 이력·커뮤니티 활동. /admin/users 목록에서 진입.
import Link from "next/link";
import { notFound } from "next/navigation";
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

/** KST 날짜 문자열 (yyyy-mm-dd) */
function kstDateStr(d: Date): string {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      nickname: true,
      emailVerified: true,
      createdAt: true,
      level: true,
      exp: true,
      points: true,
      lastAttendanceAt: true,
      favoriteTeam: { select: { name: true } },
    },
  });
  if (!user) notFound();

  const last7Start = kstDayStart(6);
  const last14Start = kstDayStart(13);

  const [totalPv, last7Pv, recentViews, topPaths, dailyPv, postCount, commentCount, voteCount] =
    await Promise.all([
      prisma.pageView.count({ where: { userId: id } }),
      prisma.pageView.count({ where: { userId: id, ts: { gte: last7Start } } }),
      // 최근 방문 페이지 이력 (시간순)
      prisma.pageView.findMany({
        where: { userId: id },
        orderBy: { ts: "desc" },
        take: 100,
        select: { path: true, ts: true },
      }),
      // 많이 본 페이지 TOP 15
      prisma.pageView.groupBy({
        by: ["path"],
        where: { userId: id },
        _count: { _all: true },
        orderBy: { _count: { path: "desc" } },
        take: 15,
      }),
      // 최근 14일 일별 접속
      prisma.pageView.findMany({
        where: { userId: id, ts: { gte: last14Start } },
        select: { ts: true },
      }),
      prisma.post.count({ where: { authorId: id } }),
      prisma.comment.count({ where: { authorId: id } }),
      prisma.matchVote.count({ where: { userId: id } }),
    ]);

  const lastSeen = recentViews[0]?.ts ?? null;

  // 일별 PV 집계 (KST) — 최근 14일, 빈 날 포함
  const dayCounts = new Map<string, number>();
  for (const v of dailyPv) {
    const day = kstDateStr(v.ts);
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
  }
  const days: { day: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = kstDateStr(kstDayStart(i));
    days.push({ day, count: dayCounts.get(day) ?? 0 });
  }
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-1">
        <Link
          href="/admin/users"
          className="text-xs text-neutral-500 hover:underline"
        >
          ← 회원 목록
        </Link>
      </div>
      <h1 className="text-xl font-black tracking-tight mb-1">
        {user.nickname}
        <span className="ml-2 text-sm font-normal text-neutral-500">
          Lv.{user.level} · {user.email}
        </span>
      </h1>
      <p className="text-sm text-neutral-500 mb-6">
        가입 {fmtKst(user.createdAt)} · 경험치 {user.exp} · 포인트 {user.points}
        {user.favoriteTeam ? ` · 응원팀 ${user.favoriteTeam.name}` : ""}
        {user.emailVerified ? " · 이메일 인증됨" : ""}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Kpi label="총 접속 PV" value={totalPv} accent />
        <Kpi label="최근 7일 PV" value={last7Pv} />
        <Kpi
          label="마지막 접속"
          value={lastSeen ? fmtKst(lastSeen) : "기록 없음"}
          small
        />
        <Kpi
          label="활동"
          value={`글 ${postCount} · 댓글 ${commentCount}`}
          sub={`승부예측 투표 ${voteCount}회`}
          small
        />
      </div>

      <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 mb-8">
        <div className="text-sm font-semibold mb-3">최근 14일 일별 접속 (KST)</div>
        <div className="flex items-end gap-1 h-24">
          {days.map((d) => (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
              <div className="text-[10px] text-neutral-500 tabular-nums">
                {d.count > 0 ? d.count : ""}
              </div>
              <div
                className={`w-full rounded-t ${d.count > 0 ? "bg-blue-500/70" : "bg-neutral-200 dark:bg-neutral-800"}`}
                style={{ height: `${Math.max(4, (d.count / maxDay) * 64)}px` }}
              />
              <div className="text-[9px] text-neutral-500">{d.day.slice(5)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 text-sm font-semibold">
            방문 페이지 이력{" "}
            <span className="text-neutral-500 font-normal">
              (최근 {recentViews.length}건)
            </span>
          </div>
          {recentViews.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-neutral-500">
              아직 접속 기록이 없습니다. (2026-07-28 배포 이후 로그인 상태
              조회부터 수집)
            </div>
          ) : (
            <div className="max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <tbody>
                  {recentViews.map((v, i) => (
                    <tr
                      key={i}
                      className="border-b border-neutral-100 dark:border-neutral-900"
                    >
                      <td className="px-4 py-1.5 break-all">
                        <Link
                          href={v.path}
                          target="_blank"
                          className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {v.path}
                        </Link>
                      </td>
                      <td className="px-4 py-1.5 text-right text-neutral-500 tabular-nums whitespace-nowrap">
                        {fmtKst(v.ts)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 text-sm font-semibold">
            많이 본 페이지 TOP {topPaths.length}
          </div>
          {topPaths.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-neutral-500">
              데이터 없음
            </div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {topPaths.map((t) => (
                  <tr
                    key={t.path}
                    className="border-b border-neutral-100 dark:border-neutral-900"
                  >
                    <td className="px-4 py-1.5 break-all">{t.path}</td>
                    <td className="px-4 py-1.5 text-right text-neutral-500 tabular-nums">
                      {t._count._all}회
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
  small,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: boolean;
  small?: boolean;
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
      <div
        className={`mt-1 font-black tabular-nums ${small ? "text-sm" : "text-2xl"}`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-neutral-500">{sub}</div>}
    </div>
  );
}
