// 드래프트 리더보드 — 회원만 등재, 회원당 최고 기록 1건. 오늘·역대 두 표를 나란히.
import Link from "next/link";
import Rings from "./Rings";
import { seasonLabel, signed } from "@/lib/draft/labels";
import type { LeaderRow } from "@/lib/draft/service";
import type { DraftMode } from "@/lib/draft/types";

function Table({ title, rows, mode }: { title: string; rows: LeaderRow[]; mode: DraftMode }) {
  return (
    <section className="rounded-[1.75rem] bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:shadow-none dark:ring-white/10">
      <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">아직 기록이 없습니다. 첫 자리를 차지해 보세요.</p>
      ) : (
        <ol className="mt-2 divide-y divide-neutral-100 dark:divide-white/5">
          {rows.map((r, i) => (
            <li key={r.id}>
              <Link href={`/basketball/draft/result/${r.id}`} className="flex items-center gap-3 py-2.5 transition hover:opacity-80">
                <span className="w-5 shrink-0 text-center text-sm font-semibold tabular-nums text-neutral-400">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-neutral-900 dark:text-white">{r.nickname}</span>
                    <Rings count={r.rings} size={12} />
                  </span>
                  <span className="block truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                    {r.snapshot.picks.map((p) => `${p.name} ${seasonLabel(mode, p.season)}`).join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold tabular-nums text-neutral-900 dark:text-white">{signed(r.total)}</span>
                  <span className="block text-[10px] text-neutral-400">{r.runs}판</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function Leaderboard({ mode, today, all }: { mode: DraftMode; today: LeaderRow[]; all: LeaderRow[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Table title="오늘의 순위" rows={today} mode={mode} />
      <Table title="역대 순위" rows={all} mode={mode} />
    </div>
  );
}
