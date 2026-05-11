// LoL RECAP — 다음 매치 미니 예고 (양 팀 각각 1건)

import Link from "next/link";
import type { LolRecapNextMatch } from "@/lib/sports/lol-recap-context";

interface Props {
  team1NameKo: string;
  team2NameKo: string;
  team1Next: LolRecapNextMatch | null;
  team2Next: LolRecapNextMatch | null;
}

function formatDateKst(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  });
}

function TeaserCard({
  teamName,
  next,
}: {
  teamName: string;
  next: LolRecapNextMatch | null;
}) {
  if (!next) {
    return (
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 p-4">
        <div className="text-xs text-neutral-500 mb-1">{teamName} 다음 매치</div>
        <div className="text-sm text-neutral-400">예정된 매치 없음</div>
      </div>
    );
  }
  const ha = next.homeAway === "home" ? "(홈)" : "(어웨이)";
  const dateStr = formatDateKst(next.startDateIso);
  const probHome = next.modelWinProb?.home;
  const probPct = probHome != null ? Math.round(probHome * 100) : null;

  const inner = (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 hover:border-rose-300 dark:hover:border-rose-500/50 bg-white dark:bg-neutral-950 hover:bg-rose-50/30 dark:hover:bg-rose-500/5 p-4 transition">
      <div className="text-[11px] text-neutral-500 mb-1">
        👉 {teamName} 다음 매치
      </div>
      <div className="text-sm font-bold text-neutral-900 dark:text-white">
        {dateStr} <span className="text-neutral-400 font-medium">vs</span>{" "}
        {next.opponentNameKo}{" "}
        <span className="text-xs font-medium text-neutral-500">{ha}</span>
      </div>
      {probPct != null && (
        <div className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-400">
          시장 평균: <span className="font-bold text-rose-600 dark:text-rose-400">
            {teamName} {probPct}%
          </span>
        </div>
      )}
      {next.previewSlug && (
        <div className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
          프리뷰 보기 →
        </div>
      )}
    </div>
  );
  if (next.previewSlug)
    return <Link href={`/articles/${next.previewSlug}`}>{inner}</Link>;
  return inner;
}

export default function NextMatchTeaser({
  team1NameKo,
  team2NameKo,
  team1Next,
  team2Next,
}: Props) {
  if (!team1Next && !team2Next) return null;
  return (
    <section
      aria-label="다음 매치 예고"
      className="my-6 grid grid-cols-1 sm:grid-cols-2 gap-3"
    >
      <TeaserCard teamName={team1NameKo} next={team1Next} />
      <TeaserCard teamName={team2NameKo} next={team2Next} />
    </section>
  );
}
