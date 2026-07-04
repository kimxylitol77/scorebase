"use client";
// 자유글 작성 폼 — createPostAction(category=FREE) + 첨부(드림팀 체크 / 전술판 공유 링크)
import { useActionState } from "react";
import Link from "next/link";
import { createPostAction, type PostFormState } from "@/app/analysis/actions";

const initialState: PostFormState = { ok: false };

export default function BoardForm({ myTeam }: { myTeam: { name: string; tierName: string } | null }) {
  const [state, formAction, pending] = useActionState(createPostAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="category" value="FREE" />

      <div>
        <span className="mb-1.5 block text-sm font-semibold">말머리</span>
        <div className="flex gap-1.5">
          {[
            { v: "", label: "잡담" },
            { v: "soccer", label: "축구" },
            { v: "baseball", label: "야구" },
          ].map((t, i) => (
            <label key={t.v} className="flex-1 cursor-pointer">
              <input type="radio" name="tag" value={t.v} defaultChecked={i === 0} className="peer sr-only" />
              <span className="block rounded-xl border border-neutral-200 bg-white py-2 text-center text-sm font-medium text-neutral-600 peer-checked:border-rose-500 peer-checked:bg-rose-500/10 peer-checked:font-bold peer-checked:text-rose-600 dark:border-neutral-700 dark:bg-white/[0.04] dark:text-neutral-300 dark:peer-checked:text-rose-300">
                {t.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="title" className="mb-1.5 block text-sm font-semibold">제목</label>
        <input
          id="title"
          name="title"
          required
          minLength={2}
          maxLength={120}
          placeholder="제목을 입력해주세요"
          className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-rose-400 dark:border-neutral-700 dark:bg-white/[0.04]"
        />
      </div>

      <div>
        <label htmlFor="content" className="mb-1.5 block text-sm font-semibold">내용</label>
        <textarea
          id="content"
          name="content"
          required
          minLength={5}
          rows={10}
          placeholder="자유롭게 이야기해주세요. 마크다운을 지원합니다."
          className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm leading-relaxed outline-none focus:border-rose-400 dark:border-neutral-700 dark:bg-white/[0.04]"
        />
      </div>

      {/* 첨부 */}
      <fieldset className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-700">
        <legend className="px-1.5 text-xs font-bold text-neutral-500">첨부 (선택)</legend>

        {myTeam ? (
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input type="checkbox" name="attachDreamTeam" className="h-4 w-4 accent-rose-600" />
            <span>
              내 드림팀 자랑하기 — <span className="font-semibold">{myTeam.name}</span>
              <span className="ml-1 text-xs text-neutral-500">({myTeam.tierName})</span>
            </span>
          </label>
        ) : (
          <p className="text-xs text-neutral-500">
            드림팀이 아직 없어요.{" "}
            <Link href="/dream-team" className="text-rose-600 underline dark:text-rose-400" target="_blank">
              빌더에서 팀을 만들면
            </Link>{" "}
            글에 첨부할 수 있습니다.
          </p>
        )}

        <div className="mt-3">
          <label htmlFor="lineupUrl" className="mb-1 block text-xs font-semibold text-neutral-600 dark:text-neutral-300">
            전술판 공유 링크
          </label>
          <input
            id="lineupUrl"
            name="lineupUrl"
            placeholder="https://www.scorebase.kr/lineup?d=..."
            className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm outline-none focus:border-rose-400 dark:border-neutral-700 dark:bg-white/[0.04]"
          />
          <p className="mt-1 text-[11px] text-neutral-400">
            <Link href="/lineup" className="underline" target="_blank">전술판</Link>
            에서 포메이션을 짠 뒤 공유 버튼으로 복사한 링크를 붙여넣으면 글에 이미지로 첨부됩니다.
          </p>
        </div>
      </fieldset>

      {state.error && <p className="text-sm font-medium text-rose-500">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-rose-600 py-3 text-sm font-bold text-white transition-colors hover:bg-rose-500 disabled:opacity-60"
      >
        {pending ? "발행 중…" : "발행하기"}
      </button>
    </form>
  );
}
