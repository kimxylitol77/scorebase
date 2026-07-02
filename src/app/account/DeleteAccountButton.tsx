"use client";
// 회원 탈퇴 버튼 — 2단계 확인(문구 표시 후 재클릭) 뒤 deleteAccountAction 실행.
// 실패 시 에러를 인라인 표시 (전역 error 페이지가 없어 액션이 throw 하면 raw 500 이 뜨기 때문).

import { useState, useActionState } from "react";
import { deleteAccountAction } from "./actions";

export default function DeleteAccountButton() {
  const [arming, setArming] = useState(false);
  const [state, action, pending] = useActionState(deleteAccountAction, null);

  if (!arming) {
    return (
      <button
        type="button"
        onClick={() => setArming(true)}
        className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline"
      >
        회원 탈퇴
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-900/15 p-4 space-y-3">
      <p className="text-xs leading-relaxed text-rose-700 dark:text-rose-300">
        탈퇴하면 계정과 함께 작성한 <strong>게시글·댓글·예측 기록·드림팀</strong>이
        모두 즉시 삭제되며 복구할 수 없습니다.
      </p>
      {state?.error && (
        <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
          {state.error}
        </p>
      )}
      <form action={action} className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 transition"
        >
          {pending ? "삭제 중..." : "탈퇴하고 모든 데이터 삭제"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setArming(false)}
          className="text-xs text-neutral-500 hover:underline"
        >
          취소
        </button>
      </form>
    </div>
  );
}
