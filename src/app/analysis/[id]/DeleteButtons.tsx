"use client";

import { deletePostAction, deleteCommentAction } from "../actions";

const btnCls =
  "text-xs text-neutral-400 hover:text-red-500 transition";

export function DeletePostButton({ postId }: { postId: number }) {
  return (
    <form
      action={deletePostAction}
      onSubmit={(e) => {
        if (!confirm("이 글을 삭제할까요? 작성 경험치도 회수됩니다.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="postId" value={postId} />
      <button type="submit" className={btnCls}>
        삭제
      </button>
    </form>
  );
}

export function DeleteCommentButton({ commentId }: { commentId: number }) {
  return (
    <form
      action={deleteCommentAction}
      onSubmit={(e) => {
        if (!confirm("댓글을 삭제할까요?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="commentId" value={commentId} />
      <button type="submit" className={btnCls}>
        삭제
      </button>
    </form>
  );
}
