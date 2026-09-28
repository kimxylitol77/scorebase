// /scores "스코어보드" 보기 — 전 경기를 시작 시각순 한 줄로 세우고 리그가 바뀔 때마다 제목 줄을 끼운 표.
// 축구 목록 + "내 경기"(즐겨찾기) 전 종목 공용. 야구는 원정이 왼쪽(기존 카드 규칙), 무승부 없는 종목은 AI·배당 2칸.
// 리그별(카드)·시간순(한 줄 목록)에 이은 세 번째 보기(?sort=board). 새 정보를 더하지 않고 카드에 흩어진 값을 열로 정리한다.
import Link from "next/link";
import FavoriteStar from "../FavoriteStar";
import TeamLogoImg from "@/components/TeamLogoImg";
import ScoreboardScoreCell from "./ScoreboardScoreCell";
import ScoreboardGoalRow from "./ScoreboardGoalRow";
import { LEAGUE_ORDER } from "@/lib/sports/sport-leagues";
import type { SoccerGoal, SoccerCard, SoccerTeamStat } from "@/lib/sports/live-scores";

export interface ScoreboardRow {
  id: number | string;
  /** soccer | baseball | basketball | hockey … — 즐겨찾기 별 meta·2지선다 판정 */
  sport: string;
  league: string;
  leagueLabel: string;
  flag: string;
  /** 시작 시각 epoch ms — 시각순 정렬 */
  start: number;
  status: "live" | "scheduled" | "finished" | "postponed";
  timeLabel: string;
  liveLabel: string | null;
  href: string | null;
  home: { name: string; logo: string | null; position: number | null };
  away: { name: string; logo: string | null; position: number | null };
  homeScore: number | null;
  awayScore: number | null;
  half: { home: number; away: number } | null;
  /** draw null = 무승부 없는 종목(2칸) */
  pred: { home: number; draw: number | null; away: number } | null;
  odds: { home: number; draw: number; away: number; trend: { home: number; draw: number; away: number } | null } | null;
  /** 점수 hover 툴팁 — 시간순 목록과 같은 재료 */
  goals: SoccerGoal[];
  cards: SoccerCard[];
  teamStats: SoccerTeamStat[];
  halfStats: SoccerTeamStat[];
  homeShort: string;
  awayShort: string;
}

interface ScoreboardGroup {
  key: string;
  league: string;
  label: string;
  flag: string;
  rows: ScoreboardRow[];
}

/** 시각순으로 세우고 연속한 같은 리그끼리만 묶는다 — 같은 리그가 시간대에 따라 여러 번 나올 수 있다(사용자 지시 2026-09-28).
 *  진행 중·예정 경기가 위(시작 빠른 순), 종료 경기는 그 아래, 연기는 맨 아래 — 끝난 경기가 위를 차지하지 않게. */
function groupChronological(rows: ScoreboardRow[]): ScoreboardGroup[] {
  const order = (lg: string) => (LEAGUE_ORDER as Record<string, number>)[lg] ?? 999;
  const bucket = (r: ScoreboardRow) => (r.status === "finished" ? 1 : r.status === "postponed" ? 2 : 0);
  const sorted = [...rows].sort(
    (a, b) => bucket(a) - bucket(b) || a.start - b.start || order(a.league) - order(b.league) || a.league.localeCompare(b.league),
  );
  const out: ScoreboardGroup[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && last.league === r.league) last.rows.push(r);
    else out.push({ key: `${r.league}-${out.length}`, league: r.league, label: r.leagueLabel, flag: r.flag, rows: [r] });
  }
  return out;
}

// 한·영 문구 — 영어판(/en/scores)도 같은 표를 쓴다
const T = {
  ko: { time: "시간", home: "홈", score: "스코어", away: "원정", ai: "AI 예측 홈·무·원정", odds: "배당 홈·무·원정", table: "순위표",
        ai2: "AI 예측 홈·원정", odds2: "배당 홈·원정", aiAH: "AI 예측 원정·홈", oddsAH: "배당 원정·홈", homeBadge: "홈",
        live: "LIVE", ft: "종료", pp: "연기", ht: "전", hit: "적중", miss: "빗나감", oddsTitle: "배당 흐름 보기",
        noPred: "예측 없음", noPredWhy: "전력 데이터 부족",
        foot: "AI 예측 막대는 파랑 홈 · 회색 무 · 주황 원정. 배당 화살표는 오픈 대비 변동(↓ 하락 · ↑ 상승). 배당을 누르면 배당 흐름으로 이동합니다." },
  en: { time: "Time", home: "Home", score: "Score", away: "Away", ai: "AI pick H·D·A", odds: "Odds H·D·A", table: "Table",
        ai2: "AI pick H·A", odds2: "Odds H·A", aiAH: "AI pick A·H", oddsAH: "Odds A·H", homeBadge: "H",
        live: "LIVE", ft: "FT", pp: "PPD", ht: "HT", hit: "Hit", miss: "Miss", oddsTitle: "Match details",
        noPred: "No pick", noPredWhy: "not enough history",
        foot: "AI bar is blue home · gray draw · orange away. Odds arrows show movement since opening (↓ shortened · ↑ drifted)." },
} as const;
type Lang = keyof typeof T;

// 데스크톱 7열 / 모바일 5열 — 모든 줄이 같은 폭을 써서 세로로 정렬된다
const GRID =
  "grid items-center gap-x-2 grid-cols-[20px_44px_minmax(0,1fr)_52px_minmax(0,1fr)] sm:grid-cols-[22px_60px_minmax(0,1fr)_64px_minmax(0,1fr)_132px_136px]";

function Rank({ n }: { n: number | null }) {
  if (n == null) return null;
  return <span className="text-[10px] tabular-nums text-neutral-400">[{n}]</span>;
}

function outcome(h: number | null, a: number | null): "home" | "draw" | "away" | null {
  if (h == null || a == null) return null;
  return h > a ? "home" : h < a ? "away" : "draw";
}

function PredCell({ pred, result, compact = false, t }: { pred: ScoreboardRow["pred"]; result: ReturnType<typeof outcome>; compact?: boolean; t: (typeof T)[Lang] }) {
  // 예측이 없는 건 양 팀 모두 경기 이력이 없어(레이팅 초기값) 모델이 일부러 내지 않은 경우 — "-" 대신 사유를 적는다
  if (!pred)
    return compact ? null : (
      <span className="block text-[10px] leading-tight text-neutral-400">
        {t.noPred}
        <span className="block">{t.noPredWhy}</span>
      </span>
    );
  const keys = pred.draw == null ? (["home", "away"] as const) : (["home", "draw", "away"] as const);
  const vals = keys.map((k) => (k === "draw" ? pred.draw ?? 0 : pred[k]));
  const top = vals.indexOf(Math.max(...vals));
  const topKey = keys[top];
  const pct = (v: number) => Math.round(v * 100);
  const bar = (
    <div className={`flex overflow-hidden rounded-full ${compact ? "h-[3px]" : "h-1.5"}`}>
      <i className="block bg-sky-500" style={{ width: `${pct(pred.home)}%` }} />
      {pred.draw != null && <i className="block bg-neutral-300 dark:bg-neutral-600" style={{ width: `${pct(pred.draw)}%` }} />}
      <i className="block bg-orange-500" style={{ width: `${pct(pred.away)}%` }} />
    </div>
  );
  if (compact) return bar;
  return (
    <div className="min-w-0 space-y-0.5">
      {bar}
      <div className="flex justify-between text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400">
        {vals.map((v, i) => (
          <span key={i} className={i === top ? "font-bold text-neutral-900 dark:text-white" : ""}>
            {pct(v)}
          </span>
        ))}
      </div>
      {result && (
        <div className={`text-[10px] font-semibold ${result === topKey ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-400"}`}>
          {result === topKey ? t.hit : t.miss}
        </div>
      )}
    </div>
  );
}

function OddsCell({ odds, href, title }: { odds: ScoreboardRow["odds"]; href: string | null; title: string }) {
  if (!odds) return <span className="text-center text-[11px] text-neutral-400">-</span>;
  const cells: [number, number | undefined][] =
    odds.draw > 0
      ? [
          [odds.home, odds.trend?.home],
          [odds.draw, odds.trend?.draw],
          [odds.away, odds.trend?.away],
        ]
      : [
          [odds.home, odds.trend?.home],
          [odds.away, odds.trend?.away],
        ];
  const grid = (
    <div className={`grid ${cells.length === 3 ? "grid-cols-3" : "grid-cols-2"} gap-1 text-center text-[11px] tabular-nums`}>
      {cells.map(([v, t], i) => (
        <span key={i} className={`rounded border border-neutral-200 py-0.5 text-neutral-700 dark:border-white/10 dark:text-neutral-200 ${href ? "group-hover:border-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" : ""}`}>
          {v > 0 ? v.toFixed(2) : "-"}
          {/* 오픈 대비 하락 = 돈이 몰림(빨강), 상승 = 초록 — 배당 흐름 화면과 같은 규칙 */}
          {t === -1 && <span className="text-rose-500">↓</span>}
          {t === 1 && <span className="text-emerald-500">↑</span>}
        </span>
      ))}
    </div>
  );
  // 배당을 누르면 배당 흐름 페이지로(사용자 요청 2026-09-28). 영어판은 배당 페이지가 없어 경기 상세로.
  return href ? (
    <Link href={href} prefetch={false} title={title} className="group block">{grid}</Link>
  ) : (
    grid
  );
}

function StatusCell({ r, t }: { r: ScoreboardRow; t: (typeof T)[Lang] }) {
  if (r.status === "live")
    return <span className="text-[11px] font-bold leading-tight text-rose-600 dark:text-rose-400 break-keep">{r.liveLabel ?? t.live}</span>;
  if (r.status === "finished") return <span className="text-[11px] text-neutral-500">{t.ft}</span>;
  if (r.status === "postponed") return <span className="text-[11px] text-neutral-400">{t.pp}</span>;
  return <span className="text-[11px] tabular-nums text-neutral-600 dark:text-neutral-300">{r.timeLabel}</span>;
}

function TeamCell({ team, side, href, homeBadge }: { team: ScoreboardRow["home"]; side: "home" | "away"; href: string | null; homeBadge?: string | null }) {
  const name = (
    <span className={`sb-team-${side} truncate text-[13px] font-medium text-neutral-800 dark:text-neutral-100`}>{team.name}</span>
  );
  // 득점 순간에만 보이는 전광판 "GOAL" 표시 — ScoreboardGoalRow 의 data-goal 로 켜진다(globals.css)
  const goalTag = <span aria-hidden className={`sb-goal-tag sb-goal-tag-${side}`}>GOAL</span>;
  const logo = (
    <TeamLogoImg url={team.logo} name={team.name} size={16} className="h-4 w-4 shrink-0 object-contain" fallbackClassName="h-4 w-4 shrink-0" />
  );
  const inner =
    side === "home" ? (
      <>
        <span className="hidden sm:inline"><Rank n={team.position} /></span>
        {goalTag}
        {name}
        {logo}
      </>
    ) : (
      <>
        {logo}
        {homeBadge && (
          <span className="shrink-0 rounded bg-amber-500/15 px-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">{homeBadge}</span>
        )}
        {name}
        {goalTag}
        <span className="hidden sm:inline"><Rank n={team.position} /></span>
      </>
    );
  const cls = `flex min-w-0 items-center gap-1.5 ${side === "home" ? "justify-end text-right" : ""}`;
  return href ? (
    <Link href={href} prefetch={false} className={`${cls} hover:underline`}>{inner}</Link>
  ) : (
    <span className={cls}>{inner}</span>
  );
}

export default function SoccerScoreboardTable({
  rows,
  lang = "ko",
  oddsHref,
  leagueHref = (lg: string) => `/leagues/${lg}`,
  sport = "soccer",
  showLegend = true,
}: {
  rows: ScoreboardRow[];
  lang?: Lang;
  /** 배당 칸 링크 — 생략하면 그 종목 배당 흐름(/odds?sport=), null 이면 각 경기 상세(영어판) */
  oddsHref?: string | null;
  leagueHref?: (league: string) => string;
  /** 즐겨찾기 표는 종목별로 그린다 — 야구는 원정이 왼쪽, 무승부 없는 종목은 2칸 */
  sport?: string;
  /** 표 아래 색·화살표 안내 — 즐겨찾기처럼 표가 여러 개면 끈다 */
  showLegend?: boolean;
}) {
  const t = T[lang];
  const groups = groupChronological(rows);
  const awayFirst = sport === "baseball";
  const twoWay = sport !== "soccer";
  const leftLabel = awayFirst ? t.away : t.home;
  const rightLabel = awayFirst ? t.home : t.away;
  const aiLabel = !twoWay ? t.ai : awayFirst ? t.aiAH : t.ai2;
  const oddsLabel = !twoWay ? t.odds : awayFirst ? t.oddsAH : t.odds2;
  // 야구 — 원정을 왼쪽으로 뒤집어 그린다(점수·예측·배당도 같이). outcome·적중 판정은 뒤집힌 좌우 기준으로 일관
  const view = (r: ScoreboardRow): ScoreboardRow =>
    !awayFirst
      ? r
      : {
          ...r,
          home: r.away,
          away: r.home,
          homeScore: r.awayScore,
          awayScore: r.homeScore,
          half: r.half ? { home: r.half.away, away: r.half.home } : null,
          pred: r.pred ? { home: r.pred.away, draw: r.pred.draw, away: r.pred.home } : null,
          odds: r.odds
            ? {
                home: r.odds.away,
                draw: r.odds.draw,
                away: r.odds.home,
                trend: r.odds.trend ? { home: r.odds.trend.away, draw: r.odds.trend.draw, away: r.odds.trend.home } : null,
              }
            : null,
          homeShort: r.awayShort,
          awayShort: r.homeShort,
        };
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
      <div className={`${GRID} border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-[10px] font-semibold text-neutral-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400`}>
        <span />
        <span>{t.time}</span>
        <span className="text-right">{leftLabel}</span>
        <span className="text-center">{t.score}</span>
        <span>{rightLabel}</span>
        <span className="hidden sm:block">{aiLabel}</span>
        <span className="hidden text-center sm:block">{oddsLabel}</span>
      </div>
      {groups.map((g) => (
        <section key={g.key}>
          <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50/70 px-3 py-1.5 dark:border-white/10 dark:bg-white/[0.02]">
            {g.flag && <span aria-hidden className="text-[13px]">{g.flag}</span>}
            <Link href={leagueHref(g.league)} prefetch={false} className="truncate text-[12px] font-bold text-neutral-800 hover:underline dark:text-neutral-100">
              {g.label}
            </Link>
            <span className="text-[11px] text-neutral-400">{g.rows.length}</span>
            <Link href={leagueHref(g.league)} prefetch={false} className="ml-auto shrink-0 text-[11px] text-blue-600 hover:underline dark:text-blue-400">
              {t.table}
            </Link>
          </div>
          {g.rows.map((orig) => {
            const r = view(orig);
            const scored = r.status === "live" || r.status === "finished";
            const result = r.status === "finished" ? outcome(r.homeScore, r.awayScore) : null;
            return (
              <ScoreboardGoalRow
                key={r.id}
                live={r.status === "live"}
                homeScore={r.homeScore}
                awayScore={r.awayScore}
                className={`border-b border-neutral-100 px-3 py-2 last:border-0 dark:border-white/[0.06] ${r.status === "live" ? "bg-rose-500/[0.06]" : ""}`}
              >
                <div className={GRID}>
                  <FavoriteStar
                    matchId={String(r.id)}
                    meta={{
                      // 저장값은 뒤집기 전 원본 홈·원정 그대로
                      id: String(orig.id),
                      sport: orig.sport,
                      league: orig.league,
                      homeName: orig.home.name,
                      awayName: orig.away.name,
                      homeScore: orig.homeScore,
                      awayScore: orig.awayScore,
                      status: r.status,
                      statusLabel: r.liveLabel ?? r.timeLabel,
                      href: r.href ?? undefined,
                    }}
                  />
                  <StatusCell r={r} t={t} />
                  <TeamCell team={r.home} side="home" href={r.href} />
                  <ScoreboardScoreCell
                    href={r.href}
                    scored={scored}
                    homeScore={r.homeScore}
                    awayScore={r.awayScore}
                    half={r.half}
                    htLabel={t.ht}
                    goals={r.goals}
                    cards={r.cards}
                    teamStats={r.teamStats}
                    halfStats={r.halfStats}
                    homeLabel={r.homeShort}
                    awayLabel={r.awayShort}
                  />
                  <TeamCell team={r.away} side="away" href={r.href} homeBadge={awayFirst ? t.homeBadge : null} />
                  <div className="hidden sm:block">
                    <PredCell pred={r.pred} result={result} t={t} />
                  </div>
                  <div className="hidden sm:block">
                    <OddsCell odds={r.odds} href={oddsHref === undefined ? `/odds?sport=${sport}` : oddsHref ?? r.href} title={t.oddsTitle} />
                  </div>
                </div>
                {/* 모바일 — AI 예측을 줄 아래 얇은 막대로 */}
                {r.pred && (
                  <div className="mt-1.5 pl-[72px] sm:hidden">
                    <PredCell pred={r.pred} result={null} compact t={t} />
                  </div>
                )}
              </ScoreboardGoalRow>
            );
          })}
        </section>
      ))}
      {showLegend && (
        <p className="border-t border-neutral-200 px-3 py-2 text-[10px] text-neutral-400 dark:border-white/10">
          {t.foot}
        </p>
      )}
    </div>
  );
}
