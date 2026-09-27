// 종목 허브 "기능 모음" — 헤더 바로 아래에서 그 종목의 세부 페이지를 묶음별(아이콘·이름·한 줄 설명)로 보여준다.
// 모바일은 한 줄 두 개(설명 1줄) — 한 줄 하나면 20여 개가 쌓여 오늘 경기 카드가 한참 밀린다.
// 헤더 메뉴를 줄이면서(2026-09-27) 메뉴에서 뺀 페이지도 여기서 반드시 닿게 한다. 페이지 맨 아래 이름만 있던 칩 목록을 대체.
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export interface HubFeature {
  href: string;
  label: string;
  desc: string;
  Icon: LucideIcon;
}
export interface HubFeatureGroup {
  title: string;
  items: HubFeature[];
}

export default function HubFeatureGrid({ groups }: { groups: HubFeatureGroup[] }) {
  return (
    <section aria-labelledby="hub-features" className="rounded-[1.5rem] bg-white p-4 ring-1 ring-black/5 dark:bg-white/[0.03] dark:ring-white/10 sm:p-5">
      <h2 id="hub-features" className="mb-3 text-sm font-bold tracking-tight text-neutral-900 dark:text-white">기능 모음</h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {groups.map((g) => (
          <div key={g.title} className="min-w-0">
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{g.title}</h3>
            <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5 sm:grid-cols-1">
              {g.items.map((it) => (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    prefetch={false}
                    className="group -mx-2 flex items-start gap-2.5 rounded-xl px-2 py-1.5 transition hover:bg-neutral-50 dark:hover:bg-white/[0.05]"
                  >
                    <it.Icon className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-neutral-800 group-hover:text-rose-600 dark:text-neutral-100 dark:group-hover:text-rose-400">
                        {it.label}
                      </span>
                      <span className="line-clamp-1 text-[11px] leading-snug text-neutral-500 break-keep dark:text-neutral-400 sm:line-clamp-none">{it.desc}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
