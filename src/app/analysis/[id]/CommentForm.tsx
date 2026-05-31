"use client";

import { useActionState, useEffect, useRef } from "react";
import { createCommentAction, type PostFormState } from "../actions";

const initial: PostFormState = { ok: true };

export default function CommentForm({ postId }: { postId: number }) {
  const [state, action, pending] = useActionState(createCommentAction, initial);
  const ref = useRef<HTMLFormElement>(null);

  // 등록 성공 시 입력 비우기
  useEffect(() => {
    if (state.ok && !state.error) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="mt-2 space-y-2">
      <input type="hidden" name="postId" value={postId} />
      <textarea
        name="content"
        placeholder="댓글을 남겨보세요"
        required
        maxLength={1000}
        rows={2}
        className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white px-4 py-1.5 text-sm font-semibold transition"
        >
          {pending ? "등록 중…" : "댓글 등록"}
        </button>
      </div>
    </form>
  );
}
