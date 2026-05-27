// MLB 매치 상세 통합 탭 — 네이버 스타일.
// 6탭: 중계 / 라인업 / 타자 기록 / 투수 기록 / 팀 스탯(TS) / 라이브 배당 / 승률 곡선.
// "팀 통계" (ESPN) 는 MatchInsight 의 teamStatsContent 탭으로 흡수됨 (MlbTeamStatsLive).
//
// Polling 2개:
//  - /api/live/mlb-boxscore — boxscore (라인업/타자/투수) 30초
//  - /api/live/mlb         — ESPN summary (WPA, odds) 30초
//
// 정적 props (SSR):
//  - initialBoxscore
//  - tsDetailStats   (TheSports detailLive.stats)
//  - initialOdds     (baseballOdds.odds + history)
//
// Apple 스타일: 흰 카드, hairline 구분선, 둥근 헤드샷, tabular-nums, pill 탭, segmented control.

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BaseballTeamStatsCard from "./BaseballTeamStatsCard";
import BaseballWpaChart from "./BaseballWpaChart";
import LiveOddsCard from "./LiveOddsCard";

interface BoxBatter {
  pid: number;
  name: string;
  order: number | null;
  isStarter: boolean;
  position: string;
  ab: number;
  r: number;
  h: number;
  rbi: number;
  bb: number;
  so: number;
  hr: number;
  avgGame: string;
  seasonAvg: string;
  seasonHr: number;
  seasonRbi: number;
  seasonOps: string;
}

interface BoxPitcher {
  pid: number;
  name: string;
  isStarter: boolean;
  ip: string;
  h: number;
  r: number;
  er: number;
  bb: number;
  so: number;
  hr: number;
  pitchCount?: number;
  seasonEra: string;
  seasonWhip: string;
  seasonW: number;
  seasonL: number;
}

interface Boxscore {
  gamePk: number;
  home: { batters: BoxBatter[]; pitchers: BoxPitcher[] };
  away: { batters: BoxBatter[]; pitchers: BoxPitcher[] };
}

interface WpaPoint {
  inning: number;
  homeWP: number;
  homeScore: number;
  awayScore: number;
}

interface LiveOdds {
  h2h: { home: number; draw: number | null; away: number } | null;
  totals: { line: number; over: number; under: number } | null;
  spread: {
    line: number;
    pick: "HOME" | "AWAY";
    homeOdds: number;
    awayOdds: number;
  } | null;
  bookmakers: number;
  bookmakerList?: Array<{
    key: string;
    title: string;
    h2h: { home: number; draw: number | null; away: number } | null;
  }>;
  fetchedAt: number;
}

interface OddsHistoryPoint {
  fetchedAt: number;
  home: number | null;
  draw: number | null;
  away: number | null;
}

interface MlbLiveResponse {
  live?: {
    wpaSeries?: WpaPoint[] | null;
    liveOdds?: LiveOdds | null;
  };
}

interface PbpPlay {
  id: string;
  slug: string;
  typeText: string;
  text: string;
  textKo: string;
  inning: number;
  half: "top" | "bottom";
  awayScore: number;
  homeScore: number;
  scoringPlay: boolean;
}

interface PbpData {
  plays: PbpPlay[];
  currentInning: number;
  currentHalf: "top" | "bottom" | null;
  status: "PRE" | "LIVE" | "FINAL" | "DELAY";
}

interface Props {
  gameId: string;
  homeNameKo: string;
  awayNameKo: string;
  initialBoxscore?: Boxscore | null;
  initialStatus: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED";
  playerNameKoBy?: Record<number, string>;
  /** TheSports detail_live.stats (phase 0) — SSR */
  tsDetailStats?: unknown;
  /** 라이브 배당 + 시계열 (SSR) */
  initialOdds?: {
    odds: LiveOdds;
    history: Array<{ fetchedAt: number; home: number | null; away: number | null }>;
  } | null;
}

type TabKey =
  | "pbp"
  | "lineup"
  | "batting"
  | "pitching"
  | "ts-stats"
  | "odds"
  | "wpa";

const BOXSCORE_POLL_MS = 30_000;
const LIVE_POLL_MS = 30_000;

function headshotUrl(pid: number): string {
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_120,q_auto:best/v1/people/${pid}/headshot/67/current`;
}

export default function MlbBoxscoreTabs({
  gameId,
  homeNameKo,
  awayNameKo,
  initialBoxscore,
  initialStatus,
  playerNameKoBy,
  tsDetailStats,
  initialOdds,
}: Props) {
  const [box, setBox] = useState<Boxscore | null>(initialBoxscore ?? null);
  const [wpaSeries, setWpaSeries] = useState<WpaPoint[] | null>(null);
  const [liveOdds, setLiveOdds] = useState<LiveOdds | null>(
    initialOdds?.odds ?? null,
  );
  const [pbp, setPbp] = useState<PbpData | null>(null);
  const [tab, setTab] = useState<TabKey>("pbp");
  const [side, setSide] = useState<"away" | "home">("away");

  // boxscore polling
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const once = async () => {
      try {
        const res = await fetch(`/api/live/mlb-boxscore/${gameId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const j: { boxscore?: Boxscore | null } = await res.json();
        if (alive && j.boxscore) setBox(j.boxscore);
      } catch {
        // ignore
      }
    };
    const schedule = () => {
      if (initialStatus !== "LIVE") return;
      if (typeof document !== "undefined" && document.hidden) return;
      timer = setTimeout(async () => {
        await once();
        schedule();
      }, BOXSCORE_POLL_MS);
    };
    if (!initialBoxscore) once().then(schedule);
    else schedule();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [gameId, initialStatus, initialBoxscore]);

  // ESPN live polling (teamStats, wpaSeries, liveOdds)
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let etag: string | null = null;
    const once = async () => {
      try {
        const headers: HeadersInit = etag ? { "if-none-match": etag } : {};
        const res = await fetch(`/api/live/mlb/${gameId}`, {
          cache: "no-store",
          headers,
        });
        if (res.status === 304) return;
        if (!res.ok) return;
        const e = res.headers.get("etag");
        if (e) etag = e;
        const j: MlbLiveResponse = await res.json();
        if (!alive || !j.live) return;
        if (j.live.wpaSeries) setWpaSeries(j.live.wpaSeries);
        if (j.live.liveOdds) setLiveOdds(j.live.liveOdds);
      } catch {
        // ignore
      }
    };
    const schedule = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      timer = setTimeout(async () => {
        await once();
        schedule();
      }, LIVE_POLL_MS);
    };
    once().then(schedule);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [gameId]);

  // PBP polling — 별도 endpoint (응답 크기 ~100KB, 다른 polling 에 영향 없게 분리)
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const once = async () => {
      try {
        const res = await fetch(`/api/live/mlb-pbp/${gameId}`, { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as PbpData & { error?: string };
        if (alive && Array.isArray(j.plays)) setPbp(j);
      } catch {
        // ignore
      }
    };
    const schedule = () => {
      if (initialStatus !== "LIVE") return;
      if (typeof document !== "undefined" && document.hidden) return;
      timer = setTimeout(async () => {
        await once();
        schedule();
      }, BOXSCORE_POLL_MS);
    };
    once().then(schedule);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [gameId, initialStatus]);

  // 각 탭의 데이터 가용성
  const hasPbp = !!(pbp?.plays && pbp.plays.length > 0);
  const hasLineup = !!(box?.home.batters.length || box?.away.batters.length);
  const hasPitchers = !!(box?.home.pitchers.length || box?.away.pitchers.length);
  const hasTsStats = !!tsDetailStats;
  const hasOdds = !!liveOdds;
  const hasWpa = !!(wpaSeries && wpaSeries.length >= 2);

  const tabs: { key: TabKey; label: string; enabled: boolean; withTeamToggle: boolean }[] = [
    { key: "pbp", label: "중계", enabled: hasPbp, withTeamToggle: false },
    { key: "lineup", label: "라인업", enabled: hasLineup, withTeamToggle: true },
    { key: "batting", label: "타자 기록", enabled: hasLineup, withTeamToggle: true },
    { key: "pitching", label: "투수 기록", enabled: hasPitchers, withTeamToggle: true },
    { key: "ts-stats", label: "팀 스탯", enabled: hasTsStats, withTeamToggle: false },
    { key: "odds", label: "라이브 배당", enabled: hasOdds, withTeamToggle: false },
    { key: "wpa", label: "승률 곡선", enabled: hasWpa, withTeamToggle: false },
  ];

  const visibleTabs = tabs.filter((t) => t.enabled);
  if (visibleTabs.length === 0) return null;

  // 현재 탭이 disable 되면 첫 enable 탭으로
  const activeTab = visibleTabs.find((t) => t.key === tab)?.key ?? visibleTabs[0].key;
  const currentTabInfo = tabs.find((t) => t.key === activeTab)!;

  const team = box ? (side === "home" ? box.home : box.away) : null;
  const koName = (pid: number, fallback: string) =>
    playerNameKoBy?.[pid] ?? fallback;

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
      {/* 탭 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 sm:px-4 pt-3 pb-3 border-b border-neutral-100 dark:border-neutral-900">
        <div className="flex items-center gap-1 text-sm overflow-x-auto -mx-1 px-1 [&::-webkit-scrollbar]:hidden whitespace-nowrap">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg font-medium transition shrink-0 ${
                activeTab === t.key
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {currentTabInfo.withTeamToggle ? (
          <div className="inline-flex items-center rounded-lg bg-neutral-100 dark:bg-neutral-900 p-0.5 text-xs shrink-0">
            {(["away", "home"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`px-2.5 py-1 rounded-md transition ${
                  side === s
                    ? "bg-white dark:bg-neutral-800 font-semibold text-neutral-900 dark:text-white shadow-sm"
                    : "text-neutral-500"
                }`}
              >
                {s === "away" ? awayNameKo : homeNameKo}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="p-3 sm:p-4">
        {activeTab === "pbp" && pbp ? (
          <PbpView
            plays={pbp.plays}
            currentInning={pbp.currentInning}
            currentHalf={pbp.currentHalf}
            homeNameKo={homeNameKo}
            awayNameKo={awayNameKo}
            isLive={pbp.status === "LIVE"}
          />
        ) : activeTab === "lineup" && team ? (
          <LineupList batters={team.batters} koName={koName} />
        ) : activeTab === "batting" && team ? (
          <BattingTable batters={team.batters} koName={koName} />
        ) : activeTab === "pitching" && team ? (
          <PitchingTable pitchers={team.pitchers} koName={koName} />
        ) : activeTab === "ts-stats" && tsDetailStats ? (
          <EmbedBaseballTeamStats
            stats={tsDetailStats}
            homeNameKo={homeNameKo}
            awayNameKo={awayNameKo}
          />
        ) : activeTab === "odds" && liveOdds ? (
          <EmbedLiveOdds
            odds={liveOdds}
            homeNameKo={homeNameKo}
            awayNameKo={awayNameKo}
            history={initialOdds?.history}
          />
        ) : activeTab === "wpa" && wpaSeries ? (
          <BaseballWpaChart
            series={wpaSeries}
            homeNameKo={homeNameKo}
            awayNameKo={awayNameKo}
          />
        ) : null}
      </div>
    </section>
  );
}

/* ---------- 탭 1: 라인업 (선수 사진 + 시즌 통계) ---------- */

function LineupList({
  batters,
  koName,
}: {
  batters: BoxBatter[];
  koName: (pid: number, fallback: string) => string;
}) {
  const starters = batters.filter((b) => b.isStarter).slice(0, 9);
  if (starters.length === 0) {
    return (
      <p className="text-center text-xs text-neutral-500 py-6">
        라인업 발표 전입니다.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-neutral-100 dark:divide-neutral-900">
      {starters.map((b) => (
        <li key={b.pid} className="flex items-center gap-3 py-2">
          <span className="w-5 text-center text-xs font-bold tabular-nums text-neutral-400">
            {b.order ?? ""}
          </span>
          <Headshot pid={b.pid} alt={b.name} />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <Link
                href={`/players/mlb/${b.pid}`}
                className="text-sm font-semibold truncate hover:underline"
              >
                {koName(b.pid, b.name)}
              </Link>
              <span className="text-[10px] font-medium text-neutral-500 px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-900">
                {b.position}
              </span>
            </div>
            <div className="text-[11px] text-neutral-500 tabular-nums">
              시즌 {b.seasonAvg} · HR {b.seasonHr} · RBI {b.seasonRbi}
              {b.seasonOps !== "-" ? ` · OPS ${b.seasonOps}` : ""}
            </div>
          </div>
          {b.ab > 0 || b.bb > 0 || b.so > 0 ? (
            <div className="text-right shrink-0">
              <div className="text-xs font-bold tabular-nums">
                {b.h}-{b.ab}
              </div>
              <div className="text-[10px] text-neutral-500 tabular-nums">
                {b.rbi}타점{b.hr > 0 ? ` · ${b.hr}홈런` : ""}
              </div>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/* ---------- 탭 2: 타자 기록 ---------- */

function BattingTable({
  batters,
  koName,
}: {
  batters: BoxBatter[];
  koName: (pid: number, fallback: string) => string;
}) {
  const rows = [...batters].sort((a, b) => {
    if (a.isStarter !== b.isStarter) return a.isStarter ? -1 : 1;
    return (a.order ?? 99) - (b.order ?? 99);
  });
  if (rows.length === 0) {
    return (
      <p className="text-center text-xs text-neutral-500 py-6">
        타자 기록이 아직 없습니다.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
            <th className="text-left py-1.5 pr-2 font-medium">선수</th>
            <Th>AB</Th>
            <Th>R</Th>
            <Th>H</Th>
            <Th>RBI</Th>
            <Th>HR</Th>
            <Th>BB</Th>
            <Th>K</Th>
            <Th>AVG</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr
              key={b.pid}
              className="border-b border-neutral-100 dark:border-neutral-900"
            >
              <td className="py-1.5 pr-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] tabular-nums text-neutral-400 w-3 shrink-0">
                    {b.order ?? ""}
                  </span>
                  <Headshot pid={b.pid} alt={b.name} size="sm" />
                  <Link
                    href={`/players/mlb/${b.pid}`}
                    className="font-medium truncate hover:underline max-w-[120px]"
                  >
                    {koName(b.pid, b.name)}
                  </Link>
                  <span className="text-[10px] text-neutral-500 shrink-0">
                    {b.position}
                  </span>
                </div>
              </td>
              <Td>{b.ab}</Td>
              <Td>{b.r}</Td>
              <Td bold>{b.h}</Td>
              <Td>{b.rbi}</Td>
              <Td>{b.hr || ""}</Td>
              <Td>{b.bb || ""}</Td>
              <Td muted>{b.so || ""}</Td>
              <Td muted>{b.seasonAvg}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 탭 3: 투수 기록 ---------- */

function PitchingTable({
  pitchers,
  koName,
}: {
  pitchers: BoxPitcher[];
  koName: (pid: number, fallback: string) => string;
}) {
  if (pitchers.length === 0) {
    return (
      <p className="text-center text-xs text-neutral-500 py-6">
        투수 기록이 아직 없습니다.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
            <th className="text-left py-1.5 pr-2 font-medium">투수</th>
            <Th>IP</Th>
            <Th>H</Th>
            <Th>R</Th>
            <Th>ER</Th>
            <Th>BB</Th>
            <Th>K</Th>
            <Th>HR</Th>
            <Th>ERA</Th>
          </tr>
        </thead>
        <tbody>
          {pitchers.map((p) => (
            <tr
              key={p.pid}
              className="border-b border-neutral-100 dark:border-neutral-900"
            >
              <td className="py-1.5 pr-2">
                <div className="flex items-center gap-1.5">
                  <Headshot pid={p.pid} alt={p.name} size="sm" />
                  <Link
                    href={`/players/mlb/${p.pid}`}
                    className="font-medium truncate hover:underline max-w-[120px]"
                  >
                    {koName(p.pid, p.name)}
                  </Link>
                  {p.isStarter ? (
                    <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 shrink-0">
                      SP
                    </span>
                  ) : null}
                </div>
              </td>
              <Td bold>{p.ip}</Td>
              <Td>{p.h}</Td>
              <Td>{p.r}</Td>
              <Td>{p.er}</Td>
              <Td>{p.bb || ""}</Td>
              <Td>{p.so || ""}</Td>
              <Td>{p.hr || ""}</Td>
              <Td muted>{p.seasonEra}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 탭: 외부 카드 임베드 (border 한 겹 제거) ---------- */

function EmbedBaseballTeamStats(props: {
  stats: unknown;
  homeNameKo: string;
  awayNameKo: string;
}) {
  return (
    <div className="[&>section]:border-0 [&>section]:p-0 [&>section]:rounded-none">
      <BaseballTeamStatsCard {...props} />
    </div>
  );
}

function EmbedLiveOdds(props: {
  odds: LiveOdds;
  homeNameKo: string;
  awayNameKo: string;
  history?: Array<{ fetchedAt: number; home: number | null; away: number | null }>;
}) {
  return (
    <div className="[&>section]:border-0 [&>section]:p-0 [&>section]:rounded-none [&>section]:bg-transparent">
      <LiveOddsCard
        odds={props.odds}
        homeNameKo={props.homeNameKo}
        awayNameKo={props.awayNameKo}
        hasDraw={false}
        oddsHistory={props.history
          ?.filter(
            (p): p is { fetchedAt: number; home: number; away: number } =>
              p.home != null && p.away != null,
          )
          .map((p) => ({
            fetchedAt: p.fetchedAt,
            home: p.home,
            draw: null,
            away: p.away,
          }))}
      />
    </div>
  );
}

/* ---------- 공용 ---------- */

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-right px-1.5 py-1.5 font-medium tabular-nums">
      {children}
    </th>
  );
}

function Td({
  children,
  bold,
  muted,
}: {
  children: React.ReactNode;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={`text-right tabular-nums px-1.5 py-1.5 ${
        bold ? "font-bold" : ""
      } ${muted ? "text-neutral-500" : ""}`}
    >
      {children}
    </td>
  );
}

/* ---------- 탭: 중계 (네이버 스타일 이닝/타자 PBP) ---------- */

interface BatterCard {
  batter: string;
  pitcher: string;
  pitches: PbpPlay[];
  pickoffs: PbpPlay[];
  resultText: string | null;
  resultIsScoring: boolean;
  awayScore: number;
  homeScore: number;
}

interface HalfBlock {
  inning: number;
  half: "top" | "bottom";
  batterCards: BatterCard[];
}

function groupPbp(plays: PbpPlay[]): HalfBlock[] {
  const halves: HalfBlock[] = [];
  let currentHalf: HalfBlock | null = null;
  let currentCard: BatterCard | null = null;
  for (const p of plays) {
    if (p.slug === "start-inning") {
      currentHalf = { inning: p.inning, half: p.half, batterCards: [] };
      halves.push(currentHalf);
      currentCard = null;
      continue;
    }
    if (p.slug === "end-inning" || p.slug === "end-batterpitcher") {
      currentCard = null;
      continue;
    }
    if (p.slug === "start-batterpitcher") {
      // textKo "투수 X → 타자 Y" 우선, fallback "X pitches to Y"
      const ko = p.textKo.match(/^투수\s+(.+?)\s+→\s+타자\s+(.+)$/);
      const en = p.text.match(/^(.+?)\s+pitches to\s+(.+)$/i);
      const pitcher = (ko?.[1] ?? en?.[1] ?? "").trim();
      const batter = (ko?.[2] ?? en?.[2] ?? "?").trim();
      currentCard = {
        batter,
        pitcher,
        pitches: [],
        pickoffs: [],
        resultText: null,
        resultIsScoring: false,
        awayScore: p.awayScore,
        homeScore: p.homeScore,
      };
      if (!currentHalf) {
        currentHalf = { inning: p.inning, half: p.half, batterCards: [] };
        halves.push(currentHalf);
      }
      currentHalf.batterCards.push(currentCard);
      continue;
    }
    if (!currentCard) continue;
    if (p.slug === "play-result") {
      currentCard.resultText = p.textKo || p.text;
      currentCard.resultIsScoring = p.scoringPlay;
      currentCard.awayScore = p.awayScore;
      currentCard.homeScore = p.homeScore;
      continue;
    }
    if (p.slug === "pick-off") {
      currentCard.pickoffs.push(p);
      continue;
    }
    // pitch / 결과 외 plays (ball, strike-*, foul-ball, hit slugs)
    currentCard.pitches.push(p);
  }
  return halves;
}

function PbpView({
  plays,
  currentInning,
  currentHalf,
  homeNameKo,
  awayNameKo,
  isLive,
}: {
  plays: PbpPlay[];
  currentInning: number;
  currentHalf: "top" | "bottom" | null;
  homeNameKo: string;
  awayNameKo: string;
  isLive: boolean;
}) {
  const halves = groupPbp(plays);
  // 진행된 이닝 set
  const innings = Array.from(new Set(halves.map((h) => h.inning))).sort((a, b) => a - b);
  const maxInning = innings.length > 0 ? innings[innings.length - 1] : 1;
  // 득점 탭 (scoring plays) + 1회~maxInning
  const [selected, setSelected] = useState<number | "scoring">(currentInning || maxInning);

  // 선택 이닝의 half blocks (top → bottom 순)
  const blocks =
    selected === "scoring"
      ? halves
          .map((h) => ({
            ...h,
            batterCards: h.batterCards.filter(
              (c) => c.resultIsScoring || (c.resultText && /득점|홈런|타점/.test(c.resultText)),
            ),
          }))
          .filter((h) => h.batterCards.length > 0)
      : halves.filter((h) => h.inning === selected);

  return (
    <div className="space-y-4">
      {/* 이닝 chip 탭 */}
      <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 [&::-webkit-scrollbar]:hidden">
        <button
          onClick={() => setSelected("scoring")}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition ${
            selected === "scoring"
              ? "bg-blue-500 text-white"
              : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          }`}
        >
          득점
          <span className="inline-block w-1.5 h-1.5 ml-1 rounded-full bg-rose-500 align-middle" />
        </button>
        {innings.map((n) => (
          <button
            key={n}
            onClick={() => setSelected(n)}
            className={`shrink-0 w-10 h-8 rounded-full text-xs font-bold tabular-nums transition ${
              selected === n
                ? "bg-blue-500 text-white"
                : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            }`}
          >
            {n}회
          </button>
        ))}
      </div>

      {/* half block (top → bottom) */}
      {blocks.length === 0 ? (
        <p className="text-center text-xs text-neutral-500 py-6">
          {selected === "scoring" ? "득점 기록 없음." : "이 이닝의 기록이 없습니다."}
        </p>
      ) : (
        blocks.map((b) => (
          <HalfSection
            key={`${b.inning}-${b.half}`}
            block={b}
            homeNameKo={homeNameKo}
            awayNameKo={awayNameKo}
            highlight={isLive && b.inning === currentInning && b.half === currentHalf}
          />
        ))
      )}
    </div>
  );
}

function HalfSection({
  block,
  homeNameKo,
  awayNameKo,
  highlight,
}: {
  block: HalfBlock;
  homeNameKo: string;
  awayNameKo: string;
  highlight: boolean;
}) {
  const attackTeam = block.half === "top" ? awayNameKo : homeNameKo;
  const halfLabel = block.half === "top" ? "초" : "말";
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-bold">
        <span>
          {block.inning}회{halfLabel} {attackTeam} 공격
        </span>
        {highlight ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-rose-600 bg-rose-100 dark:bg-rose-950">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            진행
          </span>
        ) : null}
      </div>
      <div className="space-y-2">
        {block.batterCards.map((c, i) => (
          <BatterCardView key={i} card={c} />
        ))}
      </div>
    </section>
  );
}

function BatterCardView({ card }: { card: BatterCard }) {
  const [open, setOpen] = useState(true);
  const hasPitches = card.pitches.length > 0;
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-hidden">
      {/* 헤더 — 타자명 + 결과. 모바일 좁은 width 에서 이름 1글자 truncate 방지:
          이름/타석 라벨/chevron 은 한 줄, 결과는 새 줄 (모바일) / 한 줄 (sm+) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 sm:px-4 py-2.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
      >
        <div className="flex items-center sm:items-baseline gap-2">
          <span className="text-base font-bold truncate min-w-0 shrink">
            {card.batter}
          </span>
          <span className="text-xs text-neutral-500 shrink-0">타석</span>
          {/* desktop: 같은 줄 결과 */}
          {card.resultText ? (
            <span
              className={`hidden sm:inline-block text-xs font-semibold truncate flex-1 text-right ${
                card.resultIsScoring
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-neutral-700 dark:text-neutral-300"
              }`}
            >
              {card.resultText}
            </span>
          ) : (
            <span className="hidden sm:inline-block text-xs text-neutral-400 flex-1 text-right">
              진행 중…
            </span>
          )}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`shrink-0 text-neutral-400 transition-transform ml-auto sm:ml-0 ${
              open ? "rotate-180" : ""
            }`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        {/* mobile: 새 줄 결과 */}
        {card.resultText ? (
          <div
            className={`sm:hidden text-xs font-semibold mt-1 ${
              card.resultIsScoring
                ? "text-rose-600 dark:text-rose-400"
                : "text-neutral-700 dark:text-neutral-300"
            }`}
          >
            {card.resultText}
          </div>
        ) : (
          <div className="sm:hidden text-xs text-neutral-400 mt-1">
            진행 중…
          </div>
        )}
      </button>
      {/* body — pitches + pickoffs */}
      {open && hasPitches ? (
        <div className="px-3 sm:px-4 pb-3 pt-1 border-t border-neutral-100 dark:border-neutral-900">
          <ul className="space-y-1 mt-1">
            {card.pitches.map((p, i) => (
              <PitchRow key={p.id} pitch={p} num={i + 1} />
            ))}
          </ul>
          {card.pickoffs.length > 0 ? (
            <div className="mt-3 pt-2 border-t border-neutral-100 dark:border-neutral-900">
              <div className="text-[11px] font-medium text-neutral-500 mb-1">
                {card.pickoffs.length === 1 ? "1루견제" : `견제 ${card.pickoffs.length}회`}
              </div>
              <ul className="space-y-1">
                {card.pickoffs.map((p, i) => (
                  <PitchRow key={p.id} pitch={p} num={i + 1} />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PitchRow({ pitch, num }: { pitch: PbpPlay; num: number }) {
  // 색 + 라벨
  const cls = pitchDotClass(pitch.slug);
  const label = pitchShortLabel(pitch);
  return (
    <li className="flex items-center gap-2 text-xs">
      <span
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white shrink-0 ${cls}`}
      >
        {num}
      </span>
      <span className="text-neutral-700 dark:text-neutral-300">{label}</span>
    </li>
  );
}

function pitchDotClass(slug: string): string {
  switch (slug) {
    case "ball":
    case "ball---confirmed":
      return "bg-emerald-500";
    case "strike-looking":
    case "strike-swinging":
    case "foul-ball":
      return "bg-amber-500";
    case "pick-off":
      return "bg-rose-500";
    default:
      // play-result / hit slugs → 타격 (파랑)
      return "bg-blue-500";
  }
}

function pitchShortLabel(p: PbpPlay): string {
  switch (p.slug) {
    case "ball":
    case "ball---confirmed":
      return "볼";
    case "strike-looking":
      return "스탠딩 스트라이크";
    case "strike-swinging":
      return "헛스윙";
    case "foul-ball":
      return "파울";
    case "pick-off":
      return "견제";
    default:
      return "타격";
  }
}

function Headshot({
  pid,
  alt,
  size = "md",
}: {
  pid: number;
  alt: string;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? 28 : 40;
  const cls =
    size === "sm"
      ? "w-7 h-7 rounded-full object-cover bg-neutral-100 dark:bg-neutral-900 shrink-0"
      : "w-10 h-10 rounded-full object-cover bg-neutral-100 dark:bg-neutral-900 shrink-0";
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={headshotUrl(pid)}
      alt={alt}
      width={dim}
      height={dim}
      loading="lazy"
      className={cls}
    />
  );
}
