// 월드컵 허브 탭 바 — iOS 세그먼트 컨트롤(애플) + lucide 라인 아이콘. ?view= 기반 SSR 탭.
import Link from "next/link";
import { LayoutGrid, Trophy, Users, ListOrdered, BarChart3, Network, type LucideIcon } from "lucide-react";

const TABS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "groups", label: "조별리그", icon: ListOrdered },
  { key: "bracket", label: "대진표", icon: Network },
  { key: "overview", label: "개요", icon: LayoutGrid },
  { key: "predictions", label: "예측", icon: Trophy },
  { key: "players", label: "선수", icon: Users },
  { key: "xg", label: "xG", icon: BarChart3 },
];

export default function WcTabBar({ current }: { current: string }) {
  return (
    <div className="flex gap-1 p-1 rounded-2xl bg-neutral-100 dark:bg-neutral-900 overflow-x-auto">
      {TABS.map((t) => {
        const on = t.key === current;
        const Icon = t.icon;
        return (
          <Link
            key={t.key}
            href={t.key === "groups" ? "/world-cup" : `/world-cup?view=${t.key}`}
            prefetch={false}
            scroll={false}
            className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium whitespace-nowrap transition ${
              on
                ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm"
                : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
            }`}
          >
            <Icon className="w-[15px] h-[15px] shrink-0" aria-hidden />
            <span className="truncate">{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
