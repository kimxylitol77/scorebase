// /scores 축구 "스코어보드" 보기 — 리그 제목 줄 아래로 경기를 세로로 줄 맞춘 표(시간·홈·스코어·원정·AI 예측·배당).
// 리그별(카드)·시간순(한 줄 목록)에 이은 세 번째 보기(?sort=board). 새 정보를 더하지 않고 카드에 흩어진 값을 열로 정리한다.
import Link from "next/link";
import FavoriteStar from "../FavoriteStar";
import TeamLogoImg from "@/components/TeamLogoImg";

export interface ScoreboardRow {
  id: number | string;
  league: string;
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
}

export interface ScoreboardGroup {
  league: string;
  label: string;
  flag: string;
  rows: ScoreboardRow[];
}

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

function PredCell({ pred, result, compact = false }: { pred: ScoreboardRow["pred"]; result: ReturnType<typeof outcome>; compact?: boolean }) {
  if (!pred) return compact ? null : <span className="text-[11px] text-neutral-400">-</span>;
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
          {result === topKey ? "적중" : "빗나감"}
        </div>
      )}
    </div>
  );
}

function OddsCell({ odds }: { odds: ScoreboardRow["odds"] }) {
  if (!odds) return <span className="text-center text-[11px] text-neutral-400">-</span>;
  const cells: [number, number | undefined][] = [
    [odds.home, odds.trend?.home],
    [odds.draw, odds.trend?.draw],
    [odds.away, odds.trend?.away],
  ];
  return (
    <div className="grid grid-cols-3 gap-1 text-center text-[11px] tabular-nums">
      {cells.map(([v, t], i) => (
        <span key={i} className="rounded border border-neutral-200 py-0.5 text-neutral-700 dark:border-white/10 dark:text-neutral-200">
          {v > 0 ? v.toFixed(2) : "-"}
          {/* 오픈 대비 하락 = 돈이 몰림(빨강), 상승 = 초록 — 배당 흐름 화면과 같은 규칙 */}
          {t === -1 && <span className="text-rose-500">↓</span>}
          {t === 1 && <span className="text-emerald-500">↑</span>}
        </span>
      ))}
    </div>
  );
}

function StatusCell({ r }: { r: ScoreboardRow }) {
  if (r.status === "live")
    return <span className="text-[11px] font-bold leading-tight text-rose-600 dark:text-rose-400 break-keep">{r.liveLabel ?? "LIVE"}</span>;
  if (r.status === "finished") return <span className="text-[11px] text-neutral-500">종료</span>;
  if (r.status === "postponed") return <span className="text-[11px] text-neutral-400">연기</span>;
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

export default function SoccerScoreboardTable({ groups }: { groups: ScoreboardGroup[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
      <div className={`${GRID} border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-[10px] font-semibold text-neutral-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400`}>
        <span />
        <span>시간</span>
        <span className="text-right">홈</span>
        <span className="text-center">스코어</span>
        <span>원정</span>
        <span className="hidden sm:block">AI 예측 홈·무·원정</span>
        <span className="hidden text-center sm:block">배당 홈·무·원정</span>
      </div>
      {groups.map((g) => (
        <section key={g.league}>
          <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50/70 px-3 py-1.5 dark:border-white/10 dark:bg-white/[0.02]">
            {g.flag && <span aria-hidden className="text-[13px]">{g.flag}</span>}
            <Link href={`/leagues/${g.league}`} prefetch={false} className="truncate text-[12px] font-bold text-neutral-800 hover:underline dark:text-neutral-100">
              {g.label}
            </Link>
            <span className="text-[11px] text-neutral-400">{g.rows.length}</span>
            <Link href={`/leagues/${g.league}`} prefetch={false} className="ml-auto shrink-0 text-[11px] text-blue-600 hover:underline dark:text-blue-400">
              순위표
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
                  <StatusCell r={r} />
                  <TeamCell team={r.home} side="home" href={r.href} />
                  <Link href={r.href ?? "#"} prefetch={false} className="text-center leading-tight">
                    <span className={`block text-[15px] font-bold tabular-nums ${scored ? "text-neutral-900 dark:text-white" : "text-neutral-400"}`}>
                      {scored && r.homeScore != null && r.awayScore != null ? `${r.homeScore} - ${r.awayScore}` : "vs"}
                    </span>
                    {r.half && scored && (
                      <span className="block text-[10px] tabular-nums text-neutral-400">전 {r.half.home}-{r.half.away}</span>
                    )}
                  </Link>
                  <TeamCell team={r.away} side="away" href={r.href} />
                  <div className="hidden sm:block">
                    <PredCell pred={r.pred} result={result} />
                  </div>
                  <div className="hidden sm:block">
                    <OddsCell odds={r.odds} />
                  </div>
                </div>
                {/* 모바일 — AI 예측을 줄 아래 얇은 막대로 */}
                {r.pred && (
                  <div className="mt-1.5 pl-[72px] sm:hidden">
                    <PredCell pred={r.pred} result={null} compact />
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}
      <p className="border-t border-neutral-200 px-3 py-2 text-[10px] text-neutral-400 dark:border-white/10">
        AI 예측 막대는 파랑 홈 · 회색 무 · 주황 원정. 배당 화살표는 오픈 대비 변동(↓ 하락 · ↑ 상승).
      </p>
    </div>
  );
}
