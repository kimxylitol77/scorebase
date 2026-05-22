// 메인 페이지용 시즌 인사이트 — 데이터 기반 자연어 분석.
// 풍부한 텍스트로 SEO 효과 + 시각적으로도 정보 밀도 높게.

import { prisma } from "@/lib/db";
import Link from "next/link";
import LeagueBadge from "./LeagueBadge";
import { calcStandings } from "@/lib/predict/standings";
import { calcEloTable, getElo } from "@/lib/predict/elo";
import { calcWinProbability } from "@/lib/predict/win-probability";
import { runMonteCarlo } from "@/lib/predict/monte-carlo";
import type { PredictMatch } from "@/lib/predict/types";
import { toKoreanTeamName } from "@/lib/team-names";

interface Props {
  league:
    | "EPL"
    | "NBA"
    | "NHL"
    | "MLB"
    | "LALIGA"
    | "BUNDESLIGA"
    | "SERIE_A"
    | "LIGUE_1"
    | "MLS"
    | "UCL";
}

const LEAGUE_INFO: Record<
  Props["league"],
  { name: string; subtitle: string; relegationCount: number; showDraw: boolean }
> = {
  EPL: {
    name: "프리미어리그",
    subtitle: "English Premier League · 2025-26 시즌",
    relegationCount: 3,
    showDraw: true,
  },
  NBA: {
    name: "NBA",
    subtitle: "National Basketball Association · 2025-26 시즌",
    relegationCount: 0,
    showDraw: false,
  },
  NHL: {
    name: "NHL",
    subtitle: "National Hockey League · 2025-26 시즌",
    relegationCount: 0,
    showDraw: false,
  },
  MLB: {
    name: "MLB",
    subtitle: "Major League Baseball · 2026 시즌",
    relegationCount: 0,
    showDraw: false,
  },
  LALIGA: {
    name: "라리가",
    subtitle: "La Liga · 2025-26 시즌",
    relegationCount: 3,
    showDraw: true,
  },
  BUNDESLIGA: {
    name: "분데스리가",
    subtitle: "Bundesliga · 2025-26 시즌",
    relegationCount: 3,
    showDraw: true,
  },
  SERIE_A: {
    name: "세리에 A",
    subtitle: "Serie A · 2025-26 시즌",
    relegationCount: 3,
    showDraw: true,
  },
  LIGUE_1: {
    name: "리그 1",
    subtitle: "Ligue 1 · 2025-26 시즌",
    relegationCount: 2,
    showDraw: true,
  },
  MLS: {
    name: "MLS",
    subtitle: "Major League Soccer · 2026 시즌",
    relegationCount: 0,
    showDraw: true,
  },
  UCL: {
    name: "챔피언스리그",
    subtitle: "UEFA Champions League · 2025-26",
    relegationCount: 0,
    showDraw: true,
  },
};

export default async function SeasonInsight({ league }: Props) {
  const info = LEAGUE_INFO[league];

  const dbMatches = await prisma.match.findMany({
    where: { league },
    select: {
      id: true,
      league: true,
      status: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      startTime: true,
    },
  });
  const matches: PredictMatch[] = dbMatches.map((m) => ({ ...m }));

  const finishedCount = matches.filter((m) => m.status === "FINISHED").length;
  const scheduledCount = matches.filter((m) => m.status === "SCHEDULED").length;

  if (finishedCount < 10) {
    return null; // 데이터 부족 시 섹션 자체 숨김
  }

  const standings = calcStandings(matches);
  const elo = calcEloTable(matches);
  const teams = await prisma.team.findMany({
    where: { league, id: { in: standings.rows.map((r) => r.teamId) } },
    select: { id: true, name: true },
  });
  const teamName = (id: number) => {
    const raw = teams.find((t) => t.id === id)?.name;
    return raw ? toKoreanTeamName(raw) : `팀 ${id}`;
  };

  const top1 = standings.rows[0];
  const top2 = standings.rows[1];
  const gapTop = top2 ? top1.points - top2.points : 0;

  // 공격/수비 1위
  const attackBest = [...standings.rows]
    .filter((r) => r.played >= 5)
    .sort((a, b) => b.goalsFor / b.played - a.goalsFor / a.played)[0];
  const defenseBest = [...standings.rows]
    .filter((r) => r.played >= 5)
    .sort((a, b) => a.goalsAgainst / a.played - b.goalsAgainst / b.played)[0];

  // Monte Carlo (메인 페이지는 ISR 1시간 캐싱이라 안전)
  let mcChampions: Array<{ teamId: number; pct: number }> = [];
  let mcRelegation: Array<{ teamId: number; pct: number }> = [];
  if (scheduledCount > 0) {
    const mc = runMonteCarlo(matches, league, {
      iterations: 1000,
      relegationCount: info.relegationCount,
    });
    mcChampions = mc
      .filter((r) => r.champion >= 0.001)
      .slice(0, 3)
      .map((r) => ({ teamId: r.teamId, pct: r.champion * 100 }));
    if (info.relegationCount > 0) {
      mcRelegation = mc
        .filter((r) => r.relegation >= 0.05)
        .sort((a, b) => b.relegation - a.relegation)
        .slice(0, 3)
        .map((r) => ({ teamId: r.teamId, pct: r.relegation * 100 }));
    }
  }

  // 다가오는 빅매치 (Elo 합 가장 높은 1경기)
  const upcoming = matches
    .filter((m) => m.status === "SCHEDULED")
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    .slice(0, 12);

  const bigMatch = upcoming
    .map((m) => ({
      m,
      score: getElo(elo, m.homeTeamId) + getElo(elo, m.awayTeamId),
    }))
    .sort((a, b) => b.score - a.score)[0]?.m;

  let bigMatchProb: { home: number; draw: number; away: number } | null = null;
  if (bigMatch) {
    bigMatchProb = calcWinProbability(
      getElo(elo, bigMatch.homeTeamId),
      getElo(elo, bigMatch.awayTeamId),
      league,
    );
  }

  const totalRounds =
    finishedCount + scheduledCount > 0
      ? finishedCount + scheduledCount
      : 0;

  return (
    <section className="overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] bg-white shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      {/* 헤더 */}
      <div className="border-b border-black/5 px-6 pt-6 pb-5 dark:border-white/10">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 dark:text-white/45">
          {info.subtitle}
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
            {info.name} 인사이트
          </h2>
          <div className="text-xs tabular-nums text-zinc-500 dark:text-white/45">
            {finishedCount} / {totalRounds}경기 진행
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div className="p-6 space-y-5">
        {/* 분석 글 — 자연 한국어 문장 */}
        <div className="prose prose-neutral dark:prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-strong:text-neutral-900 dark:prose-strong:text-white">
          <p>
            <strong>{teamName(top1.teamId)}</strong>이(가) 승점{" "}
            <strong className="tabular-nums">{top1.points}점</strong>으로 선두를
            지키고 있다.{" "}
            {top2 ? (
              <>
                2위 <strong>{teamName(top2.teamId)}</strong>(
                <span className="tabular-nums">{top2.points}점</span>)와의 격차는{" "}
                {gapTop === 0 ? (
                  "동률"
                ) : (
                  <>
                    <strong className="tabular-nums">{gapTop}점</strong>
                  </>
                )}
                으로,{" "}
                {gapTop >= 8
                  ? "사실상 우승 윤곽이 좁혀지는 흐름이다."
                  : gapTop >= 4
                    ? "막판 변수가 남은 추격전이다."
                    : "선두 다툼이 시즌 끝까지 이어질 전망이다."}
              </>
            ) : (
              "단독 선두 체제다."
            )}
          </p>

          {attackBest && defenseBest && (
            <p>
              공격 지표에서는{" "}
              <strong>{teamName(attackBest.teamId)}</strong>이(가) 경기당{" "}
              <strong className="tabular-nums">
                {(attackBest.goalsFor / attackBest.played).toFixed(2)}득점
              </strong>
              으로 가장 매서운 화력을 보이고 있고, 수비는{" "}
              <strong>{teamName(defenseBest.teamId)}</strong>이(가) 경기당{" "}
              <strong className="tabular-nums">
                {(defenseBest.goalsAgainst / defenseBest.played).toFixed(2)}실점
              </strong>
              으로 리그 최소 실점을 기록 중이다.
            </p>
          )}

          {mcChampions.length > 0 && (
            <p>
              Elo 레이팅에 기반한 5,000회 시뮬레이션 결과,{" "}
              {mcChampions.map((c, i) => (
                <span key={c.teamId}>
                  {i > 0 && (i === mcChampions.length - 1 ? "와 " : ", ")}
                  <strong>{teamName(c.teamId)}</strong>의 우승 확률은{" "}
                  <strong className="tabular-nums">{c.pct.toFixed(0)}%</strong>
                </span>
              ))}
              로 추정된다.
              {mcRelegation.length > 0 && (
                <>
                  {" "}강등권(하위 {info.relegationCount}팀)에서는{" "}
                  {mcRelegation
                    .map((r) => `${teamName(r.teamId)} ${r.pct.toFixed(0)}%`)
                    .join(", ")}{" "}
                  순으로 위험 지표가 높다.
                </>
              )}
            </p>
          )}

          {bigMatch && bigMatchProb && (
            <p>
              곧 열리는 빅매치는{" "}
              <strong>
                {teamName(bigMatch.homeTeamId)} vs {teamName(bigMatch.awayTeamId)}
              </strong>
              로, 양 팀의 시즌 흐름과 Elo 격차를 종합한 통계 추정 승률은{" "}
              <strong className="tabular-nums">
                {Math.round(bigMatchProb.home * 100)}% /{" "}
                {Math.round(bigMatchProb.draw * 100)}% /{" "}
                {Math.round(bigMatchProb.away * 100)}%
              </strong>{" "}
              (홈 / 무 / 원정).
            </p>
          )}
        </div>

        {/* 핵심 지표 그리드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <Stat
            label="1위"
            value={teamName(top1.teamId)}
            subtle={`${top1.points}점`}
          />
          {top2 && (
            <Stat
              label="2위"
              value={teamName(top2.teamId)}
              subtle={`${top2.points}점`}
            />
          )}
          {attackBest && (
            <Stat
              label="공격 1위"
              value={teamName(attackBest.teamId)}
              subtle={`${(attackBest.goalsFor / attackBest.played).toFixed(2)} 득점/경기`}
            />
          )}
          {defenseBest && (
            <Stat
              label="수비 1위"
              value={teamName(defenseBest.teamId)}
              subtle={`${(defenseBest.goalsAgainst / defenseBest.played).toFixed(2)} 실점/경기`}
            />
          )}
        </div>

        {/* 액션 링크 */}
        <div className="flex flex-wrap gap-2 border-t border-black/5 pt-3 dark:border-white/10">
          <LeagueBadge league={league} />
          <Link
            href={`/predictions/${league}`}
            className="ml-auto text-sm font-semibold text-zinc-700 hover:underline dark:text-white/70"
          >
            전체 시즌 예측 →
          </Link>
          <Link
            href={`/leagues/${league}`}
            className="text-sm font-semibold text-zinc-700 hover:underline dark:text-white/70"
          >
            {info.name} 기사 →
          </Link>
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  subtle,
}: {
  label: string;
  value: string;
  subtle?: string;
}) {
  return (
    <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-white/45">
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold text-zinc-950 dark:text-white">
        {value}
      </div>
      {subtle && (
        <div className="text-[11px] tabular-nums text-zinc-500 dark:text-white/45">
          {subtle}
        </div>
      )}
    </div>
  );
}
