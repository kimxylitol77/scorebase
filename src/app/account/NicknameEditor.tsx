"use client";

import { useState } from "react";
import { setNicknameAction } from "./actions";

// 닉네임 인라인 편집 — "변경" 클릭 시 입력창. 저장은 server action(revalidate).
export default function NicknameEditor({ current }: { current: string }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
      >
        닉네임 변경
      </button>
    );
  }

  return (
    <form
      action={setNicknameAction}
      onSubmit={() => setEditing(false)}
      className="flex items-center justify-center gap-1.5"
    >
      <input
        name="nickname"
        defaultValue={current}
        required
        minLength={1}
        maxLength={20}
        autoFocus
        className="w-32 rounded-lg border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="submit"
        className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700"
      >
        저장
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-xs text-neutral-400 hover:text-neutral-600"
      >
        취소
      </button>
    </form>
  );
}
