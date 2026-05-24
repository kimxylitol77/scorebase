// 매치 0건 일 때 — 가까운 가용 일자 안내.

import Link from "next/link";

interface Props {
  sport: string;
  /** 가까운 가용 일자 yyyy-mm-dd (서버에서 lookup), 없으면 null */
  nextAvailable?: { date: string; label: string } | null;
}

export default function EmptyState({ sport, nextAvailable }: Props) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 p-10 sm:p-14 text-center">
      <div className="text-3xl mb-3" aria-hidden>
        🌙
      </div>
      <p className="text-sm text-neutral-500">
        이 날짜에는 경기가 없습니다.
      </p>
      {nextAvailable && (
        <p className="mt-3 text-xs text-neutral-400">
          <Link
            href={`/scores?sport=${sport}&date=${nextAvailable.date}`}
            className="inline-flex items-center gap-1 text-[#00d4ff] hover:underline font-medium"
          >
            {nextAvailable.label} →
          </Link>
        </p>
      )}
    </div>
  );
}
