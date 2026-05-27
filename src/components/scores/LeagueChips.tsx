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
  // 좌우 fade gradient 로 가로 스크롤 가능함을 시각적으로 hint — 모바일에서 12+ 리그 한 줄에
  // 다 안 보일 때 사용자가 "세로 list" 로 오인하지 않게.
  return (
    <nav
      className="relative flex gap-1.5 overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0 py-1 [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,transparent_0,black_12px,black_calc(100%-12px),transparent_100%)] sm:[mask-image:none]"
      aria-label="리그 필터 (가로 스크롤)"
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
