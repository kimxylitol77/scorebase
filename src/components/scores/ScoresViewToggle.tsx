// 축구 외 종목 탭 보기 토글 — 스코어보드 표(기본) / 카드(?view=card). 축구의 SoccerSortToggle 과 같은 칩 톤.
import Link from "next/link";

export type ScoresOtherView = "board" | "card";

export default function ScoresViewToggle({
  active,
  sport,
  date,
  league,
}: {
  active: ScoresOtherView;
  sport: string;
  date: string;
  league?: string | null;
}) {
  const items: { key: ScoresOtherView; label: string }[] = [
    { key: "board", label: "스코어보드" },
    { key: "card", label: "카드" },
  ];
  return (
    <nav className="flex gap-1.5" aria-label="경기 보기 방식">
      {items.map((item) => {
        const params = new URLSearchParams({ sport, date });
        if (league) params.set("league", league);
        // 스코어보드도 명시(view=board) — 쿠키에 기억된 카드 선택을 이길 수 있어야 한다
        params.set("view", item.key);
        const isActive = active === item.key;
        return (
          <Link
            key={item.key}
            href={`/scores?${params.toString()}`}
            prefetch={false}
            className={`inline-flex items-center px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap transition-colors ${
              isActive
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
