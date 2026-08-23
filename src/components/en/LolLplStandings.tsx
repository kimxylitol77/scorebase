// LolLplStandings (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import LolLplTabs, { type LplGroup } from "@/components/en/LolLplTabs";
import lplData from "../../../data/lol-standings-LPL.json";

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
          Esports live
        </Link>
        <span>›</span>
        <span className="text-neutral-700 dark:text-neutral-300">{name} Standings</span>
      </nav>

      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> League standings
        </span>
        <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{name} Standings</h1>
        <p className="text-sm text-neutral-500 mt-2 break-keep">
          China · League of Legends Pro League · 2026 split · TheSports
        </p>
      </header>

      {/* 리그 스위처 — LCK ↔ LEC ↔ LCS ↔ LPL */}
      <div className="flex gap-1.5 flex-wrap">
        {[
          ["LOL", "LCK"],
          ["LEC", "LEC"],
          ["LCS", "LCS"],
          ["LPL", "LPL"],
          ["EWC", "EWC"],
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
        ⓘ LPL splits are ranked by group · each group starts from first · updated after each match
      </p>
    </div>
  );
}
