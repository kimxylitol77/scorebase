// 야구 PREVIEW 매치 통합 인사이트 카드 — 네이버 스타일 5탭.
// 사용처: src/app/articles/[slug]/page.tsx 의 KBO/NPB/MLB PREVIEW 글 상단.
//
// 5탭: 선발 매치업 / 시즌 누적 / 최근 5경기 / 상대 전적 (H2H) / AI 예측.
// SSR 데이터만 사용 (polling 없음). 새로고침으로 갱신.

"use client";

import Link from "next/link";
import { useState } from "react";

export interface PreviewStarterInfo {
  name: string;
  pid?: number | string | null;
  hand?: "L" | "R" | string | null;
  era?: number | null;
  whip?: number | null;
  k9?: number | null;
  wins?: number | null;
  losses?: number | null;
  ip?: string | number | null;
}

export interface PreviewSeasonSide {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  runsFor: number;
  runsAgainst: number;
  winPct: number;
  avgRunsFor: number;
  avgRunsAgainst: number;
  rank?: number | null;
}

export interface PreviewRecentMatchRow {
  matchId: number;
  date: string;
  opponentNameKo: string;
  isHome: boolean;
  myScore: number;
  oppScore: number;
  result: "W" | "L" | "D";
}

export interface PreviewH2HRecentRow {
  matchId: number;
  date: string;
  homeNameKo: string;
  awayNameKo: string;
  homeScore: number;
  awayScore: number;
}

export interface PreviewInningProb {
  inning: number;
  homeRuns: number;
  awayRuns: number;
}

export interface BaseballPreviewInsightTabsProps {
  league: "KBO" | "NPB" | "MLB";
  homeNameKo: string;
  awayNameKo: string;
  homeLogo: string | null;
  awayLogo: string | null;
  startTime: string;
  starters: {
    home: PreviewStarterInfo | null;
    away: PreviewStarterInfo | null;
  };
  starterPhotos: {
    home: string | null;
    away: string | null;
  };
  starterPlayerHref: {
    home: string | null;
    away: string | null;
  };
  season: {
    home: PreviewSeasonSide;
    away: PreviewSeasonSide;
    totalTeams: number;
  };
  recent: {
    home: PreviewRecentMatchRow[];
    away: PreviewRecentMatchRow[];
    homePpg: number;
    awayPpg: number;
    homeAvgFor: number;
    awayAvgFor: number;
    homeAvgAgainst: number;
    awayAvgAgainst: number;
  };
  h2h: {
    total: number;
    homeWins: number;
    awayWins: number;
    draws: number;
    recent: PreviewH2HRecentRow[];
  };
  aiPredict: {
    elo: { home: number; away: number };
    winProb: { home: number; away: number };
    inningProbs?: PreviewInningProb[];
    totalExpectedRuns?: { team1: number; team2: number };
  };
}

type TabKey = "starters" | "season" | "recent" | "h2h" | "predict";

const TAB_LABEL: Record<TabKey, string> = {
  starters: "선발 매치업",
  season: "시즌 누적",
  recent: "최근 5경기",
  h2h: "상대 전적",
  predict: "AI 예측",
};

const SOURCE_LABEL: Record<"KBO" | "NPB" | "MLB", string> = {
  KBO: "KBO 공식 · statiz",
  NPB: "NPB.jp 공식",
  MLB: "MLB Stats API",
};

function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

function fmt(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(digits);
}

function fmtInt(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toString();
}

export default function BaseballPreviewInsightTabs(
  props: BaseballPreviewInsightTabsProps,
) {
  const [tab, setTab] = useState<TabKey>("starters");
  const [recentSide, setRecentSide] = useState<"away" | "home">("away");

  const tabs: TabKey[] = ["starters", "season", "recent", "h2h", "predict"];
  const activeTab = tab;

  return (
    <section className="my-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.04] overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 sm:px-5 py-3 border-b border-neutral-100 dark:border-neutral-900 flex items-center gap-2">
        <span className="text-xs font-bold tracking-[0.18em] uppercase text-neutral-500">
          ⚾ 매치 인사이트
        </span>
        <span className="text-neutral-300 dark:text-neutral-700">·</span>
        <span className="text-[10px] font-medium text-neutral-400">
          {SOURCE_LABEL[props.league]}
        </span>
      </div>

      {/* 탭 바 */}
      <div className="px-3 sm:px-4 pt-3 pb-3 border-b border-neutral-100 dark:border-neutral-900">
        <div className="flex items-center gap-1 text-sm overflow-x-auto -mx-1 px-1 [&::-webkit-scrollbar]:hidden whitespace-nowrap">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg font-medium transition shrink-0 ${
                activeTab === t
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              }`}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {activeTab === "starters" && (
          <StartersPanel
            league={props.league}
            homeNameKo={props.homeNameKo}
            awayNameKo={props.awayNameKo}
            starters={props.starters}
            photos={props.starterPhotos}
            hrefs={props.starterPlayerHref}
          />
        )}
        {activeTab === "season" && (
          <SeasonPanel
            home={props.season.home}
            away={props.season.away}
            totalTeams={props.season.totalTeams}
            homeNameKo={props.homeNameKo}
            awayNameKo={props.awayNameKo}
          />
        )}
        {activeTab === "recent" && (
          <RecentPanel
            side={recentSide}
            setSide={setRecentSide}
            homeNameKo={props.homeNameKo}
            awayNameKo={props.awayNameKo}
            homeRows={props.recent.home}
            awayRows={props.recent.away}
            homePpg={props.recent.homePpg}
            awayPpg={props.recent.awayPpg}
            homeAvgFor={props.recent.homeAvgFor}
            awayAvgFor={props.recent.awayAvgFor}
            homeAvgAgainst={props.recent.homeAvgAgainst}
            awayAvgAgainst={props.recent.awayAvgAgainst}
          />
        )}
        {activeTab === "h2h" && (
          <H2HPanel
            homeNameKo={props.homeNameKo}
            awayNameKo={props.awayNameKo}
            total={props.h2h.total}
            homeWins={props.h2h.homeWins}
            awayWins={props.h2h.awayWins}
            draws={props.h2h.draws}
            recent={props.h2h.recent}
          />
        )}
        {activeTab === "predict" && (
          <PredictPanel
            homeNameKo={props.homeNameKo}
            awayNameKo={props.awayNameKo}
            elo={props.aiPredict.elo}
            winProb={props.aiPredict.winProb}
            inningProbs={props.aiPredict.inningProbs}
            totalExpectedRuns={props.aiPredict.totalExpectedRuns}
          />
        )}
      </div>
    </section>
  );
}

/* ============================== 탭 1: 선발 매치업 ============================== */

function StartersPanel({
  league,
  homeNameKo,
  awayNameKo,
  starters,
  photos,
  hrefs,
}: {
  league: "KBO" | "NPB" | "MLB";
  homeNameKo: string;
  awayNameKo: string;
  starters: { home: PreviewStarterInfo | null; away: PreviewStarterInfo | null };
  photos: { home: string | null; away: string | null };
  hrefs: { home: string | null; away: string | null };
}) {
  if (!starters.home && !starters.away) {
    return (
      <div className="text-center text-sm text-neutral-500 py-8">
        선발 투수가 아직 발표되지 않았습니다.
      </div>
    );
  }
  const homeBetterEra =
    starters.home?.era != null &&
    starters.away?.era != null &&
    starters.home.era < starters.away.era;
  const awayBetterEra =
    starters.home?.era != null &&
    starters.away?.era != null &&
    starters.away.era < starters.home.era;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <StarterCard
        starter={starters.away}
        teamName={awayNameKo}
        side="원정"
        highlight={awayBetterEra}
        league={league}
        photo={photos.away}
        href={hrefs.away}
      />
      <StarterCard
        starter={starters.home}
        teamName={homeNameKo}
        side="홈"
        highlight={homeBetterEra}
        league={league}
        photo={photos.home}
        href={hrefs.home}
      />
    </div>
  );
}

function StarterCard({
  starter,
  teamName,
  side,
  highlight,
  photo,
  href,
}: {
  starter: PreviewStarterInfo | null;
  teamName: string;
  side: "홈" | "원정";
  highlight: boolean;
  league: "KBO" | "NPB" | "MLB";
  photo: string | null;
  href: string | null;
}) {
  if (!starter) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800 px-3 py-3 text-sm">
        <div className="text-[11px] text-neutral-500">{side} · {teamName}</div>
        <div className="mt-1 text-neutral-400">선발 미정</div>
      </div>
    );
  }
  const handLabel =
    starter.hand === "L" ? "좌완" : starter.hand === "R" ? "우완" : "";
  const hasAnyStat =
    starter.era != null || starter.whip != null || starter.k9 != null;
  const nameNode = href ? (
    <Link
      href={href}
      className="hover:underline hover:text-blue-600 dark:hover:text-blue-400 transition"
    >
      {starter.name}
    </Link>
  ) : (
    starter.name
  );

  return (
    <div
      className={`rounded-lg border px-3 py-3 ${
        highlight
          ? "border-emerald-300 dark:border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-500/5"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="flex items-start gap-3">
        <PhotoBlock photo={photo} name={starter.name} href={href} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between text-[11px] text-neutral-500">
            <span className="truncate">
              {side} · {teamName}
            </span>
            {handLabel && <span className="shrink-0">{handLabel}</span>}
          </div>
          <div className="mt-0.5 font-semibold tracking-tight truncate">
            {nameNode}
          </div>
          {(starter.wins != null && starter.losses != null) || starter.ip ? (
            <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
              {starter.wins != null && starter.losses != null && (
                <span className="tabular-nums">
                  {starter.wins}승 {starter.losses}패
                </span>
              )}
              {starter.ip && (
                <span className="tabular-nums">{starter.ip}IP</span>
              )}
            </div>
          ) : null}
        </div>
      </div>
      {hasAnyStat && (
        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
          <StatCell label="ERA" value={fmt(starter.era, 2)} accent />
          <StatCell label="WHIP" value={fmt(starter.whip, 2)} />
          <StatCell label="K/9" value={fmt(starter.k9, 1)} />
        </div>
      )}
    </div>
  );
}

function PhotoBlock({
  photo,
  name,
  href,
}: {
  photo: string | null;
  name: string;
  href: string | null;
}) {
  const inner = photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo}
      alt={name}
      className="w-14 h-14 rounded-full object-cover bg-neutral-100 dark:bg-neutral-900 shrink-0"
      loading="lazy"
    />
  ) : (
    <div className="w-14 h-14 rounded-full bg-neutral-100 dark:bg-neutral-900 inline-flex items-center justify-center text-base font-bold text-neutral-400 shrink-0">
      {name.slice(0, 1)}
    </div>
  );
  return href ? (
    <Link href={href} className="shrink-0 hover:opacity-80 transition">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function StatCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded px-1.5 py-1 ${
        accent
          ? "bg-emerald-50 dark:bg-emerald-500/10"
          : "bg-neutral-50 dark:bg-neutral-900"
      }`}
    >
      <div className="text-[9px] uppercase tracking-wider text-neutral-400">
        {label}
      </div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
    </div>
  );
}

/* ============================== 탭 2: 시즌 누적 ============================== */

function SeasonPanel({
  home,
  away,
  totalTeams,
  homeNameKo,
  awayNameKo,
}: {
  home: PreviewSeasonSide;
  away: PreviewSeasonSide;
  totalTeams: number;
  homeNameKo: string;
  awayNameKo: string;
}) {
  if (home.played === 0 && away.played === 0) {
    return (
      <div className="text-center text-sm text-neutral-500 py-8">
        시즌 통계가 아직 집계되지 않았습니다.
      </div>
    );
  }
  const rows: Array<{
    label: string;
    home: string;
    away: string;
    homeBetter: boolean;
    awayBetter: boolean;
  }> = [
    {
      label: "순위",
      home: home.rank ? `${home.rank}/${totalTeams}` : "—",
      away: away.rank ? `${away.rank}/${totalTeams}` : "—",
      homeBetter: !!(home.rank && away.rank && home.rank < away.rank),
      awayBetter: !!(home.rank && away.rank && away.rank < home.rank),
    },
    {
      label: "경기",
      home: fmtInt(home.played),
      away: fmtInt(away.played),
      homeBetter: false,
      awayBetter: false,
    },
    {
      label: "승-패",
      home: `${home.wins}-${home.losses}`,
      away: `${away.wins}-${away.losses}`,
      homeBetter: home.wins > away.wins,
      awayBetter: away.wins > home.wins,
    },
    {
      label: "승률",
      home: pct(home.winPct, 1),
      away: pct(away.winPct, 1),
      homeBetter: home.winPct > away.winPct,
      awayBetter: away.winPct > home.winPct,
    },
    {
      label: "경기당 득점",
      home: fmt(home.avgRunsFor, 2),
      away: fmt(away.avgRunsFor, 2),
      homeBetter: home.avgRunsFor > away.avgRunsFor,
      awayBetter: away.avgRunsFor > home.avgRunsFor,
    },
    {
      label: "경기당 실점",
      home: fmt(home.avgRunsAgainst, 2),
      away: fmt(away.avgRunsAgainst, 2),
      homeBetter: home.avgRunsAgainst < away.avgRunsAgainst,
      awayBetter: away.avgRunsAgainst < home.avgRunsAgainst,
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-3 items-center text-center text-xs font-bold tracking-tight mb-2">
        <div className="truncate text-blue-600 dark:text-blue-400">
          {awayNameKo}
        </div>
        <div className="text-neutral-400 text-[10px]">지표</div>
        <div className="truncate text-rose-600 dark:text-rose-400">
          {homeNameKo}
        </div>
      </div>
      <div className="divide-y divide-neutral-100 dark:divide-neutral-900">
        {rows.map((r) => (
          <div
            key={r.label}
            className="grid grid-cols-3 items-center text-center py-2 text-sm"
          >
            <div
              className={`tabular-nums ${
                r.awayBetter
                  ? "font-bold text-blue-600 dark:text-blue-400"
                  : "text-neutral-600 dark:text-neutral-300"
              }`}
            >
              {r.away}
            </div>
            <div className="text-[11px] text-neutral-400">{r.label}</div>
            <div
              className={`tabular-nums ${
                r.homeBetter
                  ? "font-bold text-rose-600 dark:text-rose-400"
                  : "text-neutral-600 dark:text-neutral-300"
              }`}
            >
              {r.home}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================== 탭 3: 최근 5경기 ============================== */

function RecentPanel({
  side,
  setSide,
  homeNameKo,
  awayNameKo,
  homeRows,
  awayRows,
  homePpg,
  awayPpg,
  homeAvgFor,
  awayAvgFor,
  homeAvgAgainst,
  awayAvgAgainst,
}: {
  side: "away" | "home";
  setSide: (s: "away" | "home") => void;
  homeNameKo: string;
  awayNameKo: string;
  homeRows: PreviewRecentMatchRow[];
  awayRows: PreviewRecentMatchRow[];
  homePpg: number;
  awayPpg: number;
  homeAvgFor: number;
  awayAvgFor: number;
  homeAvgAgainst: number;
  awayAvgAgainst: number;
}) {
  const rows = side === "home" ? homeRows : awayRows;
  const ppg = side === "home" ? homePpg : awayPpg;
  const avgFor = side === "home" ? homeAvgFor : awayAvgFor;
  const avgAgainst = side === "home" ? homeAvgAgainst : awayAvgAgainst;

  return (
    <div>
      <div className="inline-flex items-center rounded-lg bg-neutral-100 dark:bg-neutral-900 p-0.5 text-xs mb-3">
        {(["away", "home"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`px-3 py-1 rounded-md transition ${
              side === s
                ? "bg-white dark:bg-neutral-800 font-semibold text-neutral-900 dark:text-white shadow-sm"
                : "text-neutral-500"
            }`}
          >
            {s === "away" ? awayNameKo : homeNameKo}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="text-center text-sm text-neutral-500 py-8">
          최근 경기 데이터가 부족합니다.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <SummaryCell label="경기당 승점" value={fmt(ppg, 2)} />
            <SummaryCell label="경기당 득점" value={fmt(avgFor, 2)} />
            <SummaryCell label="경기당 실점" value={fmt(avgAgainst, 2)} />
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-900">
            {rows.map((r) => (
              <li
                key={r.matchId}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ResultDot result={r.result} />
                  <span className="text-[11px] text-neutral-400 shrink-0 w-16 tabular-nums">
                    {r.date}
                  </span>
                  <span className="text-[11px] text-neutral-400 shrink-0">
                    {r.isHome ? "vs" : "@"}
                  </span>
                  <span className="truncate font-medium text-neutral-700 dark:text-neutral-200">
                    {r.opponentNameKo}
                  </span>
                </div>
                <span className="tabular-nums font-semibold shrink-0 ml-2">
                  {r.myScore} : {r.oppScore}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 px-3 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-neutral-400">
        {label}
      </div>
      <div className="text-base font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function ResultDot({ result }: { result: "W" | "L" | "D" }) {
  const cls =
    result === "W"
      ? "bg-emerald-500"
      : result === "L"
        ? "bg-rose-500"
        : "bg-neutral-400";
  return (
    <span
      className={`inline-block w-5 h-5 rounded-full ${cls} text-white text-[10px] font-bold flex items-center justify-center shrink-0`}
    >
      {result}
    </span>
  );
}

/* ============================== 탭 4: 상대 전적 (H2H) ============================== */

function H2HPanel({
  homeNameKo,
  awayNameKo,
  total,
  homeWins,
  awayWins,
  draws,
  recent,
}: {
  homeNameKo: string;
  awayNameKo: string;
  total: number;
  homeWins: number;
  awayWins: number;
  draws: number;
  recent: PreviewH2HRecentRow[];
}) {
  if (total === 0) {
    return (
      <div className="text-center text-sm text-neutral-500 py-8">
        두 팀의 최근 상대 전적이 없습니다.
      </div>
    );
  }
  const homePct = total > 0 ? homeWins / total : 0;
  const awayPct = total > 0 ? awayWins / total : 0;
  const drawPct = total > 0 ? draws / total : 0;

  return (
    <div>
      <div className="text-center text-xs text-neutral-400 mb-2">
        최근 {total}경기
      </div>
      <div className="flex items-center justify-center gap-3 mb-3 text-sm font-semibold">
        <span className="text-rose-600 dark:text-rose-400">
          {homeNameKo} {homeWins}승
        </span>
        {draws > 0 && (
          <span className="text-neutral-500">{draws}무</span>
        )}
        <span className="text-blue-600 dark:text-blue-400">
          {awayWins}승 {awayNameKo}
        </span>
      </div>
      {/* 승률 바 */}
      <div className="h-2 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-800 flex mb-4">
        {homePct > 0 && (
          <div
            className="bg-rose-500 dark:bg-rose-400"
            style={{ width: `${homePct * 100}%` }}
          />
        )}
        {drawPct > 0 && (
          <div
            className="bg-neutral-400"
            style={{ width: `${drawPct * 100}%` }}
          />
        )}
        {awayPct > 0 && (
          <div
            className="bg-blue-500 dark:bg-blue-400"
            style={{ width: `${awayPct * 100}%` }}
          />
        )}
      </div>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-900">
        {recent.map((r) => (
          <li
            key={r.matchId}
            className="flex items-center justify-between py-2 text-sm"
          >
            <span className="text-[11px] text-neutral-400 shrink-0 w-16 tabular-nums">
              {r.date}
            </span>
            <div className="flex items-center gap-2 flex-1 justify-center text-center min-w-0">
              <span className="truncate text-neutral-700 dark:text-neutral-200">
                {r.homeNameKo}
              </span>
              <span className="tabular-nums font-semibold shrink-0">
                {r.homeScore} : {r.awayScore}
              </span>
              <span className="truncate text-neutral-700 dark:text-neutral-200">
                {r.awayNameKo}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============================== 탭 5: AI 예측 ============================== */

function PredictPanel({
  homeNameKo,
  awayNameKo,
  elo,
  winProb,
  inningProbs,
  totalExpectedRuns,
}: {
  homeNameKo: string;
  awayNameKo: string;
  elo: { home: number; away: number };
  winProb: { home: number; away: number };
  inningProbs?: PreviewInningProb[];
  totalExpectedRuns?: { team1: number; team2: number };
}) {
  const total = winProb.home + winProb.away;
  const homePct = total > 0 ? winProb.home / total : 0.5;
  const awayPct = 1 - homePct;
  const eloDiff = elo.home - elo.away;

  return (
    <div className="space-y-5">
      {/* 승률 추정 */}
      <div>
        <div className="text-xs font-bold tracking-tight text-neutral-700 dark:text-neutral-200 mb-2">
          승률 추정
        </div>
        <div className="flex items-center justify-between text-sm font-semibold mb-1.5">
          <span className="text-blue-600 dark:text-blue-400">
            {awayNameKo} {pct(awayPct, 1)}
          </span>
          <span className="text-rose-600 dark:text-rose-400">
            {pct(homePct, 1)} {homeNameKo}
          </span>
        </div>
        <div className="h-3 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-800 flex">
          <div
            className="bg-blue-500 dark:bg-blue-400"
            style={{ width: `${awayPct * 100}%` }}
          />
          <div
            className="bg-rose-500 dark:bg-rose-400"
            style={{ width: `${homePct * 100}%` }}
          />
        </div>
      </div>

      {/* Elo */}
      <div>
        <div className="text-xs font-bold tracking-tight text-neutral-700 dark:text-neutral-200 mb-2">
          Elo 레이팅
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-neutral-400">
              {awayNameKo}
            </div>
            <div className="font-bold tabular-nums text-blue-600 dark:text-blue-400 mt-0.5">
              {Math.round(elo.away)}
            </div>
          </div>
          <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-neutral-400">
              {homeNameKo}
            </div>
            <div className="font-bold tabular-nums text-rose-600 dark:text-rose-400 mt-0.5">
              {Math.round(elo.home)}
            </div>
          </div>
        </div>
        <div className="text-[11px] text-neutral-400 mt-1.5">
          격차 {Math.abs(Math.round(eloDiff))}점 ·{" "}
          {eloDiff > 0 ? homeNameKo : awayNameKo} 우세
        </div>
      </div>

      {/* 이닝별 득점 확률 (있을 때만) */}
      {inningProbs && inningProbs.length > 0 && (
        <div>
          <div className="text-xs font-bold tracking-tight text-neutral-700 dark:text-neutral-200 mb-2">
            이닝별 예상 득점 (Poisson)
          </div>
          <div className="grid grid-cols-9 gap-1">
            {inningProbs.slice(0, 9).map((p) => (
              <div
                key={p.inning}
                className="rounded bg-neutral-50 dark:bg-neutral-900 px-1 py-1 text-center"
              >
                <div className="text-[9px] text-neutral-400">{p.inning}회</div>
                <div className="text-[10px] tabular-nums text-blue-600 dark:text-blue-400 font-semibold">
                  {p.awayRuns.toFixed(1)}
                </div>
                <div className="text-[10px] tabular-nums text-rose-600 dark:text-rose-400 font-semibold">
                  {p.homeRuns.toFixed(1)}
                </div>
              </div>
            ))}
          </div>
          {totalExpectedRuns && (
            <div className="text-[11px] text-neutral-400 mt-2 text-center">
              총 예상 득점 — {awayNameKo}{" "}
              <span className="font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                {totalExpectedRuns.team2.toFixed(2)}
              </span>{" "}
              · {homeNameKo}{" "}
              <span className="font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                {totalExpectedRuns.team1.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
