// 시즌별 성적 아코디언 (영어판). scripts/en-mirror 로 자동 생성.
"use client";
// 시즌별 성적 아코디언 — 헤더 클릭 펼치기/접기. 첫(최신) 시즌 기본 펼침.
//  · rich: 현 시즌(TheSports season/recent/player/stat) 상세 타일
//  · wiki: 과거 시즌(Wikipedia Career statistics) 클럽별 리그/총 출장·골 (TheSports 는 newest-only 제약)
import { useState } from "react";

interface SeasonStat {
  pos: string | null;
  matches: number | null; starts: number | null; goals: number | null; assists: number | null;
  minutes: number | null; shots: number | null; sot: number | null; keyPasses: number | null;
  passAcc: number | null; tackles: number | null; interceptions: number | null;
  yellow: number | null; red: number | null; saves: number | null;
}
export interface WikiRow { club: string; lApps: number; lGoals: number; tApps: number; tGoals: number }
export type SeasonEntry =
  | { kind: "rich"; label: string; sub: string | null; stat: SeasonStat }
  | { kind: "wiki"; label: string; sub: string | null; rows: WikiRow[] };

function tilesFor(s: SeasonStat): { label: string; val: string; hi?: boolean }[] {
  const isGK = s.pos === "G";
  const t: { label: string; val: string; hi?: boolean }[] = [];
  const add = (label: string, v: number | null, hi = false, suffix = "") => { if (v != null) t.push({ label, val: `${v}${suffix}`, hi }); };
  add("Apps", s.matches);
  if (isGK) add("Saves", s.saves, true);
  else { add("Goals", s.goals, true); add("Assists", s.assists, true); }
  add("Starts", s.starts);
  add("Apps", s.minutes, false, "min");
  if (!isGK) { add("Shots", s.shots); add("On target", s.sot); add("Key passes", s.keyPasses); add("Pass acc.", s.passAcc, false, "%"); add("Tackles", s.tackles); add("Interceptions", s.interceptions); }
  add("Yellow", s.yellow); add("Red", s.red);
  return t;
}

export default function SeasonAccordion({ seasons }: { seasons: SeasonEntry[] }) {
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true });
  if (!seasons.length) return null;
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">Season by season</h2>
      <div className="space-y-2">
        {seasons.map((se, i) => {
          const isOpen = open[i] ?? false;
          return (
            <div key={i} className="rounded-2xl bg-white ring-1 ring-black/5 overflow-hidden dark:bg-white/[0.04] dark:ring-white/10">
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [i]: !isOpen }))}
                aria-expanded={isOpen}
                className="flex items-center justify-between w-full px-4 sm:px-5 py-3 hover:bg-neutral-50 dark:hover:bg-white/[0.04] transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
              >
                <span className="flex items-baseline gap-2 min-w-0">
                  <span className="text-sm font-bold text-neutral-700 dark:text-neutral-200 shrink-0">{se.label}</span>
                  {se.sub && <span className="text-xs text-neutral-400 truncate">{se.sub}</span>}
                </span>
                <span className={`text-neutral-400 text-sm shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>▾</span>
              </button>
              {isOpen && se.kind === "rich" && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 px-4 sm:px-5 pb-4">
                  {tilesFor(se.stat).map((t) => (
                    <div key={t.label} className="rounded-xl bg-neutral-50 dark:bg-white/[0.04] px-3 py-2.5 text-center">
                      <div className={`text-xl font-black tabular-nums ${t.hi ? "text-cyan-600 dark:text-cyan-400" : ""}`}>{t.val}</div>
                      <div className="text-[11px] text-neutral-500 mt-0.5">{t.label}</div>
                    </div>
                  ))}
                </div>
              )}
              {isOpen && se.kind === "wiki" && (
                <div className="px-4 sm:px-5 pb-3 divide-y divide-black/5 dark:divide-white/5">
                  {se.rows.map((r, j) => (
                    <div key={j} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <span className="font-medium truncate">{r.club}</span>
                      <span className="text-neutral-500 tabular-nums shrink-0">
                        League <span className="font-semibold text-neutral-700 dark:text-neutral-200">{r.lApps}</span>Apps <span className="font-semibold text-cyan-600 dark:text-cyan-400">{r.lGoals}</span>Goals
                        {(r.tApps !== r.lApps || r.tGoals !== r.lGoals) && <span className="text-neutral-400"> · all {r.tApps}/{r.tGoals}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
