"use client";
// 드림팀 공유 페이지 도전 버튼 — playUserMatch 호출 후 결과 카드 표시
import { useActionState } from "react";
import { playUserMatch } from "../../versus/actions";
import type { PlayState } from "../../play/actions";
import MatchResultCard from "../../MatchResultCard";

export default function ChallengeButton({ opponentId }: { opponentId: string }) {
  const [state, formAction, pending] = useActionState(playUserMatch, { ok: false } as PlayState);
  const r = state.result;

  if (r) return <MatchResultCard r={r} />;
  return (
    <div>
      {state.error && <p className="mb-2 rounded-lg bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{state.error}</p>}
      <form action={formAction}>
        <input type="hidden" name="opponentId" value={opponentId} />
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-rose-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-40"
        >
          {pending ? "경기 중…" : "이 팀에 도전"}
        </button>
      </form>
    </div>
  );
}
