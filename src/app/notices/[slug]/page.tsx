// 공지/패치노트 상세 — 단일 공지 본문.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDateKo } from "@/lib/format";
import Markdown from "@/components/Markdown";

export const revalidate = 600;

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

const TYPE_LABEL: Record<string, { label: string; tone: string }> = {
  CHANGELOG: {
    label: "패치노트",
    tone: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  },
  NOTICE: {
    label: "공지",
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  MAINTENANCE: {
    label: "점검",
    tone: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  },
};

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const n = await prisma.notice.findUnique({ where: { slug } });
  if (!n) return { title: "공지사항" };
  return {
    title: n.title,
    description: n.content.slice(0, 140).replace(/\n/g, " "),
    alternates: { canonical: `${SITE_URL}/notices/${slug}` },
  };
}

export default async function NoticeDetailPage({ params }: Props) {
  const { slug } = await params;
  const n = await prisma.notice.findUnique({ where: { slug } });
  if (!n) notFound();
  const t = TYPE_LABEL[n.type] ?? TYPE_LABEL.NOTICE;

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-6">
        <Link
          href="/notices"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition"
        >
          ← 공지사항 목록
        </Link>
      </div>

      <header className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${t.tone}`}
          >
            {t.label}
          </span>
          <span className="text-xs text-neutral-500">
            {formatDateKo(n.publishedAt)}
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          {n.title}
        </h1>
      </header>

      <Markdown>{n.content}</Markdown>
    </main>
  );
}
