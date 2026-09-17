// 투표 랭킹 1행 — ExpertRow 와 같은 정체성 블록 + 적중률·수익률·CLV 세 수치. 클릭 → 프로필.
import Link from "next/link";
import type { VoteRankRow as Row } from "@/lib/analysis/vote-ranking";
import { displayGrade } from "@/lib/user-level";
import { resolveAvatar } from "@/lib/analysis/analysts";
import { fmtRoiPct } from "@/lib/predict/flat-roi";
import { MARKET_LABEL, type VoteMarket } from "@/lib/vote-markets";
import Avatar from "./Avatar";
import StreakBadge from "./StreakBadge";
import UserName from "@/components/UserName";
import TeamBadge from "@/components/TeamBadge";

const MEDAL = ["🥇", "🥈", "🥉"];

export default function VoteRankRow({ row, index }: { row: Row; index: number }) {
  const g = displayGrade(row.level, row.badge);
  const avatar = resolveAvatar(row.avatarUrl, row.nickname, row.level, row.badge);
  const medal = MEDAL[index];
  const roiCls = row.roi.roi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-500 dark:text-neutral-400";
  return (
    <Link
      href={`/experts/${row.userId}`}
      className="group grid grid-cols-[40px_1fr_auto] gap-3 items-center px-4 py-3.5 transition-colors duration-300 hover:bg-neutral-50 dark:hover:bg-white/[0.03]"
    >
      <span className="text-center text-lg font-bold text-neutral-400">{medal ?? <span className="text-sm">{index + 1}</span>}</span>
      <span className="flex items-center gap-3 min-w-0">
        <Avatar avatar={avatar} size="md" frame={row.avatarFrame} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <UserName name={row.nickname} nameColor={row.nameColor} title={row.title} className="truncate font-bold text-sm transition-colors group-hover:text-rose-600 dark:group-hover:text-rose-400" />
            <TeamBadge logoUrl={row.favTeamLogo} size={16} className="shrink-0 rounded-sm" />
            <StreakBadge streak={row.streak} />
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-neutral-400">
            <span title={g.name}>{g.emoji} {g.name}</span>
            <span className="tabular-nums">· {row.markets.map((m) => `${MARKET_LABEL[m.market as VoteMarket] ?? m.market} ${m.hit}/${m.total}`).join(" · ")}</span>
          </span>
        </span>
      </span>
      <span className="text-right shrink-0">
        <span className="block font-extrabold text-rose-500 text-sm">{row.rate}%</span>
        <span className="block text-[11px] text-neutral-400 tabular-nums">{row.hit}적중 / {row.total}</span>
        <span className="mt-0.5 block text-[11px] tabular-nums">
          <span className={`font-semibold ${roiCls}`} title="픽 시점 해외 평균 배당에 1표 1유닛을 걸었다고 가정한 후행 정산">
            {row.roi.evaluated > 0 ? `수익률 ${fmtRoiPct(row.roi.roi)}` : "수익률 —"}
          </span>
          {row.avgClv != null && (
            <span className="ml-1.5 text-neutral-400" title="CLV — 픽 시점 배당이 킥오프 직전 종가보다 얼마나 좋았는지. 양수면 시장보다 먼저 움직인 것">
              CLV {row.avgClv >= 0 ? "+" : ""}{row.avgClv.toFixed(1)}%
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}
