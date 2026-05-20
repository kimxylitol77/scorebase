// 시즌 영향력 큰 매치 (1~3위 팀의 직접 대결) 강조 카드.
// /predictions 의 다가오는 경기 표 위에 작은 highlight 박스로 표시.
// 매치가 없으면 컴포넌트 자체를 숨김.

import Link from "next/link";

interface KeyMatch {
  id: number;
  startTime: Date;
  homeName: string;
  awayName: string;
  homeRank: number;
  awayRank: number;
  /** 모델 홈 승률 (0~1). */
  homeWp: number;
  /** 모델 원정 승률 (0~1). */
  awayWp: number;
  /** 매치 상세 페이지 link href. */
  href: string;
}

interface Props {
  matches: KeyMatch[];
}

export default function KeyMatchPreview({ matches }: Props) {
  if (!matches || matches.length === 0) return null;
  return (
    <div className="rounded-xl border border-amber-300/50 dark:border-amber-500/30 bg-amber-50/40 dark:bg-amber-500/5 p-3 sm:p-4 space-y-2">
      <div className="text-[10px] sm:text-[11px] font-bold tracking-wider uppercase text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
        <span aria-hidden>🔥</span>
        <span>이번 주 빅매치 — 상위권 직접 대결</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {matches.slice(0, 4).map((m) => (
          <Link
            key={m.id}
            href={m.href}
            prefetch={false}
            className="flex items-center gap-2 sm:gap-3 rounded-lg bg-white/60 dark:bg-neutral-900/60 hover:bg-white dark:hover:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800/60 px-3 py-2 transition group"
          >
            <div className="text-[10px] text-neutral-500 tabular-nums shrink-0 w-12 text-center font-medium">
              {m.startTime.toLocaleString("ko-KR", {
                month: "2-digit",
                day: "2-digit",
                timeZone: "Asia/Seoul",
              })}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs sm:text-sm font-bold truncate">
                <span className="inline-flex items-center gap-1">
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                    #{m.homeRank}
                  </span>
                  <span className="truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                    {m.homeName}
                  </span>
                </span>
                <span className="text-neutral-400 mx-1.5">vs</span>
                <span className="inline-flex items-center gap-1">
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                    #{m.awayRank}
                  </span>
                  <span className="truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                    {m.awayName}
                  </span>
                </span>
              </div>
              <div className="text-[10px] text-neutral-500 mt-0.5 tabular-nums">
                {(m.homeWp * 100).toFixed(0)}% · {(m.awayWp * 100).toFixed(0)}%
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
