// 라이브 스코어 한 줄 — 상태(LIVE 분·시각·FT) · 팀 · 점수 · 모델 픽 적중 표시. 클릭 시 /match/[id].
import Link from "next/link";
import TeamBadge from "@/components/TeamBadge";
import type { LiveRow } from "@/lib/sp/live";
import { leagueByCode } from "@/lib/sp/leagues";
import LocalTime from "./LocalTime";

export default function ScoreRow({ m, showLeague = false }: { m: LiveRow; showLeague?: boolean }) {
  const live = m.status === "LIVE";
  const done = m.status === "FINISHED";
  const lg = leagueByCode(m.league);
  const pickName = m.pick === "DRAW" ? "Draw" : m.pick === "HOME" ? m.home.name : m.pick === "AWAY" ? m.away.name : null;
  return (
    <Link href={`/match/${m.id}`} className="grid grid-cols-[72px_1fr_auto] items-center gap-3 border-t px-3 py-3 text-sm transition-colors hover:bg-white/[0.03] sm:grid-cols-[88px_1fr_auto_1fr_auto]" style={{ borderColor: "var(--sp-border)" }}>
      <span className="sp-mono text-xs font-bold" style={{ color: live ? "var(--sp-green)" : "var(--sp-fg-dim)" }}>
        {live ? (<span className="inline-flex items-center gap-1.5"><span className="sp-live-dot" aria-hidden />{m.liveLabel ?? "LIVE"}</span>) : done ? "FT" : m.status === "POSTPONED" ? "PPD" : <LocalTime iso={m.startTime} />}
      </span>
      <span className="flex min-w-0 items-center gap-2 font-semibold sm:justify-end sm:text-right">
        {showLeague && <span className="sp-eyebrow mr-1 hidden sm:inline" style={{ fontSize: 10 }}>{lg?.short ?? m.league}</span>}
        <span className="truncate">{m.home.name}</span><TeamBadge logoUrl={m.home.logo} size={18} className="rounded-sm bg-white/90" />
      </span>
      <span className="sp-mono min-w-[56px] text-center text-base font-bold" style={{ color: live ? "var(--sp-fg)" : done ? "var(--sp-fg)" : "var(--sp-fg-dim)" }}>
        {m.homeScore != null && m.awayScore != null && !(m.status === "SCHEDULED") ? `${m.homeScore} – ${m.awayScore}` : "vs"}
      </span>
      <span className="col-start-2 flex min-w-0 items-center gap-2 font-semibold sm:col-start-auto">
        <TeamBadge logoUrl={m.away.logo} size={18} className="rounded-sm bg-white/90" /><span className="truncate">{m.away.name}</span>
      </span>
      <span className="col-start-3 text-right text-xs sm:col-start-auto" style={{ color: done && m.correct != null ? (m.correct ? "var(--sp-green)" : "var(--sp-red)") : "var(--sp-fg-dim)" }}>
        {pickName ? (done && m.correct != null ? (m.correct ? "Pick hit" : "Pick missed") : `Pick ${pickName}${m.pickProb != null ? ` ${Math.round(m.pickProb * 100)}%` : ""}`) : ""}
      </span>
    </Link>
  );
}
