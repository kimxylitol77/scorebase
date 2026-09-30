// /admin/sns-embeds — 인증샷 모음(/community/proof)에 올릴 SNS 글 관리. 주소를 붙여 넣으면 공식 임베드로 노출된다.
import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDateKo } from "@/lib/format";
import { SNS_LABEL, type SnsPlatform } from "@/lib/sns-embed";
import { addSnsEmbed, deleteSnsEmbed, toggleSnsEmbed } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminSnsEmbedsPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const rows = await prisma.snsEmbed.findMany({ orderBy: { createdAt: "desc" } });
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">인증샷 모음</h1>
          <p className="mt-1 text-sm text-neutral-500 break-keep">
            인스타그램·X·Threads 공개 글 주소를 붙여 넣으면 공개 페이지에 임베드로 올라갑니다. 최신 30개까지 보입니다.
          </p>
        </div>
        <Link href="/community/proof" className="shrink-0 text-sm font-semibold text-rose-600 hover:underline dark:text-rose-400">
          공개 페이지 →
        </Link>
      </div>

      <div className="mb-6 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900 break-keep dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
        합법 스포츠토토·프로토 투표권 글만 올리세요. 사설 사이트 홍보 글, 비공개 계정 글, 사진을 내려받아 올리는 것은 안 됩니다. 원문이 지워지면 여기서도 빈 카드가 되니 숨기거나 삭제하세요.
      </div>

      <form action={addSnsEmbed} className="mb-8 flex flex-col gap-2 sm:flex-row">
        <input
          name="url"
          type="url"
          required
          placeholder="https://www.instagram.com/p/… 또는 https://x.com/…/status/…"
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <input
          name="note"
          maxLength={60}
          placeholder="메모 (선택, 카드 아래 표시)"
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm sm:w-60 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button type="submit" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 dark:bg-white dark:text-neutral-900">
          등록
        </button>
      </form>
      {msg && <p className="mb-6 text-sm font-semibold text-rose-600 dark:text-rose-400">{msg}</p>}

      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-neutral-500">등록된 글이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-neutral-50 text-[11px] uppercase tracking-wider text-neutral-500 dark:bg-neutral-900/50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">플랫폼</th>
                <th className="px-4 py-3 text-left font-semibold">주소 · 메모</th>
                <th className="px-4 py-3 text-left font-semibold">등록일</th>
                <th className="px-4 py-3 text-right font-semibold">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {rows.map((r) => (
                <tr key={r.id} className={r.hidden ? "opacity-50" : ""}>
                  <td className="px-4 py-3">{SNS_LABEL[r.platform as SnsPlatform] ?? r.platform}</td>
                  <td className="max-w-[22rem] px-4 py-3">
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="block truncate text-blue-600 hover:underline dark:text-blue-400">
                      {r.url}
                    </a>
                    {r.note && <span className="block truncate text-xs text-neutral-500">{r.note}</span>}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{formatDateKo(r.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <form action={toggleSnsEmbed} className="inline">
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="mr-1.5 rounded-md bg-neutral-100 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300">
                        {r.hidden ? "다시 보이기" : "숨기기"}
                      </button>
                    </form>
                    <form action={deleteSnsEmbed} className="inline">
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="rounded-md bg-rose-100 px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-200 dark:bg-rose-950/40 dark:text-rose-400">
                        삭제
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
