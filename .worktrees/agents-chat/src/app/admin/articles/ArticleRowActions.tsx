"use client";

import { useTransition } from "react";
import Link from "next/link";
import {
  deleteArticle,
  publish,
  unpublish,
} from "@/app/admin/actions";

interface Props {
  id: number;
  status: string;
  title: string;
}

export default function ArticleRowActions({ id, status, title }: Props) {
  const [pending, startTransition] = useTransition();

  function buildFD() {
    const fd = new FormData();
    fd.set("id", String(id));
    return fd;
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <Link
        href={`/admin/review/${id}`}
        className="px-2 py-1 rounded text-xs font-medium bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700"
      >
        편집
      </Link>

      {status !== "PUBLISHED" && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(() => publish(buildFD()).catch(() => {}))
          }
          className="px-2 py-1 rounded text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          발행
        </button>
      )}

      {status === "PUBLISHED" && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(() => unpublish(buildFD()).catch(() => {}))
          }
          className="px-2 py-1 rounded text-xs font-medium bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 disabled:opacity-50"
        >
          비공개
        </button>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            !confirm(
              `정말 삭제하시겠습니까?\n\n"${title.slice(0, 50)}"\n\n복구할 수 없습니다.`,
            )
          )
            return;
          startTransition(() => deleteArticle(buildFD()).catch(() => {}));
        }}
        className="px-2 py-1 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
      >
        삭제
      </button>
    </div>
  );
}
