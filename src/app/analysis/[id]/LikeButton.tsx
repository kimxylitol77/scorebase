"use client";

import { likePostAction } from "../actions";

export default function LikeButton({
  postId,
  likes,
  disabled,
}: {
  postId: number;
  likes: number;
  disabled: boolean;
}) {
  return (
    <form action={likePostAction}>
      <input type="hidden" name="postId" value={postId} />
      <button
        type="submit"
        disabled={disabled}
        title={disabled ? "로그인한 회원만 추천할 수 있어요 (본인 글 제외)" : "추천하기"}
        className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 px-5 py-2 text-sm font-bold hover:bg-rose-100 dark:hover:bg-rose-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        👍 추천 {likes}
      </button>
    </form>
  );
}
