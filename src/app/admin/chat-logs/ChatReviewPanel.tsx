// /admin/chat-logs 상단 — 최근 자동 점검 결과(7일) + 규칙 제안 승인·거절, 적용 중 규칙 끄기.
import { prisma } from "@/lib/db";
import { decideChatRule } from "./actions";
import type { ChatReviewDetail } from "@/lib/chatbot/review";

const VERDICT_KO: Record<string, string> = { reasked: "되물음", failed: "못 답함", suspect: "단정 의심" };

export default async function ChatReviewPanel() {
  const [reviews, pending, active] = await Promise.all([
    prisma.chatReview.findMany({ orderBy: { day: "desc" }, take: 7 }),
    prisma.chatbotRule.findMany({ where: { status: "PROPOSED" }, orderBy: { createdAt: "desc" } }),
    prisma.chatbotRule.findMany({ where: { status: "ACTIVE" }, orderBy: { decidedAt: "asc" } }),
  ]);
  const latest = reviews[0];
  const detail = latest?.detail as unknown as ChatReviewDetail | undefined;

  return (
    <section className="space-y-4 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4 dark:border-cyan-900 dark:bg-cyan-950/20">
      <div>
        <h2 className="text-lg font-semibold">자동 점검</h2>
        <p className="text-xs text-neutral-500">매일 09:00 전날 대화를 AI 가 채점합니다. 규칙은 승인해야 챗봇에 들어갑니다.</p>
      </div>

      {reviews.length === 0 ? (
        <p className="text-sm text-neutral-500">아직 점검 기록이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-neutral-500">
              <tr><th className="text-left font-medium">날짜</th><th>대화</th><th>답함</th><th>되물음</th><th>못 답함</th><th>단정 의심</th></tr>
            </thead>
            <tbody className="tabular-nums">
              {reviews.map((r) => (
                <tr key={r.id} className="text-center">
                  <td className="text-left">{r.day}</td><td>{r.total}</td><td>{r.answered}</td>
                  <td className={r.reasked ? "font-semibold text-amber-600" : ""}>{r.reasked}</td>
                  <td className={r.failed ? "font-semibold text-rose-600" : ""}>{r.failed}</td>
                  <td className={r.suspect ? "font-semibold text-rose-600" : ""}>{r.suspect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="space-y-2 text-sm">
          {detail.summary && <p className="text-neutral-700 dark:text-neutral-300">{latest.day} · {detail.summary}</p>}
          {detail.demands?.length > 0 && (
            <p className="text-neutral-600 dark:text-neutral-400">반복 수요: {detail.demands.map((d) => `${d.label} ${d.count}회`).join(", ")}</p>
          )}
          {detail.cases?.length > 0 && (
            <details>
              <summary className="cursor-pointer text-neutral-600 dark:text-neutral-400">문제 대화 {detail.cases.length}건 보기</summary>
              <ul className="mt-2 space-y-2">
                {detail.cases.map((c, i) => (
                  <li key={i} className="rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
                    <span className="mr-2 text-xs font-semibold text-rose-600">{VERDICT_KO[c.verdict] ?? c.verdict}</span>
                    <span className="font-medium">{c.question}</span>
                    <p className="mt-1 text-xs text-neutral-500">{c.note}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">규칙 제안 ({pending.length})</h3>
        {pending.length === 0 && <p className="text-sm text-neutral-500">승인 대기 중인 제안이 없습니다.</p>}
        {pending.map((r) => (
          <form key={r.id} action={decideChatRule} className="space-y-2 rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
            <input type="hidden" name="id" value={r.id} />
            <textarea name="text" defaultValue={r.text} maxLength={200} rows={2} className="w-full rounded border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700" />
            <p className="text-xs text-neutral-500">{r.sourceDay} · {r.reason}</p>
            {(r.examples as string[]).length > 0 && (
              <p className="text-xs text-neutral-400">예: {(r.examples as string[]).join(" / ")}</p>
            )}
            <div className="flex gap-2">
              <button name="action" value="approve" className="rounded bg-cyan-600 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-700">승인</button>
              <button name="action" value="reject" className="rounded border border-neutral-300 px-3 py-1 text-xs dark:border-neutral-700">거절</button>
            </div>
          </form>
        ))}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">적용 중 규칙 ({active.length})</h3>
        {active.length === 0 && <p className="text-sm text-neutral-500">아직 없습니다.</p>}
        {active.map((r) => (
          <form key={r.id} action={decideChatRule} className="flex items-start gap-2 text-sm">
            <input type="hidden" name="id" value={r.id} />
            <span className="flex-1">{r.text}</span>
            <button name="action" value="off" className="shrink-0 rounded border border-neutral-300 px-2 py-0.5 text-xs dark:border-neutral-700">끄기</button>
          </form>
        ))}
      </div>
    </section>
  );
}
