import { FileCheck2, RefreshCw } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { kickoffLabel } from "@/lib/analysis/format";
import { leagueLabel } from "@/lib/analysis/matches";
import { toKoreanTeamName } from "@/lib/team-names";
import { GWAK_DRAFT_CATEGORY } from "@/lib/analysis/gwak-pickster";
import {
  generateGwakDraftsAction,
  publishGwakDraftAction,
  rejectGwakDraftAction,
  saveGwakDraftAction,
} from "./actions";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ generated?: string; candidates?: string; skipped?: string; saved?: string; rejected?: string }>;
}

function fmtLine(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export default async function PickDraftsPage({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const drafts = await prisma.post.findMany({
    where: { category: GWAK_DRAFT_CATEGORY },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { nickname: true } },
      match: {
        select: {
          league: true,
          status: true,
          startTime: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-6 w-6 text-rose-600" aria-hidden="true" />
            <h1 className="text-2xl font-bold">곽씨 픽 검수</h1>
          </div>
          <p className="mt-1 text-sm text-neutral-500">후보 선별과 글 작성까지만 자동화됩니다. 승인 전에는 게시판에 노출되지 않습니다.</p>
        </div>
        <form action={generateGwakDraftsAction}>
          <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            초안 지금 만들기
          </button>
        </form>
      </header>

      {sp.generated != null && (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          후보 {sp.candidates ?? "0"}건 중 초안 {sp.generated}건 생성 · 건너뜀 {sp.skipped ?? "0"}건
        </p>
      )}
      {sp.saved && <p className="rounded-lg bg-blue-500/10 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">초안을 저장했습니다.</p>}
      {sp.rejected && <p className="rounded-lg bg-neutral-500/10 px-4 py-3 text-sm text-neutral-600 dark:text-neutral-300">초안을 제외했습니다. 같은 경기 픽은 다시 생성하지 않습니다.</p>}

      {drafts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 px-6 py-14 text-center dark:border-neutral-700">
          <p className="font-semibold">검수할 초안이 없습니다.</p>
          <p className="mt-1 text-sm text-neutral-500">조건을 통과한 경기가 없으면 생성 결과가 0건인 것이 정상입니다.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {drafts.map((draft) => {
            const match = draft.match;
            const home = match ? toKoreanTeamName(match.homeTeam.name, match.league) : "홈팀";
            const away = match ? toKoreanTeamName(match.awayTeam.name, match.league) : "원정팀";
            const pick = draft.market === "HANDICAP" && draft.line != null
              ? draft.pick === "HOME" ? `${home} ${fmtLine(draft.line)}` : `${away} ${fmtLine(-draft.line)}`
              : draft.pick === "HOME" ? `${home} 승` : draft.pick === "AWAY" ? `${away} 승` : "무승부";
            const expired = !match || match.status !== "SCHEDULED" || match.startTime <= new Date();
            return (
              <form key={draft.id} className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-white/[0.03]">
                <input type="hidden" name="id" value={draft.id} />
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div>
                    <span className="font-bold">{home} vs {away}</span>
                    <span className="ml-2 text-neutral-500">{match ? `${leagueLabel(match.league)} · ${kickoffLabel(match.startTime)}` : "경기 정보 없음"}</span>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${expired ? "bg-rose-500/10 text-rose-600" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>
                    {expired ? "발행 불가" : `${draft.market} · ${pick}`}
                  </span>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-neutral-500">제목</label>
                  <input name="title" defaultValue={draft.title} required minLength={2} maxLength={120} className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-rose-400 dark:border-neutral-700" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-neutral-500">본문</label>
                  <textarea name="content" defaultValue={draft.content} required minLength={20} rows={8} className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm leading-7 outline-none focus:border-rose-400 dark:border-neutral-700" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button formAction={saveGwakDraftAction} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">수정 저장</button>
                  <button formAction={publishGwakDraftAction} disabled={expired} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-40">검수 완료 · 발행</button>
                  <button formAction={rejectGwakDraftAction} className="rounded-lg px-4 py-2 text-sm font-semibold text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">제외</button>
                </div>
              </form>
            );
          })}
        </div>
      )}
    </main>
  );
}
