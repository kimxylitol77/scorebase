"use client";
// 드림팀 봇 경기 클라이언트 — 봇 선택 → playMatch → 결과 카드
import { useActionState } from "react";
import { playMatch, type PlayState } from "./actions";
import type { BotTeam } from "@/lib/dream-team/bots";
import { MENTALITIES } from "@/lib/dream-team/tactics";
import MatchResultCard from "../MatchResultCard";

interface Props {
  teamName: string;
  myOvr: number;
  rating: number;
  record: { w: number; d: number; l: number };
  points: number;
  bots: BotTeam[];
  ready: boolean;
}

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

      {r && <MatchResultCard r={r} />}

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
                <div className="text-xs text-neutral-500 dark:text-neutral-400">팀 OVR {b.avgOvr} · {MENTALITIES[b.mentality]?.name ?? "균형"} 전술</div>
              </div>
              <span className="flex-shrink-0 rounded-full bg-rose-600 px-4 py-1.5 text-xs font-medium text-white">{pending ? "경기 중…" : "경기"}</span>
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
