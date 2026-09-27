// 야구 포스트시즌 대진표 리그 전환 탭 — KBO·MLB·NPB 세 페이지가 헤더 맨 위에 같이 쓴다(메뉴는 1개로 합쳤다).
import Link from "next/link";

const TABS = [
  { league: "KBO", href: "/baseball/kbo-postseason" },
  { league: "MLB", href: "/baseball/mlb-postseason" },
  { league: "NPB", href: "/baseball/npb-postseason" },
] as const;

export default function PostseasonLeagueTabs({ current }: { current: "KBO" | "MLB" | "NPB" }) {
  return (
    <nav aria-label="포스트시즌 리그" className="inline-flex gap-1 rounded-2xl bg-neutral-100 p-1 dark:bg-neutral-900">
      {TABS.map((t) => {
        const on = t.league === current;
        return (
          <Link
            key={t.league}
            href={t.href}
            prefetch={false}
            aria-current={on ? "page" : undefined}
            className={`rounded-xl px-4 py-1.5 text-[13px] font-semibold transition ${
              on
                ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white"
                : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
          >
            {t.league}
          </Link>
        );
      })}
    </nav>
  );
}
