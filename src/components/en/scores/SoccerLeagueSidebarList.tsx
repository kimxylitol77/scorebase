// scores__SoccerLeagueSidebarList (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useFavoriteLeagues } from "../../scores/useFavoriteLeagues";

export interface SidebarLeagueItem {
  code: string;
  name: string;
  logo: string | null;
  href: string;
  count: number;
  country: string | null;
  flag: string;
}

interface Props {
  items: SidebarLeagueItem[];
  /** 인기 리그 순서(경기 있는 것만) */
  popular: string[];
  /** 국가 정렬 순서 */
  countryOrder: string[];
  activeLeague?: string | null;
}

/** 인기·즐겨찾기 밖에서 "오늘 경기 많은 리그"로 바로 보여줄 개수 */
const TODAY_TOP = 8;

const itemClass =
  "group flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] leading-tight transition-colors text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800";
const itemActiveClass =
  "group flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] leading-tight bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-semibold";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-2 mb-1.5 text-[10px] font-bold tracking-wider text-neutral-500 dark:text-neutral-400 uppercase">
      {children}
    </h3>
  );
}

function LeagueRow({
  item,
  active,
  fav,
  onToggleFav,
  small,
}: {
  item: SidebarLeagueItem;
  active: boolean;
  fav: boolean;
  onToggleFav: () => void;
  small?: boolean;
}) {
  const size = small ? 14 : 16;
  return (
    <li className="relative">
      <Link href={item.href} className={`${active ? itemActiveClass : itemClass} pr-6`}>
        {item.logo ? (
          <Image
            src={item.logo}
            alt=""
            width={size}
            height={size}
            className={`shrink-0 object-contain ${small ? "opacity-80" : ""}`}
          />
        ) : (
          <span className="inline-block shrink-0" style={{ width: size }} />
        )}
        <span className="truncate">{item.name}</span>
        <span className="ml-auto pl-1 text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 tabular-nums">
          {item.count}
        </span>
      </Link>
      {/* 즐겨찾기 별 — 행 hover 또는 이미 즐겨찾기일 때만 보임 */}
      <button
        type="button"
        onClick={onToggleFav}
        aria-label={fav ? `${item.name} — remove from favourites` : `${item.name} — add to favourites`}
        aria-pressed={fav}
        title={fav ? "Remove from favourites" : "Favourites"}
        className={`absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 inline-flex items-center justify-center rounded text-[12px] leading-none transition-opacity ${
          fav
            ? "text-amber-500 opacity-100"
            : "text-neutral-400 opacity-0 group-hover:opacity-100 hover:opacity-100 focus-visible:opacity-100 [li:hover_&]:opacity-100"
        }`}
      >
        {fav ? "★" : "☆"}
      </button>
    </li>
  );
}

export default function SoccerLeagueSidebarList({ items, popular, countryOrder, activeLeague }: Props) {
  const { leagues: favLeagues, isFavorite, toggle } = useFavoriteLeagues();
  const [q, setQ] = useState("");
  const byCode = useMemo(() => new Map(items.map((i) => [i.code, i])), [items]);

  // 구획 분배 — 위 구획에 들어간 리그는 아래에서 제외.
  const favItems = favLeagues.map((c) => byCode.get(c)).filter((i): i is SidebarLeagueItem => !!i);
  const used = new Set(favItems.map((i) => i.code));
  const popItems = popular.map((c) => byCode.get(c)).filter((i): i is SidebarLeagueItem => !!i && !used.has(i.code));
  for (const i of popItems) used.add(i.code);
  const rest = items.filter((i) => !used.has(i.code));
  const todayItems = [...rest].sort((a, b) => b.count - a.count).slice(0, TODAY_TOP);
  for (const i of todayItems) used.add(i.code);
  const countryRest = rest.filter((i) => !used.has(i.code) && i.country);
  const byCountry = new Map<string, SidebarLeagueItem[]>();
  for (const i of countryRest) {
    const arr = byCountry.get(i.country!) ?? [];
    arr.push(i);
    byCountry.set(i.country!, arr);
  }
  const countries = Array.from(byCountry.keys()).sort((a, b) => {
    const ia = countryOrder.indexOf(a);
    const ib = countryOrder.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, "ko");
  });
  const activeCountry = activeLeague ? byCode.get(activeLeague)?.country ?? null : null;

  // 검색 — 리그명·국가명 부분일치, 평면 목록으로 대체.
  const query = q.trim().toLowerCase();
  const searched = query
    ? items.filter(
        (i) => i.name.toLowerCase().includes(query) || (i.country ?? "").toLowerCase().includes(query),
      )
    : null;

  const row = (i: SidebarLeagueItem, small?: boolean) => (
    <LeagueRow
      key={i.code}
      item={i}
      active={activeLeague === i.code}
      fav={isFavorite(i.code)}
      onToggleFav={() => toggle(i.code)}
      small={small}
    />
  );

  return (
    <div>
      {/* 검색 — 긴 리그 목록(90개국) 대안 */}
      <div className="mt-3 px-1">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search league or country"
          aria-label="Search by league or country name"
          className="w-full rounded-md border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-900 px-2 py-1 text-[12px] text-neutral-800 dark:text-neutral-200 placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
        />
      </div>

      {searched ? (
        <section className="mt-3">
          <SectionTitle>Results {searched.length}</SectionTitle>
          {searched.length === 0 ? (
            <p className="px-2 text-[11px] text-neutral-400">No match among leagues with fixtures today.</p>
          ) : (
            <ul className="space-y-0.5">{searched.map((i) => row(i))}</ul>
          )}
        </section>
      ) : (
        <>
          {favItems.length > 0 && (
            <section className="mt-3">
              <SectionTitle>Favourite leagues</SectionTitle>
              <ul className="space-y-0.5">{favItems.map((i) => row(i))}</ul>
            </section>
          )}

          {popItems.length > 0 && (
            <section className="mt-4">
              <SectionTitle>Popular leagues</SectionTitle>
              <ul className="space-y-0.5">{popItems.map((i) => row(i))}</ul>
            </section>
          )}

          {todayItems.length > 0 && (
            <section className="mt-4">
              <SectionTitle>Most fixtures today</SectionTitle>
              <ul className="space-y-0.5">{todayItems.map((i) => row(i, true))}</ul>
            </section>
          )}

          {countries.length > 0 && (
            <section className="mt-4">
              <SectionTitle>By country {countries.length}</SectionTitle>
              <div className="space-y-0.5">
                {countries.map((country) => {
                  const list = byCountry.get(country) ?? [];
                  const total = list.reduce((s, i) => s + i.count, 0);
                  return (
                    <details key={country} open={country === activeCountry} className="group/c">
                      <summary className="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer select-none text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 list-none [&::-webkit-details-marker]:hidden">
                        <span className="text-[14px] leading-none" aria-hidden>
                          {list[0]?.flag || ""}
                        </span>
                        <span className="truncate">{country}</span>
                        <span className="ml-auto pl-1 text-[10px] text-neutral-400 tabular-nums">{total}</span>
                        <span className="text-[9px] text-neutral-400 transition-transform group-open/c:rotate-90" aria-hidden>
                          ▶
                        </span>
                      </summary>
                      <ul className="space-y-0.5 pl-2">{list.map((i) => row(i, true))}</ul>
                    </details>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
