// 리그 필터 칩 — 야구 카테고리에서 [전체] [KBO] [NPB] [MLB] 같이.

import Link from "next/link";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";

interface Props {
  /** 표시할 리그 코드 */
  leagues: string[];
  /** 현재 선택된 리그 — null/undefined = "전체" */
  activeLeague?: string | null;
  /** 종목 (url 유지) */
  sport: string;
  /** 일자 (url 유지) */
  date: string;
}

export default function LeagueChips({
  leagues,
  activeLeague,
  sport,
  date,
}: Props) {
  if (leagues.length <= 1) return null;
  const baseHref = `/scores?sport=${sport}&date=${date}`;
  return (
    <nav
      className="flex gap-1.5 overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0 [&::-webkit-scrollbar]:hidden"
      aria-label="리그 필터"
    >
      <Link
        href={baseHref}
        className={`league-chip ${!activeLeague ? "active" : ""}`}
      >
        전체
      </Link>
      {leagues.map((l) => (
        <Link
          key={l}
          href={`${baseHref}&league=${l}`}
          className={`league-chip ${activeLeague === l ? "active" : ""}`}
        >
          {LEAGUE_DISPLAY[l] ?? l}
        </Link>
      ))}
    </nav>
  );
}
