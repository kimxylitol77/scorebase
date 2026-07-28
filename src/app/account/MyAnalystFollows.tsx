// 마이페이지 팔로우한 분석가 목록 — 적중률 표시 + 언팔로우.
// 팀·경기 즐겨찾기(localStorage)와 달리 서버(UserAnalystFollow)가 정본이라 서버 컴포넌트로 조회한다.
import Link from "next/link";
import { UserCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { resolveAvatar } from "@/lib/analysis/analysts";
import { toggleAnalystFollowAction } from "@/app/analysis/actions";
import UserName from "@/components/UserName";

export default async function MyAnalystFollows({ userId }: { userId: string }) {
  const follows = await prisma.userAnalystFollow.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      analystId: true,
      analyst: {
        select: {
          nickname: true, avatarUrl: true, level: true, badge: true,
          nameColor: true, title: true, predTotal: true, predHit: true,
        },
      },
    },
  });

  return (
    <section className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white dark:bg-neutral-900/40 p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <UserCheck className="h-4 w-4 text-rose-500" aria-hidden />
          팔로우한 분석가
          {follows.length > 0 && (
            <span className="text-neutral-400 font-normal">{follows.length}</span>
          )}
        </h2>
        <Link
          href="/experts"
          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          전문가 순위 →
        </Link>
      </div>

      {follows.length === 0 ? (
        <p className="text-sm text-neutral-500 leading-relaxed">
          아직 팔로우한 분석가가 없습니다.{" "}
          <Link href="/experts" className="text-blue-600 dark:text-blue-400 hover:underline">
            예측 전문가 순위
          </Link>
          에서 팔로우하면 새 픽을 올릴 때 텔레그램으로 알려드립니다.
        </p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {follows.map((f) => {
              const a = f.analyst;
              const avatar = resolveAvatar(a.avatarUrl, a.nickname, a.level, a.badge);
              const rate =
                a.predTotal > 0 ? Math.round((a.predHit / a.predTotal) * 100) : null;
              return (
                <li
                  key={f.analystId}
                  className="flex items-center gap-2.5 rounded-2xl bg-neutral-50 dark:bg-white/[0.04] px-3 py-2"
                >
                  {avatar.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar.imageUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${avatar.bg}`}>
                      {avatar.emoji}
                    </div>
                  )}
                  <Link
                    href={`/experts/${f.analystId}`}
                    prefetch={false}
                    className="flex-1 truncate hover:underline"
                  >
                    <UserName
                      name={a.nickname}
                      nameColor={a.nameColor}
                      title={a.title}
                      className="text-sm font-medium"
                    />
                  </Link>
                  {rate !== null && (
                    <span className="shrink-0 text-[11px] font-semibold tabular-nums text-neutral-500">
                      적중 {rate}%
                      <span className="ml-1 font-normal text-neutral-400">
                        {a.predHit}/{a.predTotal}
                      </span>
                    </span>
                  )}
                  <form action={toggleAnalystFollowAction} className="shrink-0">
                    <input type="hidden" name="analystId" value={f.analystId} />
                    <input type="hidden" name="from" value="/account" />
                    <button
                      type="submit"
                      className="text-[11px] text-neutral-400 hover:text-rose-500 transition-colors"
                      aria-label={`${a.nickname} 팔로우 해제`}
                    >
                      해제
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] text-neutral-400 leading-relaxed">
            팔로우한 분석가가 새 픽 글을 올리면 텔레그램으로 알려드립니다.
          </p>
        </>
      )}
    </section>
  );
}
