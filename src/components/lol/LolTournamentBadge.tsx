// LoL 대회 배지 — 로고 + 대회명. 리그 라벨(LCK)만으로는 정규·컵·KeSPA 컵이 구분되지 않아 붙인다.
import type { LolTournament } from "@/lib/sports/lol-tournaments";

export default function LolTournamentBadge({ tournament, className = "" }: { tournament: LolTournament; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold text-neutral-700 ring-1 ring-black/10 dark:bg-white/[0.06] dark:text-neutral-200 dark:ring-white/15 ${className}`}>
      {tournament.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={tournament.logo} alt="" className="h-4 w-4 shrink-0 rounded object-contain" loading="lazy" />
      )}
      {tournament.name}
    </span>
  );
}
