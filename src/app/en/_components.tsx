// /en 공용 표시 컴포넌트 — 예측 매치 카드·확률 바·결과 행. 서버 컴포넌트 (상태 없음).
import Link from "next/link";
import LocalKickoff from "@/components/en/LocalKickoff";
import { enLeagueName } from "@/lib/i18n/en";
import type { EnMatchRow } from "./_data";

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/** 1X2(또는 2-way) 확률 스택 바 */
export function ProbBar({ home, draw, away }: { home: number | null; draw: number | null; away: number | null }) {
  if (home == null || away == null) return null;
  const d = draw ?? 0;
  const total = home + d + away || 1;
  const seg = (v: number) => `${(v / total) * 100}%`;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800" aria-hidden>
      <div className="bg-blue-500" style={{ width: seg(home) }} />
      {d > 0 && <div className="bg-neutral-400 dark:bg-neutral-600" style={{ width: seg(d) }} />}
      <div className="bg-rose-500" style={{ width: seg(away) }} />
    </div>
  );
}

/** 예정 경기 예측 카드 */
export function MatchPredCard({ m, showLeague = false }: { m: EnMatchRow; showLeague?: boolean }) {
  const isSoccer = m.predDraw != null && m.predDraw > 0;
  const pickLabel =
    m.predWinner === "HOME" ? m.home : m.predWinner === "AWAY" ? m.away : isSoccer ? "Draw" : null;
  const pickProb =
    m.predWinner === "HOME" ? m.predHome : m.predWinner === "AWAY" ? m.predAway : m.predDraw;
  const strong = pickProb != null && pickProb >= 0.65;
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-400">
        <span className="flex items-center gap-2">
          {showLeague && (
            <Link
              href={`/en/predictions/${m.league}`}
              className="font-semibold uppercase tracking-wide text-neutral-500 hover:underline"
            >
              {enLeagueName(m.league)}
            </Link>
          )}
          <LocalKickoff iso={m.startTime} />
        </span>
        {strong && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 ring-1 ring-amber-500/30 dark:text-amber-400">
            Strong pick
          </span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span className="truncate text-sm font-semibold">{m.home}</span>
        <span className="text-[10px] font-medium uppercase text-neutral-400">vs</span>
        <span className="truncate text-right text-sm font-semibold">{m.away}</span>
      </div>

      <div className="mt-2 space-y-1">
        <ProbBar home={m.predHome} draw={m.predDraw} away={m.predAway} />
        <div className="flex items-center justify-between text-[11px] tabular-nums text-neutral-500">
          <span className="text-blue-600 dark:text-blue-400">{pct(m.predHome)}</span>
          {m.predDraw != null && m.predDraw > 0 && <span>{pct(m.predDraw)}</span>}
          <span className="text-rose-600 dark:text-rose-400">{pct(m.predAway)}</span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
        {pickLabel && (
          <span>
            Model pick <span className="font-semibold text-neutral-700 dark:text-neutral-200">{pickLabel}</span>{" "}
            ({pct(pickProb)})
          </span>
        )}
        {m.predOverPick && (
          <span>
            O/U 2.5 <span className="font-semibold text-neutral-700 dark:text-neutral-200">{m.predOverPick === "OVER" ? "Over" : "Under"}</span>
          </span>
        )}
        {m.predHcPick && m.predHcLine != null && (
          <span>
            Handicap{" "}
            <span className="font-semibold text-neutral-700 dark:text-neutral-200">
              {m.predHcPick === "HOME" ? m.home : m.away} {m.predHcLine > 0 ? `+${m.predHcLine}` : m.predHcLine}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

/** 종료 경기 결과 행 — 예측 적중 여부 투명 공개 */
export function JudgedRow({ m }: { m: EnMatchRow }) {
  const predLabel = m.predWinner === "HOME" ? m.home : m.predWinner === "AWAY" ? m.away : "Draw";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 px-3 py-2 text-xs dark:border-white/10">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`inline-flex h-5 shrink-0 items-center rounded-full px-1.5 text-[10px] font-bold ${
            m.predCorrect
              ? "bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/30 dark:text-emerald-400"
              : "bg-neutral-500/10 text-neutral-500 ring-1 ring-neutral-500/20"
          }`}
        >
          {m.predCorrect ? "HIT" : "MISS"}
        </span>
        <span className="truncate">
          {m.home} <span className="font-bold tabular-nums">{m.homeScore}–{m.awayScore}</span> {m.away}
        </span>
      </div>
      <span className="shrink-0 text-neutral-400">
        picked <span className="font-medium text-neutral-600 dark:text-neutral-300">{predLabel}</span>
      </span>
    </div>
  );
}
