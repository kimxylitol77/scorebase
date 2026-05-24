import NoticeForm from "../NoticeForm";
import { createNotice } from "../actions";

export const dynamic = "force-dynamic";

export default function NewNoticePage() {
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-6">
        <a
          href="/admin/notices"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition"
        >
          ← 목록
        </a>
      </div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">새 공지 작성</h1>
      <NoticeForm action={createNotice} submitLabel="발행" />
    </main>
  );
}
