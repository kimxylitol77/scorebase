// /scores 축구 "스코어보드" 보기 — 전 경기를 시작 시각순 한 줄로 세우고 리그가 바뀔 때마다 제목 줄을 끼운 표.
// 리그별(카드)·시간순(한 줄 목록)에 이은 세 번째 보기(?sort=board). 새 정보를 더하지 않고 카드에 흩어진 값을 열로 정리한다.
import Link from "next/link";
import FavoriteStar from "../FavoriteStar";
import TeamLogoImg from "@/components/TeamLogoImg";
import ScoreboardScoreCell from "./ScoreboardScoreCell";
import { LEAGUE_ORDER } from "@/lib/sports/sport-leagues";
import type { SoccerGoal, SoccerCard, SoccerTeamStat } from "@/lib/sports/live-scores";

export interface ScoreboardRow {
  id: number | string;
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
  pred: { home: number; draw: number; away: number } | null;
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

/** 시각순으로 세우고 연속한 같은 리그끼리만 묶는다 — 같은 리그가 시간대에 따라 여러 번 나올 수 있다(사용자 지시 2026-09-28). */
function groupChronological(rows: ScoreboardRow[]): ScoreboardGroup[] {
  const order = (lg: string) => (LEAGUE_ORDER as Record<string, number>)[lg] ?? 999;
  const sorted = [...rows].sort((a, b) => a.start - b.start || order(a.league) - order(b.league) || a.league.localeCompare(b.league));
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
        live: "LIVE", ft: "종료", pp: "연기", ht: "전", hit: "적중", miss: "빗나감", oddsTitle: "배당 흐름 보기",
        noPred: "예측 없음", noPredWhy: "전력 데이터 부족",
        foot: "AI 예측 막대는 파랑 홈 · 회색 무 · 주황 원정. 배당 화살표는 오픈 대비 변동(↓ 하락 · ↑ 상승). 배당을 누르면 배당 흐름으로 이동합니다." },
  en: { time: "Time", home: "Home", score: "Score", away: "Away", ai: "AI pick H·D·A", odds: "Odds H·D·A", table: "Table",
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
  const vals = [pred.home, pred.draw, pred.away];
  const top = vals.indexOf(Math.max(...vals));
  const topKey = (["home", "draw", "away"] as const)[top];
  const pct = (v: number) => Math.round(v * 100);
  const bar = (
    <div className={`flex overflow-hidden rounded-full ${compact ? "h-[3px]" : "h-1.5"}`}>
      <i className="block bg-sky-500" style={{ width: `${pct(pred.home)}%` }} />
      <i className="block bg-neutral-300 dark:bg-neutral-600" style={{ width: `${pct(pred.draw)}%` }} />
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
  const cells: [number, number | undefined][] = [
    [odds.home, odds.trend?.home],
    [odds.draw, odds.trend?.draw],
    [odds.away, odds.trend?.away],
  ];
  const grid = (
    <div className="grid grid-cols-3 gap-1 text-center text-[11px] tabular-nums">
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

function TeamCell({ team, side, href }: { team: ScoreboardRow["home"]; side: "home" | "away"; href: string | null }) {
  const name = (
    <span className="truncate text-[13px] font-medium text-neutral-800 dark:text-neutral-100">{team.name}</span>
  );
  const logo = (
    <TeamLogoImg url={team.logo} name={team.name} size={16} className="h-4 w-4 shrink-0 object-contain" fallbackClassName="h-4 w-4 shrink-0" />
  );
  const inner =
    side === "home" ? (
      <>
        <span className="hidden sm:inline"><Rank n={team.position} /></span>
        {name}
        {logo}
      </>
    ) : (
      <>
        {logo}
        {name}
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
  oddsHref = "/odds?sport=soccer",
  leagueHref = (lg: string) => `/leagues/${lg}`,
}: {
  rows: ScoreboardRow[];
  lang?: Lang;
  /** 배당 칸 링크 — null 이면 각 경기 상세(영어판) */
  oddsHref?: string | null;
  leagueHref?: (league: string) => string;
}) {
  const t = T[lang];
  const groups = groupChronological(rows);
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
      <div className={`${GRID} border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-[10px] font-semibold text-neutral-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400`}>
        <span />
        <span>{t.time}</span>
        <span className="text-right">{t.home}</span>
        <span className="text-center">{t.score}</span>
        <span>{t.away}</span>
        <span className="hidden sm:block">{t.ai}</span>
        <span className="hidden text-center sm:block">{t.odds}</span>
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
          {g.rows.map((r) => {
            const scored = r.status === "live" || r.status === "finished";
            const result = r.status === "finished" ? outcome(r.homeScore, r.awayScore) : null;
            return (
              <div
                key={r.id}
                className={`border-b border-neutral-100 px-3 py-2 last:border-0 dark:border-white/[0.06] ${r.status === "live" ? "bg-rose-500/[0.06]" : ""}`}
              >
                <div className={GRID}>
                  <FavoriteStar
                    matchId={String(r.id)}
                    meta={{
                      id: String(r.id),
                      sport: "soccer",
                      league: r.league,
                      homeName: r.home.name,
                      awayName: r.away.name,
                      homeScore: r.homeScore,
                      awayScore: r.awayScore,
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
                  <TeamCell team={r.away} side="away" href={r.href} />
                  <div className="hidden sm:block">
                    <PredCell pred={r.pred} result={result} t={t} />
                  </div>
                  <div className="hidden sm:block">
                    <OddsCell odds={r.odds} href={oddsHref ?? r.href} title={t.oddsTitle} />
                  </div>
                </div>
                {/* 모바일 — AI 예측을 줄 아래 얇은 막대로 */}
                {r.pred && (
                  <div className="mt-1.5 pl-[72px] sm:hidden">
                    <PredCell pred={r.pred} result={null} compact t={t} />
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
      <p className="border-t border-neutral-200 px-3 py-2 text-[10px] text-neutral-400 dark:border-white/10">
        {t.foot}
      </p>
    </div>
  );
}
