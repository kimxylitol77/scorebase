"use client";
// 드림팀 유저 대전 클라이언트 — 상대 선택 → playUserMatch → 결과 카드
import { useActionState } from "react";
import { playUserMatch } from "./actions";
import type { PlayState } from "../play/actions";
import MatchResultCard from "../MatchResultCard";

interface Opp {
  id: string;
  name: string;
  nickname: string;
  rating: number;
  tier: string;
  ovr: number;
}
interface Props {
  teamName: string;
  myOvr: number;
  rating: number;
  opponents: Opp[];
  ready: boolean;
}

export default function VersusClient({ teamName, myOvr, rating, opponents, ready }: Props) {
  const [state, formAction, pending] = useActionState(playUserMatch, { ok: false } as PlayState);
  const r = state.result;
  const curRating = r ? r.ratingAfter : rating;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-white/[0.04]">
        <div>
          <div className="text-base font-semibold text-neutral-900 dark:text-white">{teamName}</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">OVR {myOvr} · 레이팅 {curRating}</div>
        </div>
      </div>

      {!ready && (
        <p className="mt-4 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          11명을 채워야 도전할 수 있습니다. <a href="/dream-team" className="font-medium underline">빌더로 가기</a>
        </p>
      )}
      {state.error && <p className="mt-4 rounded-lg bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{state.error}</p>}
      {r && <MatchResultCard r={r} />}

      <h2 className="mb-2 mt-6 text-sm font-medium text-neutral-900 dark:text-white">도전 상대</h2>
      {opponents.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:bg-white/[0.04]">
          아직 도전할 상대가 없습니다.{" "}
          <a href="/dream-team/play" className="font-medium text-rose-600 underline dark:text-rose-400">봇과 경기</a>하며 기다려보세요.
        </p>
      ) : (
        <div className="space-y-2">
          {opponents.map((o) => (
            <form key={o.id} action={formAction}>
              <input type="hidden" name="opponentId" value={o.id} />
              <button
                type="submit"
                disabled={!ready || pending}
                className="flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left transition-colors hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-800 dark:bg-white/[0.04] dark:hover:border-rose-500/40"
              >
                <div>
                  <div className="text-sm font-medium text-neutral-900 dark:text-white">{o.name}</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">{o.nickname} · {o.tier} · 레이팅 {o.rating}</div>
                </div>
                <span className="flex-shrink-0 rounded-full bg-rose-600 px-4 py-1.5 text-xs font-medium text-white">{pending ? "경기 중…" : `OVR ${o.ovr} 도전`}</span>
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
