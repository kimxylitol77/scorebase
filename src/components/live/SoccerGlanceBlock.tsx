// 경기 상세 상단 "경기 한눈에" — /scores 점수 hover 툴팁과 같은 블록을 탭 밖에 고정 노출.
// 득점·카드 타임라인(홈 좌 / 원정 우) + 풀타임 점유율·슈팅·코너·카드 바 + 전반전 바.
// 종료 경기도 전반전 통계를 유지한다 (옛 statsTab 은 FINISHED 에서 전반 카드를 탈락시켰다, 2026-08-22).

import { StatBars } from "@/components/scores/soccer/SoccerLiveRow";
import type { SoccerGoal, SoccerCard, SoccerTeamStat } from "@/lib/sports/live-scores";

interface Props {
  homeNameKo: string;
  awayNameKo: string;
  goals: SoccerGoal[];
  cards: SoccerCard[];
  teamStats: SoccerTeamStat[];
  halfStats: SoccerTeamStat[];
  status: "LIVE" | "FINISHED";
}

type Ev =
  | { kind: "goal"; side: "home" | "away"; minute: string; player: string; og: boolean; pk: boolean }
  | { kind: "card"; side: "home" | "away"; minute: string; player: string; card: "yellow" | "red" };

/** 추가시간은 소수로 — 전반 45+5 가 후반 47 앞에 오게 (/scores 툴팁과 동일 규칙) */
function parseMinute(s: string): number {
  const m = s.match(/(\d+)(?:\+(\d+))?/);
  if (!m) return 0;
  return parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) / 100 : 0);
}

function CardBadge({ kind }: { kind: "yellow" | "red" }) {
  return (
    <span
      className="inline-block w-2 h-3 rounded-sm shrink-0"
      style={{ background: kind === "yellow" ? "#facc15" : "#dc2626", boxShadow: "0 0 0 1px rgba(0,0,0,0.15)" }}
      aria-label={kind === "yellow" ? "옐로카드" : "레드카드"}
    />
  );
}

function EvText({ ev }: { ev: Ev }) {
  if (ev.kind === "goal")
    return (
      <span className="inline-flex items-center gap-1">
        <span aria-hidden>⚽</span>
        <span className="font-semibold">{ev.player}</span>
        {ev.og && <span className="text-[10px] text-neutral-400">(자책)</span>}
        {ev.pk && <span className="text-[10px] text-neutral-400">(PK)</span>}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1">
      <CardBadge kind={ev.card} />
      <span>{ev.player}</span>
    </span>
  );
}

export default function SoccerGlanceBlock({ homeNameKo, awayNameKo, goals, cards, teamStats, halfStats, status }: Props) {
  const events: Ev[] = [
    ...goals.map<Ev>((g) => ({ kind: "goal", side: g.side, minute: g.minute, player: g.player, og: g.ownGoal, pk: g.penaltyKick })),
    ...cards.map<Ev>((c) => ({ kind: "card", side: c.side, minute: c.minute, player: c.player, card: c.kind })),
  ].sort((a, b) => parseMinute(a.minute) - parseMinute(b.minute));
  if (events.length === 0 && teamStats.length === 0) return null;

  return (
    <section
      aria-labelledby="soccer-glance-title"
      className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-4 sm:p-5 space-y-4"
    >
      <header className="flex items-center justify-between gap-2">
        <h2 id="soccer-glance-title" className="text-sm font-bold tracking-tight">
          경기 한눈에
        </h2>
        <span className="text-[11px] text-neutral-500">
          {status === "LIVE" ? "실시간 · 득점·카드·팀 통계" : "종료 · 득점·카드·팀 통계"}
        </span>
      </header>

      {events.length > 0 && (
        <div>
          <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-[10px] font-bold uppercase tracking-wider text-neutral-400 pb-1.5 border-b border-neutral-100 dark:border-white/10">
            <div className="text-right truncate text-rose-600 dark:text-rose-400">{homeNameKo}</div>
            <div className="px-1">분</div>
            <div className="text-left truncate text-blue-600 dark:text-blue-400">{awayNameKo}</div>
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-white/10 text-[13px]">
            {events.map((ev, i) => (
              <li key={i} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center py-1.5">
                <div className="text-right truncate">{ev.side === "home" && <EvText ev={ev} />}</div>
                <div className="px-1 text-[11px] tabular-nums font-bold text-neutral-500 min-w-[2.5rem] text-center">
                  {ev.minute}
                </div>
                <div className="text-left truncate">{ev.side === "away" && <EvText ev={ev} />}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {teamStats.length > 0 && (
        <div className="space-y-3">
          <StatBars stats={teamStats} />
          {halfStats.length > 0 && (
            <div className="pt-2 border-t border-dashed border-neutral-200 dark:border-white/10">
              <div className="text-center text-[10px] text-neutral-400 mb-1.5">전반전</div>
              <StatBars stats={halfStats} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
