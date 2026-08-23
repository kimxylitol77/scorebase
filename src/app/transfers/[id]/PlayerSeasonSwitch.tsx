"use client";
// 시즌 상세 기록 + 시즌 성적 상세 두 카드를 시즌 전환형으로 묶는 래퍼.
//
// ts 시즌 스탯은 newest-only 라 시즌이 넘어가면 SEASON[id] 가 새 시즌으로 교체되고 직전 시즌이
// 화면에서 통째로 사라졌다(2026-08-23 음바페 25-26 31경기 25골 — DB 아카이브엔 있는데 미노출).
// 아카이브(archive-player-stats 잡)는 저장만 되고 읽는 곳이 없었다. 여기서 시즌 탭으로 올린다.
// 백분위는 서버가 시즌별 모집단으로 미리 계산해 내려준다(클라이언트는 고르기만).

import { useState } from "react";
import PlayerSeasonOverview from "./PlayerSeasonOverview";
import PlayerAdvancedStats from "./PlayerAdvancedStats";

type OverviewStat = Parameters<typeof PlayerSeasonOverview>[0]["stat"];
type AdvancedStat = Parameters<typeof PlayerAdvancedStats>[0]["stat"];

export interface SeasonChoice {
  /** 탭 라벨 — "2026-27" */
  label: string;
  /** 현 시즌이면 true — 탭에 표시 */
  current: boolean;
  stat: OverviewStat & AdvancedStat;
  pct: Record<string, number>;
}

export default function PlayerSeasonSwitch({ name, seasons }: { name: string; seasons: SeasonChoice[] }) {
  const [idx, setIdx] = useState(0);
  if (seasons.length === 0) return null;
  const sel = seasons[Math.min(idx, seasons.length - 1)];

  return (
    <div className="space-y-4">
      {/* 시즌 탭 — 둘 이상일 때만. 하나면 탭 없이 그대로(기존 화면과 동일) */}
      {seasons.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400 mr-1">시즌</span>
          {seasons.map((s, i) => {
            const active = i === idx;
            return (
              <button
                key={s.label}
                type="button"
                onClick={() => setIdx(i)}
                aria-pressed={active}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  active
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-300 dark:hover:bg-white/[0.1]"
                }`}
              >
                {s.label}
                {s.current && <span className="ml-1 opacity-60">현재</span>}
              </button>
            );
          })}
        </div>
      )}
      <PlayerSeasonOverview key={`ov-${sel.label}`} name={name} stat={sel.stat} />
      <PlayerAdvancedStats key={`adv-${sel.label}`} stat={sel.stat} pct={sel.pct} />
    </div>
  );
}
