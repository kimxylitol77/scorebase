// 하키 게임센터 — 점수판 바로 아래 한 묶음: 오늘의 3스타 · 득점 요약(피리어드별 골 카드) · 팀 기록 비교(팀 색 막대) · 선수 기록.
// ESPN gamecast·NHL.com gamecenter 벤치마크(2026-09-30). 데이터는 TheSports detailLive 하나, 사진은 서버에서만 붙인다.
import Link from "next/link";
import HockeyBoxScore from "./HockeyBoxScore";
import { nhlPlayerInfo } from "@/lib/sports/nhl-live-names";
import { hockeyPlayerPhoto } from "@/lib/sports/hockey/photos";
import { ratingColor } from "@/lib/sports/hockey/game-score";
import {
  goalsAgainstOf, isGoalie, periodOf, ratingOf, statOf, teamStatRows,
  type HockeyIncident, type HockeyPlayerRow, type HockeyTeamStats,
} from "@/lib/sports/hockey/box";

interface Side { ko: string; logo: string | null; color: string }
interface Props {
  league: string;
  incidents: HockeyIncident[];
  players: { home?: HockeyPlayerRow[]; away?: HockeyPlayerRow[] };
  stats?: HockeyTeamStats;
  home: Side;
  away: Side;
  /** 선수 페이지가 있는 리그(KHL·유럽)면 이름 링크 */
  playerLinkLeague?: string;
}

const CARD = "rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5";

function nameOf(id?: string): string {
  const i = nhlPlayerInfo(id);
  return i?.ko || i?.en || "—";
}

function Photo({ src, no, size, ring }: { src: string | null; no?: number; size: number; ring: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" width={size} height={size}
      className="shrink-0 rounded-full bg-neutral-100 object-cover object-top dark:bg-neutral-800"
      style={{ width: size, height: size, boxShadow: `0 0 0 2px ${ring}` }} />
  ) : (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-500 dark:bg-neutral-800"
      style={{ width: size, height: size, boxShadow: `0 0 0 2px ${ring}` }}>
      {no ?? "?"}
    </span>
  );
}

function TeamLogo({ src, size = 18 }: { src: string | null; size?: number }) {
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size }} />;
}

function PlayerLink({ id, league, children }: { id: string; league?: string; children: React.ReactNode }) {
  return league ? <Link href={`/players/${id}?league=${league}`} className="hover:underline">{children}</Link> : <>{children}</>;
}

function ThreeStars({ props }: { props: Props }) {
  const all = [
    ...(props.players.home ?? []).map((r) => ({ r, side: props.home })),
    ...(props.players.away ?? []).map((r) => ({ r, side: props.away })),
  ]
    .map((x) => ({ ...x, rating: ratingOf(x.r) }))
    .filter((x): x is typeof x & { rating: number } => x.rating != null)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3);
  if (all.length < 3) return null;
  return (
    <section className={CARD}>
      <h2 className="mb-3 text-sm font-bold tracking-tight sm:text-base">오늘의 3스타</h2>
      <ol className="grid grid-cols-3 gap-2 sm:gap-3">
        {all.map(({ r, side, rating }, i) => {
          const info = nhlPlayerInfo(r.id);
          const line = isGoalie(r)
            ? `${statOf(r, 24) ?? 0}세이브 · ${goalsAgainstOf(r) ?? 0}실점`
            : `${statOf(r, 26) ?? 0}골 ${statOf(r, 27) ?? 0}도움`;
          return (
            <li key={r.id} className="relative flex min-w-0 flex-col items-center rounded-xl bg-neutral-50 px-2 pb-3 pt-4 text-center dark:bg-white/[0.04]">
              <span className="absolute left-2 top-2 text-[10px] font-black text-amber-500">{"★".repeat(3 - i)}</span>
              <span className="absolute right-2 top-2"><TeamLogo src={side.logo} size={16} /></span>
              <Photo src={hockeyPlayerPhoto(r.id, props.league)} no={info?.no} size={56} ring={side.color} />
              <div className="mt-2 w-full truncate text-xs font-bold sm:text-sm">
                <PlayerLink id={r.id} league={props.playerLinkLeague}>{nameOf(r.id)}</PlayerLink>
              </div>
              <div className="mt-0.5 whitespace-nowrap text-[10px] text-neutral-500">
                {info?.pos ?? ""}{info?.no ? ` · #${info.no}` : ""}
              </div>
              <div className="mt-1.5 whitespace-nowrap text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">{line}</div>
              <span className="mt-1.5 rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white" style={{ background: ratingColor(rating) }}>
                {rating.toFixed(1)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const PERIOD_LABEL = ["", "1피리어드", "2피리어드", "3피리어드", "연장"];

function ScoringSummary({ props }: { props: Props }) {
  const goals = props.incidents.filter((i) => i.type === 2).sort((a, b) => (a.second ?? 0) - (b.second ?? 0));
  if (goals.length === 0) return null;
  const byPeriod = new Map<number, HockeyIncident[]>();
  for (const g of goals) {
    const p = periodOf(g.second ?? 0).period;
    byPeriod.set(p, [...(byPeriod.get(p) ?? []), g]);
  }
  return (
    <section className={CARD}>
      <h2 className="mb-3 text-sm font-bold tracking-tight sm:text-base">득점 요약</h2>
      <div className="space-y-4">
        {[...byPeriod.entries()].map(([p, list]) => (
          <div key={p}>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400">{PERIOD_LABEL[p] ?? `${p}P`}</div>
            <ul className="space-y-2">
              {list.map((g, i) => {
                const side = g.position === 1 ? props.home : props.away;
                const assists = [g.assists1_id, g.assists2_id].filter(Boolean).map((id) => nameOf(id));
                const hs = g.home_score ?? 0;
                const as = g.away_score ?? 0;
                return (
                  <li key={i} className="flex items-center gap-3 rounded-xl border-l-4 bg-neutral-50 px-3 py-2.5 dark:bg-white/[0.04]" style={{ borderLeftColor: side.color }}>
                    <Photo src={hockeyPlayerPhoto(g.player_id, props.league)} no={nhlPlayerInfo(g.player_id)?.no} size={40} ring={side.color} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <TeamLogo src={side.logo} size={14} />
                        <span className="truncate text-sm font-bold">
                          {g.player_id ? <PlayerLink id={g.player_id} league={props.playerLinkLeague}>{nameOf(g.player_id)}</PlayerLink> : "—"}
                        </span>
                      </div>
                      <div className="truncate text-[11px] text-neutral-500">
                        {assists.length > 0 ? `도움 ${assists.join(", ")}` : "단독 득점"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="rounded-md bg-white px-2 py-0.5 text-sm font-black tabular-nums ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10">
                        <span className={g.position === 1 ? "" : "text-neutral-400"}>{hs}</span>
                        <span className="mx-0.5 text-neutral-300">-</span>
                        <span className={g.position === 2 ? "" : "text-neutral-400"}>{as}</span>
                      </div>
                      <div className="mt-0.5 text-[10px] tabular-nums text-neutral-500">{periodOf(g.second ?? 0).clock}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function TeamStatBars({ props }: { props: Props }) {
  const rows = teamStatRows(props.stats, props.players.home ?? [], props.players.away ?? []);
  if (rows.length < 3) return null;
  const fmt = (v: number, pct?: boolean) => (pct ? `${v.toFixed(1)}%` : String(v));
  return (
    <section className={CARD}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold"><TeamLogo src={props.home.logo} /> <span className="truncate">{props.home.ko}</span></span>
        <h2 className="shrink-0 text-sm font-bold tracking-tight sm:text-base">팀 기록</h2>
        <span className="flex min-w-0 items-center justify-end gap-1.5 text-xs font-bold"><span className="truncate">{props.away.ko}</span> <TeamLogo src={props.away.logo} /></span>
      </div>
      <ul className="space-y-3">
        {rows.map((r) => {
          const tot = r.home + r.away;
          const hp = tot > 0 ? (r.home / tot) * 100 : 50;
          const lead = r.home === r.away ? 0 : r.home > r.away ? 1 : 2;
          return (
            <li key={r.label}>
              <div className="mb-1 flex items-baseline justify-between text-xs tabular-nums">
                <span className={lead === 1 ? "font-black" : "text-neutral-500"}>
                  {fmt(r.home, r.pct)}{r.sub && <span className="ml-1 text-[10px] font-normal text-neutral-400">{r.sub[0]}</span>}
                </span>
                <span className="text-[11px] font-semibold text-neutral-500">{r.label}</span>
                <span className={lead === 2 ? "font-black" : "text-neutral-500"}>
                  {r.sub && <span className="mr-1 text-[10px] font-normal text-neutral-400">{r.sub[1]}</span>}{fmt(r.away, r.pct)}
                </span>
              </div>
              <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
                <div className="rounded-l-full" style={{ width: `${hp}%`, background: props.home.color, opacity: lead === 2 ? 0.45 : 1 }} />
                <div className="flex-1 rounded-r-full" style={{ background: props.away.color, opacity: lead === 1 ? 0.45 : 1 }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function HockeyGameCenter(props: Props) {
  const hasPlayers = (props.players.home?.length ?? 0) + (props.players.away?.length ?? 0) > 0;
  return (
    <div className="space-y-4">
      <ThreeStars props={props} />
      <ScoringSummary props={props} />
      <TeamStatBars props={props} />
      {hasPlayers && (
        <HockeyBoxScore
          players={props.players}
          homeNameKo={props.home.ko}
          awayNameKo={props.away.ko}
          homeLogo={props.home.logo}
          awayLogo={props.away.logo}
          homeColor={props.home.color}
          awayColor={props.away.color}
          playerLinkLeague={props.playerLinkLeague}
        />
      )}
    </div>
  );
}
