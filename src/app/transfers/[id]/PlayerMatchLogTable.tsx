// 출전기록 표 — 경기별 평점·출전·골·카드·결과 (PlayerMatchLog). 최근 15경기 + 더보기.
// 데이터는 collect-player-match-logs 잡이 API-Football /fixtures/players 에서 적재.
// 국가대표 경기(월드컵·A매치, 우리 DB 캐시)도 page 가 같은 행 형식으로 변환해 날짜순 병합.
// 커버 매치(Match.apiFixtureId 매칭)는 행 전체가 매치 상세로 링크된다 (buildup 벤치마크).
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { toKoreanTeamName } from "@/lib/team-names";

/** 시즌별 집계 행 — page 가 전체 로그(최대 500경기)에서 클럽 경기 기준으로 계산. */
export interface SeasonAggRow {
  label: string; // "2025-26" | "2026"
  apps: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  ratingSum: number;
  ratingN: number;
  yellow: number;
  red: number;
}

export interface MatchLogRow {
  id: string;
  href: string | null; // 우리 매치 상세(/live/...) — 미커버 경기는 null
  date: Date;
  leagueName: string;
  compKo?: string | null; // 국가대표 경기 라벨 (월드컵·A매치) — 국기 대신 텍스트 표시
  leagueFlag: string | null;
  homeName: string;
  homeLogo: string | null;
  awayName: string;
  awayLogo: string | null;
  homeScore: number | null;
  awayScore: number | null;
  playerSide: string; // "H" | "A"
  rating: number | null;
  minutes: number | null;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  started: boolean;
}

const RES_META: Record<string, { ko: string; cls: string }> = {
  W: { ko: "승", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  D: { ko: "무", cls: "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300" },
  L: { ko: "패", cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
};
function ratingCls(r: number): string {
  if (r >= 7.0) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (r >= 6.5) return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300";
}
function resultOf(r: MatchLogRow): "W" | "D" | "L" | null {
  if (r.playerSide !== "H" && r.playerSide !== "A") return null; // 홈/원정 미상 — 승무패 판정 불가
  if (r.homeScore == null || r.awayScore == null) return null;
  const my = r.playerSide === "H" ? r.homeScore : r.awayScore;
  const opp = r.playerSide === "H" ? r.awayScore : r.homeScore;
  return my > opp ? "W" : my < opp ? "L" : "D";
}
function fmtDate(d: Date): string {
  return `${String(d.getUTCFullYear()).slice(2)}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
}

function teamLine(name: string, logo: string | null, score: number | null, bold: boolean) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="w-4 h-4 object-contain shrink-0" />
      )}
      <span className={`truncate ${bold ? "font-bold" : "text-neutral-500"}`}>{toKoreanTeamName(name) || name}</span>
      <span className={`ml-auto tabular-nums shrink-0 ${bold ? "font-bold" : "text-neutral-500"}`}>{score ?? "-"}</span>
    </div>
  );
}

function Row({ r }: { r: MatchLogRow }) {
  const played = (r.minutes ?? 0) > 0 || r.rating != null;
  const res = resultOf(r);
  const inner = (
    <>
      <div className="flex flex-col items-center gap-0.5 w-12 shrink-0">
        <span className="text-[11px] text-neutral-400 tabular-nums">{fmtDate(r.date)}</span>
        {r.leagueFlag ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.leagueFlag} alt="" className="w-4 h-3 object-cover rounded-sm" />
        ) : r.compKo ? (
          <span className={`text-[9px] font-bold ${r.compKo === "월드컵" ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-400"}`}>{r.compKo}</span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5 max-w-[220px]">
        {teamLine(r.homeName, r.homeLogo, r.homeScore, r.playerSide === "H")}
        {teamLine(r.awayName, r.awayLogo, r.awayScore, r.playerSide === "A")}
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        {played ? (
          <>
            {r.rating != null && <span className={`px-1.5 py-0.5 rounded text-xs font-bold tabular-nums ${ratingCls(r.rating)}`}>{r.rating.toFixed(1)}</span>}
            <span className="text-[11px] text-neutral-400 tabular-nums w-8 text-right">{r.minutes ?? 0}&apos;</span>
            <span className="text-xs tabular-nums w-10 text-right">
              {r.goals > 0 && <span className="font-bold">⚽{r.goals}</span>}
              {r.assists > 0 && <span className="text-neutral-500"> {r.goals > 0 ? "" : ""}🅰{r.assists}</span>}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-neutral-400">벤치</span>
        )}
        {res && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${RES_META[res].cls}`}>{RES_META[res].ko}</span>}
        <ExternalLink className={`w-3.5 h-3.5 shrink-0 ${r.href ? "text-neutral-400" : "text-transparent"}`} aria-hidden />
      </div>
    </>
  );
  const cls = "flex items-center gap-3 px-3 py-2.5 border-b border-black/5 dark:border-white/5 last:border-0";
  return r.href ? (
    <Link href={r.href} className={`${cls} transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.04]`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export default function PlayerMatchLogTable({ rows, seasonAgg }: { rows: MatchLogRow[]; seasonAgg?: SeasonAggRow[] }) {
  if (!rows.length) return null;
  const head = rows.slice(0, 15);
  const rest = rows.slice(15);
  return (
    <section className="rounded-xl bg-white ring-1 ring-black/5 overflow-hidden dark:bg-white/[0.04] dark:ring-white/10">
      {/* 시즌별 기록 — 축적된 경기 로그의 시즌 집계 (위키형 커리어 표) */}
      {seasonAgg && seasonAgg.length > 0 && (
        <div className="border-b border-black/5 dark:border-white/5">
          <div className="px-4 pt-3.5 pb-2 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">시즌별 기록</h2>
            <span className="text-[11px] text-neutral-500">클럽 경기 기준</span>
          </div>
          <div className="overflow-x-auto px-2 pb-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-neutral-400">
                  <th className="px-2 py-1.5 text-left font-medium">시즌</th>
                  <th className="px-2 py-1.5 text-right font-medium">경기</th>
                  <th className="px-2 py-1.5 text-right font-medium hidden sm:table-cell">선발</th>
                  <th className="px-2 py-1.5 text-right font-medium">골</th>
                  <th className="px-2 py-1.5 text-right font-medium">도움</th>
                  <th className="px-2 py-1.5 text-right font-medium">평점</th>
                  <th className="px-2 py-1.5 text-right font-medium hidden sm:table-cell">경고·퇴장</th>
                </tr>
              </thead>
              <tbody>
                {seasonAgg.map((a) => {
                  const avg = a.ratingN > 0 ? a.ratingSum / a.ratingN : null;
                  return (
                    <tr key={a.label} className="border-t border-black/5 dark:border-white/5">
                      <td className="px-2 py-1.5 font-semibold tabular-nums">{a.label}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{a.apps}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-neutral-500 hidden sm:table-cell">{a.starts}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-bold">{a.goals}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{a.assists}</td>
                      <td className="px-2 py-1.5 text-right">
                        {avg != null ? (
                          <span className={`px-1.5 py-0.5 rounded text-xs font-bold tabular-nums ${ratingCls(avg)}`}>{avg.toFixed(2)}</span>
                        ) : (
                          <span className="text-neutral-400">-</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-neutral-500 hidden sm:table-cell">
                        {a.yellow}·{a.red}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="px-4 pt-3.5 pb-2 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">출전기록</h2>
        <span className="text-[11px] text-neutral-500">최근 {rows.length}경기</span>
      </div>
      <div>
        {head.map((r) => <Row key={r.id} r={r} />)}
        {rest.length > 0 && (
          <details className="group">
            <summary className="px-4 py-2.5 text-xs text-cyan-600 dark:text-cyan-400 cursor-pointer select-none list-none marker:hidden hover:underline text-center">
              이전 {rest.length}경기 더보기
            </summary>
            {rest.map((r) => <Row key={r.id} r={r} />)}
          </details>
        )}
      </div>
    </section>
  );
}
