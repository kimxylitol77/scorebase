"use client";
// 시즌별 성적 아코디언 — 헤더 클릭으로 펼치기/접기. 멀티시즌 지원(현재는 현 시즌만, 첫 시즌 기본 펼침).
//  ⚠️ 과거 시즌 통계는 TheSports 플랜상 newest season 만 제공(405) → 현재는 1개. 추후 소스 확보 시 배열에 추가.
import { useState } from "react";

interface SeasonStat {
  pos: string | null;
  matches: number | null; starts: number | null; goals: number | null; assists: number | null;
  minutes: number | null; shots: number | null; sot: number | null; keyPasses: number | null;
  passAcc: number | null; tackles: number | null; interceptions: number | null;
  yellow: number | null; red: number | null; saves: number | null;
}
export interface SeasonEntry { label: string; team: string | null; stat: SeasonStat }

function tilesFor(s: SeasonStat): { label: string; val: string; hi?: boolean }[] {
  const isGK = s.pos === "G";
  const t: { label: string; val: string; hi?: boolean }[] = [];
  const add = (label: string, v: number | null, hi = false, suffix = "") => { if (v != null) t.push({ label, val: `${v}${suffix}`, hi }); };
  add("경기", s.matches);
  if (isGK) add("선방", s.saves, true);
  else { add("골", s.goals, true); add("도움", s.assists, true); }
  add("선발", s.starts);
  add("출전", s.minutes, false, "분");
  if (!isGK) { add("슈팅", s.shots); add("유효슈팅", s.sot); add("키패스", s.keyPasses); add("패스성공", s.passAcc, false, "%"); add("태클", s.tackles); add("가로채기", s.interceptions); }
  add("경고", s.yellow); add("퇴장", s.red);
  return t;
}

export default function SeasonAccordion({ seasons }: { seasons: SeasonEntry[] }) {
  // 첫 시즌(최신)은 기본 펼침, 나머지는 접힘
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true });
  if (!seasons.length) return null;
  return (
    <section className="space-y-2">
      {seasons.map((se, i) => {
        const tiles = tilesFor(se.stat);
        const isOpen = open[i] ?? false;
        return (
          <div key={i} className="rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [i]: !isOpen }))}
              aria-expanded={isOpen}
              className="flex items-center justify-between w-full px-4 sm:px-5 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition"
            >
              <span className="flex items-baseline gap-2 min-w-0">
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 shrink-0">{se.label} 성적</span>
                {se.team && <span className="text-xs text-neutral-400 truncate">{se.team}</span>}
              </span>
              <span className={`text-neutral-400 text-sm shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>▾</span>
            </button>
            {isOpen && tiles.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 px-4 sm:px-5 pb-4">
                {tiles.map((t) => (
                  <div key={t.label} className="rounded-xl bg-neutral-50 dark:bg-neutral-900/60 px-3 py-2.5 text-center">
                    <div className={`text-xl font-black tabular-nums ${t.hi ? "text-cyan-600 dark:text-cyan-400" : ""}`}>{t.val}</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">{t.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
