"use client";

import { useState } from "react";

interface Props {
  action: (formData: FormData) => Promise<void>;
  initial?: {
    id?: number;
    title: string;
    slug: string;
    excerpt: string | null;
    content: string;
    tags: string | null;
    thumbnailUrl: string | null;
    publishedAt: string; // ISO
  };
  submitLabel: string;
}

export default function BlogForm({ action, initial, submitLabel }: Props) {
  const [content, setContent] = useState(initial?.content ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  return (
    <form action={action} className="space-y-5 max-w-3xl">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}

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
          placeholder="예: KBO 5월 타격 트렌드 분석"
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
            slug (선택, 미입력 시 자동)
          </label>
          <input
            type="text"
            name="slug"
            defaultValue={initial?.slug ?? ""}
            placeholder="예: 2026-05-23-kbo-batting-trends"
            className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-mono"
          />
          <p className="mt-1 text-[11px] text-neutral-500">
            URL: /blog/<span className="font-mono">[slug]</span>
          </p>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
            발행일 (선택)
          </label>
          <input
            type="datetime-local"
            name="publishedAt"
            defaultValue={initial?.publishedAt ? initial.publishedAt.slice(0, 16) : ""}
            className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
          한 줄 요약 / 메타 설명 (SEO)
        </label>
        <input
          type="text"
          name="excerpt"
          defaultValue={initial?.excerpt ?? ""}
          maxLength={200}
          placeholder="검색 결과 / 목록에 노출. 1-2 문장."
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
            태그 / 키워드 (쉼표 구분, SEO)
          </label>
          <input
            type="text"
            name="tags"
            defaultValue={initial?.tags ?? ""}
            placeholder="예: KBO, 타격, 분석, OPS"
            className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
            썸네일 / OG 이미지 URL
          </label>
          <input
            type="url"
            name="thumbnailUrl"
            defaultValue={initial?.thumbnailUrl ?? ""}
            placeholder="https://..."
            className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
          본문 (Markdown) *
        </label>
        <textarea
          name="content"
          required
          rows={24}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={`## 도입\n\n첫 문단...\n\n## 본론\n\n- 핵심 1\n- 핵심 2\n\n## 결론`}
          className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm font-mono leading-relaxed"
        />
        <p className="mt-1 text-[11px] text-neutral-500">
          GFM Markdown — 헤딩(##) · 리스트(-) · 강조(**) · 링크 · 표 · 코드(```)
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          className="px-5 py-2.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-semibold hover:opacity-90 transition"
        >
          {submitLabel}
        </button>
        <a
          href="/admin/blog"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition"
        >
          취소
        </a>
      </div>
    </form>
  );
}
