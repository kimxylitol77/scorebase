// 경기 예측 카드 — 리그·시각·팀·확률 바·픽. 클릭 시 /match/[id].
import Link from "next/link";
import TeamBadge from "@/components/TeamBadge";
import { leagueByCode } from "@/lib/sp/leagues";
import type { SpMatch } from "@/lib/sp/data";
import LocalTime from "./LocalTime";
import ProbBar from "./ProbBar";

export function pickLabel(m: SpMatch): string {
  if (!m.pick) return "";
  if (m.pick === "DRAW") return "Draw";
  return `${m.pick === "HOME" ? m.home.name : m.away.name} win`;
}

export default function MatchCard({ m, compact = false }: { m: SpMatch; compact?: boolean }) {
  const lg = leagueByCode(m.league);
  const finished = m.status === "FINISHED" && m.homeScore != null;
  return (
    <Link href={`/match/${m.id}`} className={`sp-card block p-4 transition-colors hover:border-[var(--sp-border-strong)] ${m.strong && !finished ? "sp-card-accent" : ""}`}>
      <div className="mb-3 flex items-center justify-between gap-2 text-xs" style={{ color: "var(--sp-fg-muted)" }}>
        <span className="font-bold uppercase tracking-wide">{lg?.short ?? m.league}</span>
        {finished ? (
          <span className="sp-mono font-bold" style={{ color: m.correct ? "var(--sp-green)" : "var(--sp-red)" }}>
            {m.correct ? "Hit" : "Miss"} · {m.homeScore}-{m.awayScore}
          </span>
        ) : (
          <LocalTime iso={m.startTime} />
        )}
      </div>
      <div className="mb-3 flex items-center justify-between gap-3 text-[15px] font-semibold">
        <span className="flex min-w-0 items-center gap-2"><TeamBadge logoUrl={m.home.logo} size={22} className="rounded-sm bg-white/90" /><span className="truncate">{m.home.name}</span></span>
        <span className="text-xs font-normal" style={{ color: "var(--sp-fg-dim)" }}>vs</span>
        <span className="flex min-w-0 items-center gap-2 text-right"><span className="truncate">{m.away.name}</span><TeamBadge logoUrl={m.away.logo} size={22} className="rounded-sm bg-white/90" /></span>
      </div>
      {m.probs && <ProbBar home={m.probs.home} draw={m.probs.draw} away={m.probs.away} />}
      {!compact && m.pick && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span style={{ color: "var(--sp-fg-muted)" }}>Pick <strong style={{ color: "var(--sp-fg)" }}>{pickLabel(m)}</strong></span>
          <span className="sp-mono font-bold" style={{ color: m.strong ? "var(--sp-lime)" : "var(--sp-fg)" }}>
            {Math.round((m.pickProb ?? 0) * 100)}%{m.strong ? " · strong" : ""}
          </span>
        </div>
      )}
    </Link>
  );
}
