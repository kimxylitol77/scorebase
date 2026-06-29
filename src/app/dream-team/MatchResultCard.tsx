"use client";
// 드림팀 경기 결과 카드 — 라이브 중계(분 단위 이벤트 순차)→종료 후 결과·예측·레이팅·육성·승급
import { useState, useEffect } from "react";
import type { PlayResult } from "./play/actions";
import { MENTALITIES } from "@/lib/dream-team/tactics";

const pct = (n: number) => Math.round(n * 100);

export default function MatchResultCard({ r }: { r: PlayResult }) {
  const events = r.events ?? [];
  const [n, setN] = useState(0);
  const [live, setLive] = useState(events.length > 0);
  useEffect(() => {
    if (!live) return;
    if (n >= events.length) {
      const t = setTimeout(() => setLive(false), 900);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setN((v) => v + 1), 650);
    return () => clearTimeout(t);
  }, [n, events.length, live]);

  const shown = events.slice(0, n);
  const myGoals = live ? shown.filter((e) => e.team === "my" && e.type === "goal").length : r.myScore;
  const opGoals = live ? shown.filter((e) => e.team === "opp" && e.type === "goal").length : r.oppScore;
  const clock = !live ? 90 : n >= events.length ? 90 : shown.length ? shown[shown.length - 1].minute : 0;
  const recent = [...shown].reverse().slice(0, 4);

  return (
    <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-white/[0.04]">
      <div className="text-center">
        {live ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-3 py-1 text-xs font-medium text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            {`LIVE ${clock}'`}
          </span>
        ) : (
          <span className="inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-300">경기 종료</span>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex-1 text-center">
          <div className="text-sm font-medium text-neutral-900 dark:text-white">{r.myName}</div>
          <div className="text-xs text-neutral-500">OVR {r.myOvr}</div>
          <div className="text-[11px] text-neutral-400">{MENTALITIES[r.myMentality]?.name ?? "균형"} 전술</div>
        </div>
        <div className="px-3 text-center">
          <div className="text-3xl font-semibold leading-none text-neutral-900 dark:text-white">
            {myGoals} <span className="text-neutral-400">-</span> {opGoals}
          </div>
          {!live && (
            <div className={`mt-2 text-xs font-medium ${r.outcome === "win" ? "text-emerald-600 dark:text-emerald-400" : r.outcome === "loss" ? "text-rose-600 dark:text-rose-400" : "text-neutral-500"}`}>
              {r.outcome === "win" ? "승리" : r.outcome === "loss" ? "패배" : "무승부"}
            </div>
          )}
        </div>
        <div className="flex-1 text-center">
          <div className="text-sm font-medium text-neutral-900 dark:text-white">{r.oppName}</div>
          <div className="text-xs text-neutral-500">OVR {r.oppOvr}</div>
          <div className="text-[11px] text-neutral-400">{MENTALITIES[r.oppMentality]?.name ?? "균형"} 전술</div>
        </div>
      </div>

      {live ? (
        <div className="mt-4 min-h-[96px] space-y-1.5">
          {recent.length === 0 && <p className="py-7 text-center text-sm text-neutral-400">킥오프!</p>}
          {recent.map((e, i) => {
            const who = e.team === "my" ? r.myName : r.oppName;
            return (
              <div key={`${e.minute}-${i}`} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-opacity ${i === 0 ? "bg-neutral-100 dark:bg-white/[0.06]" : "opacity-50"}`}>
                <span className="w-8 flex-shrink-0 text-xs font-medium text-neutral-400">{`${e.minute}'`}</span>
                {e.type === "goal" ? (
                  <span className="font-semibold text-rose-600 dark:text-rose-400">{who} 득점!</span>
                ) : (
                  <span className="text-neutral-600 dark:text-neutral-300">{who} 위협적인 슈팅</span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <p className="mt-4 rounded-lg bg-neutral-50 px-4 py-3 text-sm leading-relaxed text-neutral-700 dark:bg-white/[0.03] dark:text-neutral-200" style={{ fontFamily: "var(--font-serif, Georgia, serif)" }}>
            {r.commentary}
          </p>
          {r.tacticNote && <p className="mt-2 px-1 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">{r.tacticNote}</p>}

          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
              <span>경기 전 예측</span>
              <span>승 {pct(r.prob.home)} · 무 {pct(r.prob.draw)} · 패 {pct(r.prob.away)}</span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full">
              <div style={{ width: `${pct(r.prob.home)}%`, background: "#be3455" }} />
              <div style={{ width: `${pct(r.prob.draw)}%`, background: "#a3a3a3" }} />
              <div style={{ width: `${pct(r.prob.away)}%`, background: "#185FA5" }} />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-lg border border-neutral-200 px-4 py-2.5 text-sm dark:border-neutral-800">
            <span className="text-neutral-500 dark:text-neutral-400">레이팅 {r.ratingBefore} → {r.ratingAfter}</span>
            <span className="font-medium text-neutral-900 dark:text-white">
              <span className={r.ratingAfter >= r.ratingBefore ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                {r.ratingAfter >= r.ratingBefore ? "+" : ""}
                {r.ratingAfter - r.ratingBefore}
              </span>
              {" · 자금 +€"}
              {r.reward}M
            </span>
          </div>

          <div className="mt-2 rounded-lg bg-neutral-50 px-4 py-2.5 text-sm text-neutral-600 dark:bg-white/[0.03] dark:text-neutral-300">
            출전 선수 <span className="font-medium text-neutral-900 dark:text-white">+{r.xpGain} XP</span> · 누적 자금 <span className="font-medium text-neutral-900 dark:text-white">€{r.fundsAfter}M</span>
          </div>
          {r.promoted && (
            <div className="mt-2 rounded-lg bg-rose-500/10 px-4 py-2.5 text-center text-sm font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-300">
              승급! {r.newTierName} 리그로 올라갔습니다 · 예산 확대
            </div>
          )}
        </>
      )}
    </div>
  );
}
