import Link from "next/link";
import type { RankRow } from "@/lib/analysis/ranking";
import { displayGrade } from "@/lib/user-level";
import { resolveAvatar } from "@/lib/analysis/analysts";
import Avatar from "./Avatar";
import StreakBadge from "./StreakBadge";

const MEDAL = ["🥇", "🥈", "🥉"];

// 리더보드 1행 — 순위/메달 · 아바타 · 닉네임+연승+분석관칩 · 적중률. 클릭 → 프로필.
export default function ExpertRow({ row, index }: { row: RankRow; index: number }) {
  const g = displayGrade(row.level, row.badge);
  const avatar = resolveAvatar(row.avatarUrl, row.nickname, row.level, row.badge);
  const medal = MEDAL[index];

  return (
    <Link
      href={`/experts/${row.userId}`}
      className="group grid grid-cols-[40px_1fr_auto] gap-3 items-center px-4 py-3.5 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.03]"
    >
      <span className="text-center text-lg font-bold text-neutral-400">
        {medal ?? <span className="text-sm">{index + 1}</span>}
      </span>

      <span className="flex items-center gap-3 min-w-0">
        <Avatar avatar={avatar} size="md" />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-bold text-sm transition-colors group-hover:text-rose-600 dark:group-hover:text-rose-400">{row.nickname}</span>
            <StreakBadge streak={row.streak} />
          </span>
          <span className="flex items-center gap-1.5 mt-1">
            <span className="text-[11px] text-neutral-400" title={g.name}>
              {g.emoji} {g.name}
            </span>
          </span>
        </span>
      </span>

      <span className="text-right shrink-0">
        <span className="block font-extrabold text-rose-500 text-sm">{row.rate}%</span>
        <span className="block text-[11px] text-neutral-400">
          {row.hit}적중 / {row.total}
        </span>
      </span>
    </Link>
  );
}
