"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Markdown from "@/components/Markdown";
import { createArticle } from "@/app/admin/actions";

interface MatchOption {
  id: number;
  label: string;
}

interface Props {
  matchOptions: MatchOption[];
}

const TYPES = [
  { value: "PREVIEW", label: "프리뷰 (예정 경기)" },
  { value: "RECAP", label: "리뷰 (종료 경기)" },
  { value: "ANALYSIS", label: "분석 (자유)" },
];

export default function NewArticleForm({ matchOptions }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");

  const [state, formAction, pending] = useActionState(createArticle, {
    ok: false,
  });

  // 액션 결과로 redirect 처리
  if (state.ok && state.redirectTo) {
    if (typeof window !== "undefined") {
      router.push(state.redirectTo);
    }
  }

  return (
    <form action={formAction} className="space-y-5">
      {/* 메타 */}
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="리그" required>
          <select
            name="league"
            required
            defaultValue=""
            className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="" disabled>
              선택...
            </option>
            <option value="EPL">EPL</option>
            <option value="NBA">NBA</option>
            <option value="KBO">KBO</option>
          </select>
        </Field>

        <Field label="타입" required>
          <select
            name="type"
            required
            defaultValue=""
            className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="" disabled>
              선택...
            </option>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="매치 연결 (선택)">
          <select
            name="matchId"
            defaultValue=""
            className="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">없음</option>
            {matchOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* 제목 */}
      <Field label="제목" required>
        <input
          name="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="기사 제목"
          className="w-full px-4 py-3 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </Field>

      {/* 본문 — 편집/미리보기 탭 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">본문 (Markdown) <span className="text-red-500">*</span></label>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setTab("edit")}
              className={`px-2.5 py-1 rounded text-xs font-medium ${
                tab === "edit"
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "bg-neutral-100 dark:bg-neutral-800"
              }`}
            >
              편집
            </button>
            <button
              type="button"
              onClick={() => setTab("preview")}
              className={`px-2.5 py-1 rounded text-xs font-medium ${
                tab === "preview"
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "bg-neutral-100 dark:bg-neutral-800"
              }`}
            >
              미리보기
            </button>
          </div>
        </div>
        {tab === "edit" ? (
          <textarea
            name="content"
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={20}
            placeholder={`# 제목\n\n**리드 문단을 굵게.**\n\n## 소제목\n\n본문...`}
            className="w-full px-4 py-3 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 min-h-[400px]">
            {content ? (
              <Markdown>{content}</Markdown>
            ) : (
              <p className="text-neutral-400 text-sm">본문을 입력하면 미리보기가 표시됩니다.</p>
            )}
          </div>
        )}
      </div>

      {/* 에러 */}
      {state.error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 p-3 text-sm text-red-700 dark:text-red-300">
          ❗ {state.error}
        </div>
      )}

      {/* 버튼 */}
      <div className="flex flex-wrap gap-2 pt-4 border-t border-neutral-200 dark:border-neutral-800">
        <button
          type="submit"
          name="action"
          value="publish"
          disabled={pending}
          className="px-4 py-2 rounded-md bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50"
        >
          ✅ 즉시 발행
        </button>
        <button
          type="submit"
          name="action"
          value="draft"
          disabled={pending}
          className="px-4 py-2 rounded-md bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 disabled:opacity-50"
        >
          💾 초안 저장
        </button>
        <button
          type="button"
          onClick={() => history.back()}
          disabled={pending}
          className="px-4 py-2 rounded-md text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 ml-auto"
        >
          취소
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
