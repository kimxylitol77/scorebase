// LPL(중국) 순위 — 그룹별 순위표 + 로스터 server wrapper.
//   데이터 = data/lol-standings-LPL.json (build-lol-standings --league=LPL, 그룹=part_stage).
//   LPL 은 lolGames 미수집이라 선수·챔피언 통계 없음 → 순위·로스터만(LolLplTabs).
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import LolLplTabs, { type LplGroup } from "@/components/LolLplTabs";
import lplData from "../../data/lol-standings-LPL.json";

interface Data {
  league: string;
  name: string;
  updatedAt: string;
  groups: LplGroup[];
}

export default function LolLplStandings({ name }: { name: string }) {
  const data = lplData as Data;
  if (!data?.groups?.length) return null;

  return (
    <div className="relative max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-5">
      <AmbientGlow />
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores?sport=esports" className="hover:underline">
          e스포츠 라이브
        </Link>
        <span>›</span>
        <span className="text-neutral-700 dark:text-neutral-300">{name} 순위</span>
      </nav>

      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 리그 순위
        </span>
        <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{name} 순위</h1>
        <p className="text-sm text-neutral-500 mt-2 break-keep">
          중국 · League of Legends Pro League · 2026 스플릿 · TheSports
        </p>
      </header>

      {/* 리그 스위처 — LCK ↔ LEC ↔ LCS ↔ LPL */}
      <div className="flex gap-1.5 flex-wrap">
        {[
          ["LOL", "LCK"],
          ["LEC", "LEC"],
          ["LCS", "LCS"],
          ["LPL", "LPL"],
        ].map(([code, lbl]) => (
          <Link
            key={code}
            href={`/standings/${code}`}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition ${
              code === "LPL"
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "bg-neutral-100 dark:bg-white/[0.06] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            {lbl}
          </Link>
        ))}
      </div>

      <LolLplTabs groups={data.groups} />

      <p className="text-[11px] text-neutral-400 text-center pt-1">
        ⓘ LPL 스플릿은 그룹(조)별로 순위가 매겨집니다 · 그룹마다 1위부터 표기 · 경기 종료 후 갱신
      </p>
    </div>
  );
}
