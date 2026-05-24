import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import NoticeForm from "../NoticeForm";
import { updateNotice } from "../actions";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditNoticePage({ params }: Props) {
  const { id } = await params;
  const n = await prisma.notice.findUnique({ where: { id: Number(id) } });
  if (!n) notFound();

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
      <h1 className="text-2xl font-bold tracking-tight mb-2">공지 편집</h1>
      <p className="text-sm text-neutral-500 mb-6">
        URL: <span className="font-mono">/notices/{n.slug}</span>
      </p>
      <NoticeForm
        action={updateNotice}
        submitLabel="저장"
        initial={{
          id: n.id,
          type: n.type,
          title: n.title,
          slug: n.slug,
          content: n.content,
          publishedAt: n.publishedAt.toISOString(),
        }}
      />
    </main>
  );
}
