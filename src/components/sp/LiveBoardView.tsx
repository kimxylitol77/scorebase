// 라이브 스코어 보드 — live / upcoming / results 세 섹션. 허브(전체 리그)와 리그 페이지가 공용.
import type { LiveBoard, LiveRow } from "@/lib/sp/live";
import { leagueByCode, SP_LEAGUES } from "@/lib/sp/leagues";
import ScoreRow from "./ScoreRow";
import AutoRefresh from "./AutoRefresh";

function groupByLeague(rows: LiveRow[]): [string, LiveRow[]][] {
  const map = new Map<string, LiveRow[]>();
  for (const l of SP_LEAGUES) map.set(l.code, []);
  for (const r of rows) (map.get(r.league) ?? map.set(r.league, []).get(r.league)!).push(r);
  return [...map.entries()].filter(([, v]) => v.length > 0);
}

function Section({ title, rows, grouped, empty }: { title: string; rows: LiveRow[]; grouped: boolean; empty: string }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xl font-extrabold">{title} <span className="sp-mono text-sm font-bold" style={{ color: "var(--sp-fg-dim)" }}>{rows.length}</span></h2>
      {rows.length === 0 ? (
        <p className="sp-card p-5 text-sm" style={{ color: "var(--sp-fg-muted)" }}>{empty}</p>
      ) : grouped ? (
        <div className="grid gap-3">
          {groupByLeague(rows).map(([code, list]) => (
            <div key={code} className="sp-card overflow-hidden">
              <div className="px-3 py-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--sp-fg-muted)" }}>{leagueByCode(code)?.name ?? code}</div>
              {list.map((m) => <ScoreRow key={m.id} m={m} />)}
            </div>
          ))}
        </div>
      ) : (
        <div className="sp-card overflow-hidden">{rows.map((m) => <ScoreRow key={m.id} m={m} />)}</div>
      )}
    </section>
  );
}

export default function LiveBoardView({ board, grouped }: { board: LiveBoard; grouped: boolean }) {
  return (
    <>
      <AutoRefresh enabled={board.live.length > 0} />
      <Section title="Live now" rows={board.live} grouped={grouped} empty="No matches in play right now. Kick-off times below are shown in your local time." />
      <Section title="Upcoming" rows={board.upcoming} grouped={grouped} empty="No fixtures in the next 30 hours." />
      <Section title="Results" rows={board.results} grouped={grouped} empty="No results in the last 30 hours." />
      <p className="mt-4 text-xs" style={{ color: "var(--sp-fg-dim)" }}>Scores refresh every minute while matches are in play. Each row links to the match prediction page.</p>
    </>
  );
}
