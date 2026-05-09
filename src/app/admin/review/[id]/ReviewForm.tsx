"use client";

import { useState, useTransition } from "react";
import Markdown from "@/components/Markdown";
import {
  approveAndPublish,
  reject,
  saveDraft,
  deleteArticle,
} from "@/app/admin/actions";

interface Props {
  article: {
    id: number;
    title: string;
    content: string;
    league: string;
    type: string;
  };
}

export default function ReviewForm({ article }: Props) {
  const [title, setTitle] = useState(article.title);
  const [content, setContent] = useState(article.content);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [pending, startTransition] = useTransition();

  function buildFormData() {
    const fd = new FormData();
    fd.set("id", String(article.id));
    fd.set("title", title);
    fd.set("content", content);
    return fd;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setTab("edit")}
            className={`px-3 py-1.5 rounded-md ${
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
            className={`px-3 py-1.5 rounded-md ${
              tab === "preview"
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "bg-neutral-100 dark:bg-neutral-800"
            }`}
          >
            미리보기
          </button>
        </div>
        <div className="text-xs text-neutral-500">
          {article.league} · {article.type}
        </div>
      </div>

      {tab === "edit" ? (
        <div className="space-y-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="제목"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={24}
            className="w-full px-4 py-3 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="본문 (Markdown)"
          />
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-6">
          <h1 className="text-3xl font-bold mb-6">{title}</h1>
          <Markdown>{content}</Markdown>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-4 border-t border-neutral-200 dark:border-neutral-800">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(() =>
              approveAndPublish(buildFormData()).catch(() => {}),
            )
          }
          className="px-4 py-2 rounded-md bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          ✅ 승인 후 발행
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await saveDraft(buildFormData()).catch(() => {});
              alert("초안 저장 완료");
            })
          }
          className="px-4 py-2 rounded-md bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 disabled:opacity-50"
        >
          💾 초안 저장
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("이 글을 거절합니까? (삭제 아님 — 상태만 REJECTED)")) return;
            startTransition(() => reject(buildFormData()).catch(() => {}));
          }}
          className="px-4 py-2 rounded-md bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700 disabled:opacity-50 ml-auto"
        >
          ✕ 거절
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (
              !confirm(
                "정말 영구 삭제하시겠습니까?\n복구할 수 없습니다.",
              )
            )
              return;
            const fd = buildFormData();
            fd.set("from", "review");
            startTransition(() => deleteArticle(fd).catch(() => {}));
          }}
          className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
        >
          🗑 영구 삭제
        </button>
      </div>
    </div>
  );
}
