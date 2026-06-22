"use client";
// 드림팀 경기 클라이언트 — 봇 선택 → playMatch 액션 → 결과 카드(스코어·예측·중계·레이팅)
import { useActionState } from "react";
import { playMatch, type PlayState } from "./actions";
import type { BotTeam } from "@/lib/dream-team/bots";

interface Props {
  teamName: string;
  myOvr: number;
  rating: number;
  record: { w: number; d: number; l: number };
  points: number;
  bots: BotTeam[];
  ready: boolean;
}

const pct = (n: number) => Math.round(n * 100);

export default function PlayClient({ teamName, myOvr, rating, record, points, bots, ready }: Props) {
  const [state, formAction, pending] = useActionState(playMatch, { ok: false } as PlayState);
  const r = state.result;
  const curRating = r ? r.ratingAfter : rating;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-white/[0.04]">
        <div>
          <div className="text-base font-semibold text-neutral-900 dark:text-white">{teamName}</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">OVR {myOvr} · 레이팅 {curRating}</div>
        </div>
        <div className="text-right text-xs text-neutral-500 dark:text-neutral-400">
          {record.w}승 {record.d}무 {record.l}패 · 자금 €{points}M
        </div>
      </div>

      {!ready && (
        <p className="mt-4 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          11명을 모두 채워야 경기할 수 있습니다.{" "}
          <a href="/dream-team" className="font-medium underline">빌더로 가기</a>
        </p>
      )}

      {state.error && <p className="mt-4 rounded-lg bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{state.error}</p>}

      {r && (
        <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-white/[0.04]">
          <div className="text-center">
            <span className="inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-300">경기 종료</span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex-1 text-center">
              <div className="text-sm font-medium text-neutral-900 dark:text-white">{r.myName}</div>
              <div className="text-xs text-neutral-500">OVR {r.myOvr}</div>
            </div>
            <div className="px-3 text-center">
              <div className="text-3xl font-semibold leading-none text-neutral-900 dark:text-white">
                {r.myScore} <span className="text-neutral-400">-</span> {r.oppScore}
              </div>
              <div className={`mt-2 text-xs font-medium ${r.outcome === "win" ? "text-emerald-600 dark:text-emerald-400" : r.outcome === "loss" ? "text-rose-600 dark:text-rose-400" : "text-neutral-500"}`}>
                {r.outcome === "win" ? "승리" : r.outcome === "loss" ? "패배" : "무승부"}
              </div>
            </div>
            <div className="flex-1 text-center">
              <div className="text-sm font-medium text-neutral-900 dark:text-white">{r.oppName}</div>
              <div className="text-xs text-neutral-500">OVR {r.oppOvr}</div>
            </div>
          </div>

          <p className="mt-4 rounded-lg bg-neutral-50 px-4 py-3 text-sm leading-relaxed text-neutral-700 dark:bg-white/[0.03] dark:text-neutral-200" style={{ fontFamily: "var(--font-serif, Georgia, serif)" }}>
            {r.commentary}
          </p>

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
            출전 선수 <span className="font-medium text-neutral-900 dark:text-white">+{r.xpGain} XP</span> · 누적 자금 <span className="font-medium text-neutral-900 dark:text-white">€{r.pointsAfter}M</span>
          </div>
          {r.promoted && (
            <div className="mt-2 rounded-lg bg-rose-500/10 px-4 py-2.5 text-center text-sm font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-300">
              승급! {r.newTierName} 리그로 올라갔습니다 · 예산 확대
            </div>
          )}
        </div>
      )}

      <h2 className="mb-2 mt-6 text-sm font-medium text-neutral-900 dark:text-white">상대 선택</h2>
      <div className="space-y-2">
        {bots.map((b) => (
          <form key={b.id} action={formAction}>
            <input type="hidden" name="botId" value={b.id} />
            <button
              type="submit"
              disabled={!ready || pending}
              className="flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left transition-colors hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-800 dark:bg-white/[0.04] dark:hover:border-rose-500/40"
            >
              <div>
                <div className="text-sm font-medium text-neutral-900 dark:text-white">{b.name}</div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">팀 OVR {b.avgOvr}</div>
              </div>
              <span className="flex-shrink-0 rounded-full bg-rose-600 px-4 py-1.5 text-xs font-medium text-white">{pending ? "경기 중…" : "경기"}</span>
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
