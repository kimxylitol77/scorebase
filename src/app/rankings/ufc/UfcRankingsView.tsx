"use client";
// UFC 랭킹 인터랙티브 뷰 — 체급 탭 선택 + 챔피언 카드 + 컨텐더 리스트. 데이터는 서버에서 주입.
import { useState } from "react";

export interface RankedFighter {
  rank: number; // 챔피언은 0
  name: string;
  nameKo: string | null;
  record: string | null;
  headshot: string | null;
}
export interface RankCategory {
  slug: string;
  displayName: string;
  gender: "M" | "F";
  isP4p: boolean;
  sortOrder: number;
  champion: RankedFighter | null;
  ranks: RankedFighter[];
}

// 파이터 아바타 — 헤드샷 있으면 이미지, 없으면 이니셜 원형.
function Avatar({ f, size }: { f: RankedFighter; size: number }) {
  const label = (f.nameKo ?? f.name).trim().charAt(0);
  if (f.headshot) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={f.headshot}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="shrink-0 rounded-full bg-neutral-100 object-cover dark:bg-neutral-800"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="shrink-0 grid place-items-center rounded-full bg-neutral-200 font-bold text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {label}
    </span>
  );
}

export default function UfcRankingsView({ categories }: { categories: RankCategory[] }) {
  const [slug, setSlug] = useState(categories[0]?.slug ?? "");
  const active = categories.find((c) => c.slug === slug) ?? categories[0];
  if (!active) return null;

  const p4p = categories.filter((c) => c.isP4p);
  const men = categories.filter((c) => !c.isP4p && c.gender === "M");
  const women = categories.filter((c) => !c.isP4p && c.gender === "F");

  const Tab = ({ c }: { c: RankCategory }) => (
    <button
      onClick={() => setSlug(c.slug)}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition ${
        c.slug === active.slug
          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          : "bg-white text-neutral-600 ring-1 ring-black/10 hover:ring-black/20 dark:bg-white/[0.04] dark:text-neutral-300 dark:ring-white/10"
      }`}
    >
      {c.displayName}
    </button>
  );

  return (
    <div className="space-y-5">
      {/* 체급 탭 */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">{p4p.map((c) => <Tab key={c.slug} c={c} />)}</div>
        <div className="flex flex-wrap gap-1.5">{men.map((c) => <Tab key={c.slug} c={c} />)}</div>
        <div className="flex flex-wrap gap-1.5">{women.map((c) => <Tab key={c.slug} c={c} />)}</div>
      </div>

      {/* 챔피언 카드 */}
      {active.champion && (
        <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-amber-50 to-white p-4 ring-1 ring-amber-300 dark:from-amber-500/10 dark:to-transparent dark:ring-amber-500/30">
          <Avatar f={active.champion} size={64} />
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              🏆 챔피언
            </div>
            <div className="truncate text-lg font-black">{active.champion.nameKo ?? active.champion.name}</div>
            {active.champion.record && (
              <div className="text-sm tabular-nums text-neutral-500">{active.champion.record}</div>
            )}
          </div>
        </div>
      )}

      {/* 컨텐더 리스트 */}
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
        {active.ranks.map((f) => (
          <div
            key={f.rank + f.name}
            className="flex items-center gap-3 border-b border-neutral-100 px-3.5 py-2.5 last:border-b-0 dark:border-neutral-800/60"
          >
            <span className="w-6 shrink-0 text-center text-sm font-black tabular-nums text-neutral-400">{f.rank}</span>
            <Avatar f={f} size={36} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{f.nameKo ?? f.name}</span>
            {f.record && <span className="shrink-0 text-xs tabular-nums text-neutral-400">{f.record}</span>}
          </div>
        ))}
        {active.ranks.length === 0 && (
          <div className="p-6 text-center text-sm text-neutral-400">랭킹 데이터 준비 중</div>
        )}
      </div>

      <p className="text-[11px] text-neutral-400">
        출처: UFC.com 공식 랭킹 · 미디어 패널 투표로 매주 갱신됩니다. 한글 표기가 없는 파이터는 영문으로 표시됩니다.
      </p>
    </div>
  );
}
