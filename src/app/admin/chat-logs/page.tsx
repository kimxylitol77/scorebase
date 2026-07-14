// 챗봇 대화 로그 뷰어 — ChatLog 테이블 read 전용(과금 0). 요약·인기질문·최근 대화 목록.
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function fmt(d: Date) {
  return new Date(d).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ChatLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [total, recent24h, topQuestions, logs] = await Promise.all([
    prisma.chatLog.count(),
    prisma.chatLog.count({ where: { createdAt: { gte: since24h } } }),
    prisma.chatLog.groupBy({
      by: ["question"],
      _count: { _all: true },
      orderBy: { _count: { question: "desc" } },
      take: 20,
    }),
    prisma.chatLog.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">챗봇 대화 로그</h1>
        <p className="mt-1 text-sm text-neutral-500">
          전체 {total.toLocaleString()}건 · 최근 24시간 {recent24h.toLocaleString()}건
        </p>
      </header>

      <section>
        <h2 className="text-lg font-semibold mb-3">인기 질문 Top 20</h2>
        {topQuestions.length === 0 ? (
          <p className="text-sm text-neutral-500">아직 대화가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
            {topQuestions.map((q, i) => (
              <li
                key={i}
                className="flex items-center gap-3 p-3 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
              >
                <span className="w-6 text-right text-xs font-semibold text-neutral-400">
                  {i + 1}
                </span>
                <span className="flex-1 truncate">{q.question}</span>
                <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-400 whitespace-nowrap">
                  {q._count._all.toLocaleString()}회
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">
            최근 대화 ({page}/{totalPages})
          </h2>
        </div>
        {logs.length === 0 ? (
          <p className="text-sm text-neutral-500">대화가 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {logs.map((log) => (
              <li
                key={log.id}
                className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4"
              >
                <div className="flex items-center gap-2 text-xs text-neutral-500 mb-2">
                  <span>{fmt(log.createdAt)}</span>
                  {log.ip && (
                    <span className="font-mono text-neutral-400">{log.ip}</span>
                  )}
                </div>
                <p className="font-medium text-sm mb-2">Q. {log.question}</p>
                <details className="text-sm text-neutral-700 dark:text-neutral-300">
                  <summary className="cursor-pointer text-neutral-500 hover:text-neutral-900 dark:hover:text-white text-xs">
                    답변 보기
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap">{log.answer}</p>
                </details>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-center gap-3 mt-6 text-sm">
          {page > 1 ? (
            <a
              href={`/admin/chat-logs?page=${page - 1}`}
              className="px-3 py-1.5 rounded-md bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
            >
              ← 이전
            </a>
          ) : (
            <span className="px-3 py-1.5 rounded-md text-neutral-300 dark:text-neutral-700">
              ← 이전
            </span>
          )}
          <span className="text-neutral-500">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <a
              href={`/admin/chat-logs?page=${page + 1}`}
              className="px-3 py-1.5 rounded-md bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
            >
              다음 →
            </a>
          ) : (
            <span className="px-3 py-1.5 rounded-md text-neutral-300 dark:text-neutral-700">
              다음 →
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
