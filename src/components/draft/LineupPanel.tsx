"use client";
// 내 라인업 패널 — 가드2·포워드2·센터1 슬롯과 점수·보너스 내역. 게임 중과 결과 화면이 함께 쓴다.
import PlayerFace from "./PlayerFace";
import { SLOT_LABELS, seasonLabel, signed } from "@/lib/draft/labels";
import type { Score } from "@/lib/draft/scoring";
import type { PickView } from "@/lib/draft/view";
import type { DraftMode } from "@/lib/draft/types";

interface Props {
  mode: DraftMode;
  picks: PickView[];
  score: Score;
  lockdownAt: number;
}

const tone = (v: number) => (v > 0 ? "text-emerald-600 dark:text-emerald-400" : v < 0 ? "text-rose-600 dark:text-rose-400" : "text-neutral-400");

export default function LineupPanel({ mode, picks, score, lockdownAt }: Props) {
  const bySlot = SLOT_LABELS.map((_, i) => picks.find((p) => p.slot === i));
  const extra = picks.filter((p) => p.slot < 0);
  const bonuses: [string, number, string][] = [
    ["풀 라인업", score.full, "가드 2·포워드 2·센터 1"],
    ["공수 균형", score.balance, "-2.0 ~ +2.0"],
    ["내구성", score.durability, "출전 시간, -1.5 ~ +1.5"],
    ["철벽 수비", score.lockdown, `수비 합 ${lockdownAt} 초과`],
  ];
  return (
    <div className="rounded-[1.75rem] bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:shadow-none dark:ring-white/10">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">내 라인업</h2>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">{picks.length}/5</span>
      </div>
      <div className="mt-2 flex items-end justify-between">
        <div>
          <div className="text-3xl font-bold tabular-nums text-neutral-900 dark:text-white">{signed(score.total)}</div>
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">기여도 {signed(score.impact)} · 보너스 {signed(score.bonus)}</div>
        </div>
        <div className="text-right text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
          <div>공격 <b className="text-neutral-900 dark:text-white">{signed(score.off)}</b></div>
          <div>수비 <b className="text-neutral-900 dark:text-white">{signed(score.def)}</b></div>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {[...bySlot, ...extra].map((p, i) => (
          <li
            key={p?.id ?? `empty-${i}`}
            className="flex items-center gap-2.5 rounded-xl bg-neutral-100 px-2.5 py-2 dark:bg-white/[0.04]"
          >
            <span className={`w-10 shrink-0 text-[11px] font-medium ${p && p.slot < 0 ? "text-rose-600 dark:text-rose-400" : "text-neutral-500 dark:text-neutral-400"}`}>
              {i < SLOT_LABELS.length ? SLOT_LABELS[i] : "자리 없음"}
            </span>
            {p ? (
              <>
                <PlayerFace src={p.photo} color={p.color} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-neutral-900 dark:text-white">{p.name}</span>
                  <span className="block truncate text-[11px] text-neutral-500 dark:text-neutral-400">{seasonLabel(mode, p.season)} · {p.teamName}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-neutral-900 dark:text-white">{signed(p.stats!.total)}</span>
              </>
            ) : (
              <span className="text-xs text-neutral-400 dark:text-neutral-600">비어 있음</span>
            )}
          </li>
        ))}
      </ul>

      <dl className="mt-3 grid grid-cols-2 gap-1.5">
        {bonuses.map(([k, v, hint]) => (
          <div key={k} className="rounded-xl bg-neutral-100 px-2.5 py-2 dark:bg-white/[0.04]">
            <dt className="text-[11px] text-neutral-500 dark:text-neutral-400">{k}</dt>
            <dd className={`text-sm font-semibold tabular-nums ${tone(v)}`}>{signed(v)}</dd>
            <dd className="text-[10px] text-neutral-400 dark:text-neutral-500">{hint}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
