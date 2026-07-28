// 팔로우 유도 배너 — "팔로우하면 새 픽을 텔레그램으로" 가치를 팔로우 버튼이 있는 화면에 노출.
// 근거로 붙이는 적중률은 전부 DB 실측(getOverallRanking = 자동채점 누적)이다. 표본이 얕으면
// 아예 렌더하지 않는다 — 숫자를 부풀리는 대신 보여줄 게 생겼을 때만 보여준다.
import Link from "next/link";
import { Target, Send } from "lucide-react";
import { getOverallRanking } from "@/lib/analysis/ranking";
import { resolveAvatar } from "@/lib/analysis/analysts";
import UserName from "@/components/UserName";

// 이 밑이면 "상위 분석가"라 부를 만한 근거가 안 된다 (1경기 100% 류 노출 방지).
const MIN_SAMPLE = 30;
const SHOW = 3;

export default async function FollowCta() {
  const rows = (await getOverallRanking(20))
    .filter((r) => r.total >= MIN_SAMPLE)
    .slice(0, SHOW);
  if (rows.length === 0) return null;

  return (
    <section className="mb-5 rounded-[1.75rem] bg-white ring-1 ring-black/5 p-5 shadow-[0_20px_60px_-34px_rgba(15,23,30,0.3)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-bold">
            <Send className="h-4 w-4 shrink-0 text-[#229ED9]" aria-hidden />
            분석가를 팔로우하면 새 픽을 텔레그램으로
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500 break-keep">
            팔로우한 분석가가 픽을 올리면 바로 알려드립니다. 아래 적중률은 경기 종료 후
            자동 채점된 <strong className="font-semibold text-neutral-600 dark:text-neutral-300">실제 누적 기록</strong>입니다.
          </p>
        </div>
        <Link
          href="/experts"
          className="shrink-0 rounded-full bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-rose-700"
        >
          분석가 찾기
        </Link>
      </div>

      <ul className="mt-3.5 grid gap-1.5 sm:grid-cols-3">
        {rows.map((r) => {
          const av = resolveAvatar(r.avatarUrl, r.nickname, r.level, r.badge);
          return (
            <li key={r.userId}>
              <Link
                href={`/experts/${r.userId}`}
                prefetch={false}
                className="flex items-center gap-2 rounded-2xl bg-neutral-50 px-3 py-2 transition hover:bg-neutral-100 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]"
              >
                {av.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={av.imageUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${av.bg}`}>
                    {av.emoji}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <UserName
                    name={r.nickname}
                    nameColor={r.nameColor}
                    title={r.title}
                    className="block truncate text-xs font-bold"
                  />
                  <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <Target className="h-3 w-3 shrink-0" aria-hidden />
                    적중 {r.rate}%
                    <span className="font-normal text-neutral-400">
                      {r.hit}/{r.total}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
