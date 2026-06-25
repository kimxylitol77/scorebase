"use client";
// 드림팀 시즌 리그 클라이언트 — 순위표 + 남은 일정 경기 + 시즌 정산
import { useActionState } from "react";
import { playMatch, endSeason, type PlayState, type SeasonState } from "./actions";
import { MENTALITIES } from "@/lib/dream-team/tactics";
import type { StandRow } from "@/lib/dream-team/season";
import MatchResultCard from "../MatchResultCard";
import StandingsTable from "../StandingsTable";
import SeasonEndCard from "../SeasonEndCard";

interface Fixture {
  botId: string;
  home: boolean;
  name: string;
  avgOvr: number;
  mentality: string;
}

interface Props {
  teamName: string;
  myOvr: number;
  rating: number;
  record: { w: number; d: number; l: number };
  points: number;
  ready: boolean;
  seasonNo: number;
  standings: StandRow[];
  remaining: Fixture[];
  played: number;
  total: number;
  seasonComplete: boolean;
}

export default function PlayClient({ teamName, myOvr, rating, record, points, ready, seasonNo, standings, remaining, played, total, seasonComplete }: Props) {
  const [state, formAction, pending] = useActionState(playMatch, { ok: false } as PlayState);
  const [seasonState, seasonFormAction, seasonPending] = useActionState(endSeason, { ok: false } as SeasonState);
  const r = state.result;
  const sr = seasonState.result;
  const curRating = r ? r.ratingAfter : rating;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-white/[0.04]">
        <div>
          <div className="text-base font-semibold text-neutral-900 dark:text-white">{teamName}</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">OVR {myOvr} · 레이팅 {curRating}</div>
        </div>
        <div className="text-right text-xs text-neutral-500 dark:text-neutral-400">
          <div className="font-medium text-neutral-700 dark:text-neutral-200">시즌 {seasonNo} · {played}/{total}경기</div>
          <div>{record.w}승 {record.d}무 {record.l}패 · 자금 €{points}M</div>
        </div>
      </div>

      {!ready && (
        <p className="mt-4 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          11명을 모두 채워야 경기할 수 있습니다.{" "}
          <a href="/dream-team" className="font-medium underline">빌더로 가기</a>
        </p>
      )}

      {state.error && <p className="mt-4 rounded-lg bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{state.error}</p>}
      {seasonState.error && <p className="mt-4 rounded-lg bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{seasonState.error}</p>}

      {sr ? <SeasonEndCard r={sr} /> : r && <MatchResultCard r={r} />}

      <h2 className="mb-2 mt-6 text-sm font-medium text-neutral-900 dark:text-white">시즌 {seasonNo} 순위</h2>
      <StandingsTable rows={standings} />

      {seasonComplete ? (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center dark:border-rose-500/30 dark:bg-rose-500/[0.06]">
          <div className="text-sm font-medium text-neutral-900 dark:text-white">시즌 일정 {total}경기를 모두 치렀습니다.</div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">정산하면 최종 순위 보너스를 받고 다음 시즌이 시작됩니다.</p>
          <form action={seasonFormAction} className="mt-3">
            <button
              type="submit"
              disabled={seasonPending}
              className="rounded-full bg-rose-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {seasonPending ? "정산 중…" : "시즌 정산하고 다음 시즌으로"}
            </button>
          </form>
        </div>
      ) : (
        <>
          <h2 className="mb-2 mt-6 text-sm font-medium text-neutral-900 dark:text-white">남은 경기 ({remaining.length})</h2>
          <div className="space-y-2">
            {remaining.map((m) => (
              <form key={`${m.botId}:${m.home}`} action={formAction}>
                <input type="hidden" name="botId" value={m.botId} />
                <input type="hidden" name="home" value={String(m.home)} />
                <button
                  type="submit"
                  disabled={!ready || pending}
                  className="flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left transition-colors hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-800 dark:bg-white/[0.04] dark:hover:border-rose-500/40"
                >
                  <div>
                    <div className="text-sm font-medium text-neutral-900 dark:text-white">
                      {m.name} <span className="ml-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-normal text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">{m.home ? "홈" : "원정"}</span>
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">팀 OVR {m.avgOvr} · {MENTALITIES[m.mentality]?.name ?? "균형"} 전술</div>
                  </div>
                  <span className="flex-shrink-0 rounded-full bg-rose-600 px-4 py-1.5 text-xs font-medium text-white">{pending ? "경기 중…" : "경기"}</span>
                </button>
              </form>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
