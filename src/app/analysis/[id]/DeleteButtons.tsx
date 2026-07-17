"use client";

import { deletePostAction, deleteCommentAction, deletePostAdminAction } from "../actions";

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

/** 관리자 전용 — 남의 글도 삭제. 스타일은 관리자 "수정" 링크와 통일. */
export function AdminDeletePostButton({ postId }: { postId: number }) {
  return (
    <form
      action={deletePostAdminAction}
      onSubmit={(e) => {
        if (
          !confirm(
            "관리자 권한으로 이 글을 삭제할까요?\n작성자 경험치도 회수되며 복구할 수 없습니다.",
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="postId" value={postId} />
      <button type="submit" className="font-semibold text-rose-500 hover:underline">
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
