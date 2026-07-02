"use client";

import { useActionState } from "react";
import { signupUserAction } from "../actions";

const INPUT =
  "w-full px-3 py-2.5 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const LABEL =
  "block text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1.5";

export default function SignupForm({ from }: { from: string }) {
  const [state, action, pending] = useActionState(signupUserAction, {
    ok: false,
  });

  return (
    <form
      action={action}
      className="space-y-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6"
    >
      <input type="hidden" name="from" value={from} />

      <div>
        <label className={LABEL}>이메일</label>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          autoFocus
          className={INPUT}
        />
      </div>

      <div>
        <label className={LABEL}>닉네임</label>
        <input
          type="text"
          name="nickname"
          required
          maxLength={20}
          autoComplete="nickname"
          className={INPUT}
        />
      </div>

      <div>
        <label className={LABEL}>
          비밀번호{" "}
          <span className="font-normal text-neutral-400">(8자 이상)</span>
        </label>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={INPUT}
        />
      </div>

      <div className="space-y-2 pt-1">
        <label className="flex items-start gap-2 text-xs text-neutral-600 dark:text-neutral-400">
          <input type="checkbox" name="agreeTerms" required className="mt-0.5" />
          <span>
            <a href="/terms" target="_blank" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">이용약관</a>에
            동의합니다. (필수)
          </span>
        </label>
        <label className="flex items-start gap-2 text-xs text-neutral-600 dark:text-neutral-400">
          <input type="checkbox" name="agreePrivacy" required className="mt-0.5" />
          <span>
            <a href="/privacy" target="_blank" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">개인정보처리방침</a>에
            따른 개인정보 수집·이용에 동의합니다. (필수)
          </span>
        </label>
      </div>

      {state.error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 p-2.5 text-xs text-red-700 dark:text-red-300">
          ❗ {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-2.5 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-semibold hover:opacity-90 disabled:opacity-50 transition"
      >
        {pending ? "가입 중..." : "회원가입"}
      </button>
    </form>
  );
}
