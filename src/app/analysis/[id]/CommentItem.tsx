// 댓글 한 줄 — 본인 댓글이면 인라인 수정 토글(수정·삭제), 남의 댓글은 읽기 전용.
"use client";

import { useActionState, useEffect, useState } from "react";
import { updateCommentAction, type PostFormState } from "../actions";
import { displayGrade } from "@/lib/user-level";
import { listTime } from "@/lib/analysis/format";
import UserName from "@/components/UserName";
import { DeleteCommentButton } from "./DeleteButtons";

const initial: PostFormState = { ok: true };

interface Props {
  id: number;
  content: string;
  createdAt: Date;
  author: {
    nickname: string;
    level: number;
    badge: string | null;
    nameColor: string | null;
    title: string | null;
  };
  isMine: boolean;
}

export default function CommentItem({ id, content, createdAt, author, isMine }: Props) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(updateCommentAction, initial);
  const g = displayGrade(author.level, author.badge);

  // 저장 성공하면 편집창 닫기 (실패면 에러를 띄운 채 열어둔다)
  useEffect(() => {
    if (state.ok && !state.error) setEditing(false);
  }, [state]);

  return (
    <li className="text-sm">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold text-neutral-700 dark:text-neutral-300" title={g.name}>
          {g.emoji} <UserName name={author.nickname} nameColor={author.nameColor} title={author.title} />
        </span>
        <span className="text-xs text-neutral-400">{listTime(createdAt)}</span>
        {isMine && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-neutral-400 transition hover:text-rose-500"
          >
            수정
          </button>
        )}
        {isMine && <DeleteCommentButton commentId={id} />}
      </div>

      {editing ? (
        <form action={action} className="space-y-2">
          <input type="hidden" name="commentId" value={id} />
          <textarea
            name="content"
            defaultValue={content}
            required
            maxLength={1000}
            rows={2}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40"
          />
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-sm text-neutral-500 hover:underline"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white px-4 py-1.5 text-sm font-semibold transition"
            >
              {pending ? "저장 중…" : "저장"}
            </button>
          </div>
        </form>
      ) : (
        <p className="whitespace-pre-wrap text-neutral-700 dark:text-neutral-300 leading-relaxed">
          {content}
        </p>
      )}
    </li>
  );
}
