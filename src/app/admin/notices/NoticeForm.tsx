"use client";

import { useState } from "react";
import Link from "next/link";

interface Props {
  action: (formData: FormData) => Promise<void>;
  initial?: {
    id?: number;
    type: string;
    title: string;
    slug: string;
    content: string;
    publishedAt: string; // ISO string
  };
  submitLabel: string;
}

const TYPES = [
  { v: "CHANGELOG", label: "패치노트" },
  { v: "NOTICE", label: "공지" },
  { v: "MAINTENANCE", label: "점검 안내" },
];

export default function NoticeForm({ action, initial, submitLabel }: Props) {
  const [content, setContent] = useState(initial?.content ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  return (
    <form action={action} className="space-y-5 max-w-3xl">
      {initial?.id && (
        <input type="hidden" name="id" value={initial.id} />
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
            타입
          </label>
          <select
            name="type"
            defaultValue={initial?.type ?? "CHANGELOG"}
            className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
          >
            {TYPES.map((t) => (
              <option key={t.v} value={t.v}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
            발행일 (선택, 미입력 시 현재 시각)
          </label>
          <input
            type="datetime-local"
            name="publishedAt"
            defaultValue={
              initial?.publishedAt
                ? initial.publishedAt.slice(0, 16)
                : ""
            }
            className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
          제목 *
        </label>
        <input
          type="text"
          name="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: AI Strong Pick 추가"
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
          slug (선택, 미입력 시 자동 생성)
        </label>
        <input
          type="text"
          name="slug"
          defaultValue={initial?.slug ?? ""}
          placeholder="예: 2026-05-11-strong-pick"
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-mono"
        />
        <p className="mt-1 text-[11px] text-neutral-500">
          URL: /notices/<span className="font-mono">[slug]</span>. 변경 시 기존
          링크 깨짐 주의.
        </p>
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
          본문 (Markdown) *
        </label>
        <textarea
          name="content"
          required
          rows={20}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={`## 새 기능\n\n- 첫째 변화\n- 둘째 변화\n\n자세한 설명은 /predictions/accuracy 참고.`}
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-mono leading-relaxed"
        />
        <p className="mt-1 text-[11px] text-neutral-500">
          GFM Markdown 지원 — 헤딩(##) · 리스트(-) · 강조(**) · 링크([텍스트](url)) · 코드(```)
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          className="px-5 py-2.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-semibold hover:opacity-90 transition"
        >
          {submitLabel}
        </button>
        <Link
          href="/admin/notices"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition"
        >
          취소
        </Link>
      </div>
    </form>
  );
}
