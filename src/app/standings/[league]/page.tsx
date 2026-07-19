// 리그별 순위표 페이지 — 36개 축구 리그 + 야구/농구/하키 일부 지원.
// /standings/EPL, /standings/K_LEAGUE_1 등.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { calcStandings } from "@/lib/predict/standings";
import { currentSeasonStart, previousSeasonStart } from "@/lib/predict/season-window";
import { getRecentForm } from "@/lib/predict/recent-form";
import RecentFormDots from "@/components/scores/RecentFormDots";
import { toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { SOCCER_LEAGUES } from "@/lib/sports/types";
import { fetchStandingsForLeague } from "@/lib/sports/thesports/standings-fetch";
import { fetchBaseballTable } from "@/lib/sports/thesports/baseball-table";
import { getTeamGroup } from "@/lib/predict/world-cup-elos";
import { VOLLEYBALL_LEAGUES } from "@/lib/sports/sport-leagues";
import { fetchVolleyballTable } from "@/lib/sports/thesports/volleyball-table";
import { fetchNhlStandings } from "@/lib/sports/nhl-api";
import LeagueLeaderBoard from "@/components/LeagueLeaderBoard";
import { parseFixtureXg, xgOutcome } from "@/lib/xg/outcome";
import LolStandings from "@/components/LolStandings";
import LolSimpleStandings from "@/components/LolSimpleStandings";
import LolLplStandings from "@/components/LolLplStandings";
import EwcStandings from "@/components/EwcStandings";
import NhlStandingsTable from "@/components/NhlStandingsTable";
import { loadLeagueLeaderboard } from "@/lib/sports/league-leaderboard";
import AmbientGlow from "@/components/AmbientGlow";
import { Trophy, HeartPulse } from "lucide-react";

export const revalidate = 600; // ISR — 순위는 경기 종료 후 poller 가 갱신, 10분 캐시로 충분

interface Props {
  params: Promise<{ league: string }>;
}

const VALID = new Set<string>([
  ...SOCCER_LEAGUES,
  ...VOLLEYBALL_LEAGUES,
  "NBA",
  "WNBA",
  "NHL",
  "KBO",
  "NPB",
  "MLB",
  "CPBL",
  "LOL",
  "LEC",
  "LCS",
  "LPL",
  "EWC",
]);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league } = await params;
  const upper = league.toUpperCase();
  const name = LEAGUE_DISPLAY[upper] ?? upper;
  if (upper === "NHL") {
    return {
      title: "NHL 순위표 — 동·서부 컨퍼런스 전체 순위",
      description:
        "NHL 정규시즌 순위표. 동부·서부 컨퍼런스 32팀의 경기·승·패·연장패·승점 전체 순위를 NHL 공식 기록으로 매일 자동 갱신.",
      alternates: { canonical: "https://www.scorebase.kr/standings/NHL" },
    };
  }
  // KBO — 빙 검색어 "kbo 리그 팀 순위"(노출 561·5위)·"kbo순위"(98·6위) 정밀 매칭.
  if (upper === "KBO") {
    return {
      title: "KBO 리그 팀 순위 — 2026 프로야구 순위표·승률·게임차",
      description:
        "KBO 리그 팀 순위표. 10개 구단 승·패·무·승률·게임차와 최근 폼을 한눈에. 한국 프로야구 순위 매일 자동 갱신.",
      keywords: [
        "KBO 순위",
        "KBO 리그 팀 순위",
        "KBO 팀 순위",
        "KBO 순위표",
        "KBO 리그 순위",
        "프로야구 순위",
        "프로야구 순위표",
        "야구 순위",
        "한국 프로야구 순위",
      ],
      alternates: { canonical: "https://www.scorebase.kr/standings/KBO" },
    };
  }
  if (upper === "EWC") {
    return {
      title: "이스포츠 월드컵 LoL 순위 — 그룹 스테이지 결과·일정",
      description:
        "이스포츠 월드컵(Esports World Cup) 리그 오브 레전드 그룹 스테이지 순위·경기 결과·일정. T1 등 출전팀의 승패와 세트 스코어를 한눈에. 매일 자동 갱신.",
      keywords: ["이스포츠 월드컵 LoL", "EWC 롤", "이스포츠 월드컵 순위", "EWC T1", "Esports World Cup LoL"],
      alternates: { canonical: "https://www.scorebase.kr/standings/EWC" },
    };
  }
  if (upper === "LPL") {
    return {
      title: "LPL 순위 — 2026 중국 롤 프로리그 그룹별 순위표",
      description:
        "LPL(중국 League of Legends Pro League) 2026 스플릿 순위표. 그룹(조)별 팀 순위·승패·승률과 팀 로스터를 한눈에. 매일 자동 갱신.",
      keywords: ["LPL 순위", "LPL 순위표", "중국 롤 순위", "LPL 팀 순위", "LoL Pro League"],
      alternates: { canonical: "https://www.scorebase.kr/standings/LPL" },
    };
  }
  return {
    title: `${name} 순위표`,
    description: `${name} 시즌 순위표. 승점·승무패·골득실·득점·실점 한눈에. 매일 자동 갱신.`,
    alternates: { canonical: `https://www.scorebase.kr/standings/${upper}` },
  };
}

// KBO 순위 FAQ — 빙 실측 키워드("kbo 리그 팀 순위"·"프로야구 순위"·"야구 순위") 대응.
// 답변 사실 근거: 갱신 주기 = standings-poller 10분 주기 수집(lib/sports/thesports/baseball-table.ts)
// + 이 페이지 revalidate 600초. 승률·게임차 = 아래 winPct·gamesBehind 계산식과 동일.
// 포스트시즌 = KBO 공식 규정(상위 5팀, 와일드카드→준PO→PO→한국시리즈).
const KBO_FAQ: { q: string; a: string }[] = [
  {
    q: "KBO 리그 팀 순위는 얼마나 자주 갱신되나요?",
    a: "경기 종료 후 공식 순위 데이터를 10분 주기로 수집하며, 이 순위표 페이지도 약 10분 간격으로 자동 갱신됩니다.",
  },
  {
    q: "프로야구 순위는 어떤 기준으로 정해지나요?",
    a: "승률 순입니다. 승률은 승수를 승수와 패수의 합으로 나눈 값이며, 무승부는 승률 계산에서 제외됩니다.",
  },
  {
    q: "게임차는 어떻게 계산하나요?",
    a: "(1위 팀 승수 - 해당 팀 승수 + 해당 팀 패수 - 1위 팀 패수) ÷ 2 값입니다. 1위 팀과의 격차를 경기 수 단위로 나타낸 값입니다.",
  },
  {
    q: "KBO 포스트시즌에는 몇 팀이 진출하나요?",
    a: "정규시즌 상위 5팀이 진출합니다. 4위와 5위가 와일드카드 결정전(4위 팀 1승 어드밴티지)을 치르고, 승자가 3위와 준플레이오프, 그 승자가 2위와 플레이오프, 최종 승자가 1위와 한국시리즈를 치릅니다.",
  },
];

export default async function StandingsPage({ params }: Props) {
  const { league } = await params;
  const upper = league.toUpperCase();
  if (!VALID.has(upper)) notFound();
  const name = LEAGUE_DISPLAY[upper] ?? upper;

  // 월드컵은 단일표가 아니라 12개 조(A~L) 분리 표 — 전용 렌더로 분기
  if (upper === "WORLD_CUP") return <WorldCupStandings name={name} />;

  // 배구는 세트 득실 컬럼 + 조별(Pool) 다중 테이블 — 전용 렌더로 분기
  if (VOLLEYBALL_LEAGUES.has(upper)) return <VolleyballStandings league={upper} name={name} />;

  // NHL 은 승점 체계(승 2·연장패 1) + OTL 컬럼이 축구식과 달라 — 공식 순위 전용 렌더
  if (upper === "NHL") return <NhlStandings name={name} />;

  // LOL(LCK) — ts table/list JSON 백필(data/lol-standings.json) 정적 렌더
  if (upper === "LOL") return <LolStandings name={name} />;

  // 해외 LoL(LEC/LCS) — 순위 + 로스터만(매치 미수집이라 KDA·통계 탭 없음)
  if (upper === "LEC" || upper === "LCS") return <LolSimpleStandings league={upper} name={name} />;

  // LPL(중국) — 그룹(part_stage)별 순위 + 로스터. 매치 미수집이라 통계 탭 없음.
  if (upper === "LPL") return <LolLplStandings name={name} />;

  // EWC(이스포츠 월드컵) — 녹아웃 토너먼트라 TheSports 순위표 없음 → DB 매치로 그룹 순위 계산.
  if (upper === "EWC") return <EwcStandings name={name} />;

  // NBA — 데이터 소스 정비 중. ESPN↔TheSports 팀 id 충돌로 2025-26 매치가 오염돼(같은 팀 2행)
  // calcStandings 가 중복 팀·왜곡 승패를 내므로, TheSports 재수집 전까지 순위표를 막고 안내.
  // 정확한 시즌 기록은 역대 챔피언 + 결산글로 유도.
  if (upper === "NBA") {
    return (
      <div className="relative max-w-2xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center space-y-5">
        <AmbientGlow />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 리그 순위
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight break-keep">{name} 순위표</h1>
        <p className="text-neutral-500 dark:text-neutral-400 leading-relaxed break-keep">
          NBA 순위 데이터는 현재 소스 정비 중입니다. 정확한 시즌 기록은 아래에서 확인하세요.
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <Link href="/leagues/NBA?view=history" className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 dark:bg-white dark:text-neutral-900">역대 챔피언</Link>
          <Link href="/leagues/NBA?view=articles" className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-black/10 transition hover:-translate-y-0.5 dark:ring-white/15">시즌 결산·분석</Link>
        </div>
      </div>
    );
  }

  // 1차: ts season standings 시도 (78개 축구 리그 cover, 자체 계산보다 정확)
  // 2차: DB FINISHED 매치 기반 calcStandings fallback
  const isSoccerLeague = (SOCCER_LEAGUES as readonly string[]).includes(upper);
  const tsStandings = isSoccerLeague ? await fetchStandingsForLeague(upper) : null;
  // 야구(KBO/NPB) 순위는 TheSports season/table/detail 공식 순위 사용 (DB 매치 계산보다 정확).
  const baseballTable =
    upper === "KBO" || upper === "NPB" ? await fetchBaseballTable(upper) : null;

  // 시즌 매치 (recent form dots 용 + fallback 계산용) — 현재 시즌만.
  // 지난 시즌을 접어 롤오버 자동화 + 중복/구시즌 매치가 순위에 합산되는 것 방지
  // (NBA 는 시즌 필드가 없어 startTime 경계로만 구분. season-window 는 리그별 자동).
  const allMatches = await prisma.match.findMany({
    where: { league: upper },
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
  const seasonStart = currentSeasonStart(upper);
  let matches = seasonStart ? allMatches.filter((m) => m.startTime >= seasonStart) : allMatches;
  // 오프시즌 등으로 현재 시즌 완료 매치가 너무 적으면 직전 시즌 창으로 폴백 (predictions 와 동일).
  if (seasonStart && matches.filter((m) => m.status === "FINISHED").length < 10) {
    const prev = previousSeasonStart(seasonStart);
    matches = allMatches.filter((m) => m.startTime >= prev && m.startTime < seasonStart);
  }

  // 데이터 source 분기
  let rows: Array<{
    position: number;
    teamId: number;
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    goalDiff: number;
    points: number;
    promotionColor?: string;
    promotionName?: string;
  }>;
  let source: "ts" | "calc" = "calc";

  if (tsStandings && tsStandings.tables.length > 0) {
    // ts 결과 사용 — 첫 번째 table (일반 리그) 의 rows
    const promoMap = new Map(tsStandings.promotions.map((p) => [p.id, p]));
    const tsRows = tsStandings.tables[0].rows
      .filter((r) => r.ourTeamId != null) // 미매핑 ts 팀 제거
      .map((r) => {
        const promo = r.promotion_id ? promoMap.get(r.promotion_id) : undefined;
        return {
          position: r.position,
          teamId: r.ourTeamId!,
          played: r.total,
          wins: r.won,
          draws: r.draw,
          losses: r.loss,
          goalsFor: r.goals,
          goalsAgainst: r.goals_against,
          goalDiff: r.goal_diff,
          points: r.points,
          promotionColor: promo?.color,
          promotionName: promo?.name,
        };
      })
      .sort((a, b) => a.position - b.position);
    if (tsRows.length > 0) {
      rows = tsRows;
      source = "ts";
    }
  }

  // 야구(KBO/NPB) — TheSports 공식 순위 (season/table/detail). 미매핑/실패 시 calc fallback.
  if (source === "calc" && baseballTable && baseballTable.length > 0) {
    rows = baseballTable.map((r) => ({
      position: r.position,
      teamId: r.ourTeamId,
      played: r.played,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      goalDiff: r.goalsFor - r.goalsAgainst,
      points: r.wins * 3,
      promotionColor: undefined,
      promotionName: undefined,
    }));
    source = "ts";
  }

  if (source === "calc") {
    if (matches.length === 0) {
      return (
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <AmbientGlow />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 리그 순위
          </span>
          <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{name} 순위표</h1>
          <p className="mt-3 text-sm text-neutral-500 break-keep">시즌 매치 데이터가 아직 수집되지 않았습니다.</p>
        </div>
      );
    }
    const calc = calcStandings(matches);
    rows = calc.rows.map((r) => ({ ...r, promotionColor: undefined, promotionName: undefined }));
  }

  // xG 심화(기대 승점) — 축구 리그 중 xG 커버리지 90%+ 만 노출 (부분 커버는 xPTS 누계 왜곡).
  const xgTable = isSoccerLeague ? await buildXgTable(matches) : null;

  // 팀 DB lookup — 본 순위표 + xG 표 팀 합집합 (MLS 처럼 ts 표가 컨퍼런스 1개만 줄 때
  // xG 표의 나머지 컨퍼런스 팀이 조회에서 빠져 행이 사라지는 것 방지).
  const teamIds = [...new Set([...rows!.map((r) => r.teamId), ...(xgTable?.rows.map((r) => r.teamId) ?? [])])];
  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: { id: true, name: true, shortName: true, logoUrl: true },
  });
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  // 시즌 리더보드 (득점왕·도움왕 등) — DB cron 이 매일 채움. 데이터 있는 리그만 노출.
  const { rowsByCategory: leaderRows, season: leaderSeason } = await loadLeagueLeaderboard(upper);
  const hasLeaders = Object.keys(leaderRows).length > 0;

  // 야구(KBO/NPB) — 검색 의도·공식 표기가 승률·게임차 (meta description 도 승률·게임차 약속).
  // 축구식 득점·득실·승점(승×3) 컬럼은 야구에 없는 개념이라 야구식으로 분기 렌더.
  const isBaseball = upper === "KBO" || upper === "NPB";
  // 게임차는 단일 리그 표에서만 의미 — NPB 는 센트럴·퍼시픽 합산 렌더라 생략.
  const showGb = upper === "KBO";
  const leader = rows![0];
  const winPct = (r: { wins: number; losses: number }) =>
    r.wins + r.losses > 0 ? (r.wins / (r.wins + r.losses)).toFixed(3) : "-";
  const gamesBehind = (r: { wins: number; losses: number }) => {
    const gb = (leader.wins - r.wins + (r.losses - leader.losses)) / 2;
    return gb <= 0 ? "-" : gb.toFixed(1);
  };

  return (
    <div className="relative max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-4">
      <AmbientGlow />
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores" className="hover:underline">
          라이브 스코어
        </Link>
        <span>›</span>
        <Link href={`/leagues/${upper}`} className="hover:underline">
          {name}
        </Link>
        <span>›</span>
        <span className="text-neutral-700 dark:text-neutral-300">순위표</span>
      </nav>

      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 리그 순위
        </span>
        <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{name} 순위표</h1>
        <p className="text-sm text-neutral-500 mt-2 break-keep">
          {rows!.length}팀 · 시즌 진행 중 · {source === "ts" ? "TheSports 실시간 갱신" : "FINISHED 매치 기반 계산"}
        </p>
        {isBaseball && (
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2 leading-relaxed break-keep">
            {upper === "KBO"
              ? "2026 한국 프로야구(KBO 리그) 10개 구단 팀 순위표. 승·무·패와 승률, 게임차 기준 공식 순위를 매일 자동 갱신합니다."
              : "2026 일본 프로야구(NPB) 12개 구단 팀 순위표. 승·무·패와 승률 기준 공식 순위를 매일 자동 갱신합니다."}
          </p>
        )}
      </header>

      <div className="overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
        <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-white/10">
              <th className="text-right py-2 pl-3 pr-2 font-semibold">#</th>
              <th className="text-left py-2 px-2 font-semibold">팀</th>
              <th className="text-center py-2 px-2 font-semibold w-10">경기</th>
              <th className="text-center py-2 px-2 font-semibold w-10">승</th>
              <th className="text-center py-2 px-2 font-semibold w-10">무</th>
              <th className="text-center py-2 px-2 font-semibold w-10">패</th>
              {isBaseball ? (
                <>
                  {showGb && <th className="text-center py-2 px-2 font-semibold w-14">게임차</th>}
                  <th className="text-center py-2 px-2 font-semibold w-20 hidden sm:table-cell">최근 5</th>
                  <th className="text-right py-2 pr-3 pl-2 font-semibold w-14">승률</th>
                </>
              ) : (
                <>
                  <th className="text-center py-2 px-2 font-semibold w-12">득점</th>
                  <th className="text-center py-2 px-2 font-semibold w-12">실점</th>
                  <th className="text-center py-2 px-2 font-semibold w-12">득실</th>
                  <th className="text-center py-2 px-2 font-semibold w-20 hidden sm:table-cell">최근 5</th>
                  <th className="text-right py-2 pr-3 pl-2 font-semibold w-12">승점</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows!.map((r) => {
              const t = teamMap.get(r.teamId);
              if (!t) return null;
              const ko = toKoreanTeamName(t.name, upper);
              const gd = r.goalDiff;
              return (
                <tr
                  key={r.teamId}
                  id={`team-${r.teamId}`}
                  className="border-b border-neutral-100 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/[0.03] target:bg-amber-50 dark:target:bg-amber-500/10 scroll-mt-24 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  style={r.promotionColor ? { boxShadow: `inset 3px 0 0 0 ${r.promotionColor}` } : undefined}
                  title={r.promotionName || undefined}
                >
                  <td className="text-right py-2 pl-3 pr-2 tabular-nums text-neutral-500 font-bold">
                    {r.position}
                  </td>
                  <td className="py-2 px-2">
                    <Link
                      href={`/teams/${t.id}`}
                      prefetch={false}
                      className="flex items-center gap-2 hover:underline"
                    >
                      {t.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.logoUrl} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-800 shrink-0" />
                      )}
                      <span className="font-semibold truncate max-w-[160px] sm:max-w-none">{ko}</span>
                    </Link>
                  </td>
                  <td className="text-center py-2 px-2 tabular-nums text-neutral-600 dark:text-neutral-400">{r.played}</td>
                  <td className="text-center py-2 px-2 tabular-nums text-emerald-600 dark:text-emerald-400">{r.wins}</td>
                  <td className="text-center py-2 px-2 tabular-nums text-neutral-500">{r.draws}</td>
                  <td className="text-center py-2 px-2 tabular-nums text-rose-500">{r.losses}</td>
                  {isBaseball ? (
                    <>
                      {showGb && (
                        <td className="text-center py-2 px-2 tabular-nums text-neutral-600 dark:text-neutral-400">
                          {gamesBehind(r)}
                        </td>
                      )}
                      <td className="text-center py-2 px-2 hidden sm:table-cell">
                        <RecentFormDots form={getRecentForm(matches, r.teamId, 5)} size="sm" />
                      </td>
                      <td className="text-right py-2 pr-3 pl-2 tabular-nums font-black text-base">{winPct(r)}</td>
                    </>
                  ) : (
                    <>
                      <td className="text-center py-2 px-2 tabular-nums text-neutral-700 dark:text-neutral-300">{r.goalsFor}</td>
                      <td className="text-center py-2 px-2 tabular-nums text-neutral-700 dark:text-neutral-300">{r.goalsAgainst}</td>
                      <td className={`text-center py-2 px-2 tabular-nums font-semibold ${gd > 0 ? "text-emerald-600 dark:text-emerald-400" : gd < 0 ? "text-rose-500" : "text-neutral-500"}`}>
                        {gd > 0 ? `+${gd}` : gd}
                      </td>
                      <td className="text-center py-2 px-2 hidden sm:table-cell">
                        <RecentFormDots form={getRecentForm(matches, r.teamId, 5)} size="sm" />
                      </td>
                      <td className="text-right py-2 pr-3 pl-2 tabular-nums font-black text-base">{r.points}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      <div className="text-[11px] text-neutral-400 text-center pt-2">
        ⓘ FINISHED 매치만 집계. SCHEDULED/POSTPONED 제외.
      </div>

      {xgTable && (
        <section className="space-y-3 pt-4">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight break-keep">xG 심화 순위 — 기대 승점(xPTS)</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed break-keep">
            경기별 <strong>xG(기대득점)</strong>를 포아송 모델로 승점화한 <strong>xPTS(기대 승점)</strong>와
            실제 승점을 비교합니다. ± 가 <strong>+</strong> 면 경기 내용 대비 초과 성과(결정력·운),
            <strong> -</strong> 면 만든 기회에 비해 승점을 놓친 불운입니다.
          </p>
          <div className="overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-white/10">
                    <th className="text-right py-2 pl-3 pr-2 font-semibold">#</th>
                    <th className="text-left py-2 px-2 font-semibold">팀</th>
                    <th className="text-center py-2 px-2 font-semibold w-10">경기</th>
                    <th className="text-center py-2 px-2 font-semibold w-12 hidden sm:table-cell">득점</th>
                    <th className="text-center py-2 px-2 font-semibold w-14 hidden sm:table-cell">xG</th>
                    <th className="text-center py-2 px-2 font-semibold w-12 hidden sm:table-cell">실점</th>
                    <th className="text-center py-2 px-2 font-semibold w-14 hidden sm:table-cell">xGC</th>
                    <th className="text-center py-2 px-2 font-semibold w-12">승점</th>
                    <th className="text-center py-2 px-2 font-semibold w-14">xPTS</th>
                    <th className="text-right py-2 pr-3 pl-2 font-semibold w-14">±</th>
                  </tr>
                </thead>
                <tbody>
                  {xgTable.rows.map((r, i) => {
                    const t = teamMap.get(r.teamId);
                    if (!t) return null;
                    const luck = r.pts - r.xpts;
                    return (
                      <tr
                        key={r.teamId}
                        className="border-b border-neutral-100 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                      >
                        <td className="text-right py-2 pl-3 pr-2 tabular-nums text-neutral-500 font-bold">{i + 1}</td>
                        <td className="py-2 px-2">
                          <Link href={`/teams/${t.id}`} prefetch={false} className="flex items-center gap-2 hover:underline">
                            {t.logoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={t.logoUrl} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />
                            ) : (
                              <span className="w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-800 shrink-0" />
                            )}
                            <span className="font-semibold truncate max-w-[160px] sm:max-w-none">{toKoreanTeamName(t.name, upper)}</span>
                          </Link>
                        </td>
                        <td className="text-center py-2 px-2 tabular-nums text-neutral-600 dark:text-neutral-400">{r.played}</td>
                        <td className="text-center py-2 px-2 tabular-nums text-neutral-700 dark:text-neutral-300 hidden sm:table-cell">{r.gf}</td>
                        <td className="text-center py-2 px-2 tabular-nums text-neutral-500 hidden sm:table-cell">{r.xgFor.toFixed(1)}</td>
                        <td className="text-center py-2 px-2 tabular-nums text-neutral-700 dark:text-neutral-300 hidden sm:table-cell">{r.ga}</td>
                        <td className="text-center py-2 px-2 tabular-nums text-neutral-500 hidden sm:table-cell">{r.xgAgainst.toFixed(1)}</td>
                        <td className="text-center py-2 px-2 tabular-nums font-black">{r.pts}</td>
                        <td className="text-center py-2 px-2 tabular-nums text-neutral-500">{r.xpts.toFixed(1)}</td>
                        <td className={`text-right py-2 pr-3 pl-2 tabular-nums font-semibold ${luck > 2 ? "text-emerald-600 dark:text-emerald-400" : luck < -2 ? "text-rose-500" : "text-neutral-500"}`}>
                          {luck > 0 ? `+${luck.toFixed(1)}` : luck.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="text-[11px] text-neutral-400 text-center">
            ⓘ xG 보유 {xgTable.covered}/{xgTable.finished}경기 기준 · xG 출처 api-football · 실제 승점 순 정렬.
          </div>
        </section>
      )}

      {hasLeaders && (
        <section className="space-y-3 pt-4">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight">{name} 시즌 리더보드</h2>
          <LeagueLeaderBoard league={upper} season={leaderSeason} rowsByCategory={leaderRows} />
        </section>
      )}

      {/* KBO 한정 FAQ — layout 의 BreadcrumbList·Dataset JSON-LD 와 별도 스크립트로 주입 */}
      {upper === "KBO" && (
        <section className="space-y-3 pt-4">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight break-keep">KBO 리그 팀 순위 — 자주 묻는 질문</h2>
          <div className="space-y-2">
            {KBO_FAQ.map((f) => (
              <details
                key={f.q}
                className="rounded-2xl border border-neutral-200 dark:border-white/10 px-4 py-3"
              >
                <summary className="text-sm font-semibold cursor-pointer break-keep">{f.q}</summary>
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed break-keep">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: KBO_FAQ.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              }),
            }}
          />
        </section>
      )}
    </div>
  );
}

// ── xG 심화 순위 — 시즌 FINISHED 매치의 xG 로 팀별 기대득점·기대승점(xPTS) 집계 ──
// xgscore.io 벤치마크. 실제 승점과 xPTS 의 차이로 순위표의 '운' 요소를 수치화.
// 커버리지 90% 미만 리그는 누계가 왜곡되어 null 반환(섹션 미노출). 현재 통과: 라리가·세리에A 등.
interface XgAggRow {
  teamId: number;
  played: number;
  gf: number;
  ga: number;
  xgFor: number;
  xgAgainst: number;
  pts: number;
  xpts: number;
}

async function buildXgTable(
  matches: Array<{
    id: number;
    status: string;
    homeTeamId: number;
    awayTeamId: number;
    homeScore: number | null;
    awayScore: number | null;
  }>,
): Promise<{ rows: XgAggRow[]; covered: number; finished: number } | null> {
  const finished = matches.filter(
    (m) => m.status === "FINISHED" && m.homeScore != null && m.awayScore != null,
  );
  if (finished.length < 20) return null; // 표본 부족(컵 초기·시즌 초)
  const stats = await prisma.match.findMany({
    where: { id: { in: finished.map((m) => m.id) }, fixtureStats: { not: null } },
    select: { id: true, fixtureStats: true },
  });
  const xgById = new Map<number, { home: number; away: number }>();
  for (const s of stats) {
    const { home, away } = parseFixtureXg(s.fixtureStats);
    if (home != null && away != null) xgById.set(s.id, { home, away });
  }
  if (xgById.size / finished.length < 0.9) return null;

  const byTeam = new Map<number, XgAggRow>();
  const rowOf = (teamId: number): XgAggRow => {
    let r = byTeam.get(teamId);
    if (!r) {
      r = { teamId, played: 0, gf: 0, ga: 0, xgFor: 0, xgAgainst: 0, pts: 0, xpts: 0 };
      byTeam.set(teamId, r);
    }
    return r;
  };
  for (const m of finished) {
    const xg = xgById.get(m.id);
    if (!xg) continue; // 미커버 경기는 실제 승점 쪽도 제외 — 같은 경기 집합으로 공정 비교
    const o = xgOutcome(xg.home, xg.away);
    const h = rowOf(m.homeTeamId);
    const a = rowOf(m.awayTeamId);
    h.played++;
    a.played++;
    h.gf += m.homeScore!;
    h.ga += m.awayScore!;
    h.xgFor += xg.home;
    h.xgAgainst += xg.away;
    a.gf += m.awayScore!;
    a.ga += m.homeScore!;
    a.xgFor += xg.away;
    a.xgAgainst += xg.home;
    h.xpts += o.xptsHome;
    a.xpts += o.xptsAway;
    if (m.homeScore! > m.awayScore!) h.pts += 3;
    else if (m.homeScore! < m.awayScore!) a.pts += 3;
    else {
      h.pts++;
      a.pts++;
    }
  }
  const rows = [...byTeam.values()].sort(
    (x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf,
  );
  return { rows, covered: xgById.size, finished: finished.length };
}

// ── FIFA 월드컵 2026 조별 순위 — 48개국 12개 조, FINISHED 매치 기반 자체 집계 ──
// 조 1·2위 32강 직행 + 3위 중 상위 8팀 추가 진출 (48팀 신규 포맷).
// 정렬: 승점 > 득실 > 다득점 (동률 세부 규칙(H2H·페어플레이)은 조별 종료 시점에만 의미 — 생략).
async function WorldCupStandings({ name }: { name: string }) {
  const [teams, matches] = await Promise.all([
    prisma.team.findMany({
      where: { league: "WORLD_CUP" },
      select: { id: true, name: true, logoUrl: true },
    }),
    prisma.match.findMany({
      where: { league: "WORLD_CUP" },
      select: { status: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
    }),
  ]);

  interface Row {
    teamId: number; name: string; logo: string | null;
    played: number; wins: number; draws: number; losses: number;
    gf: number; ga: number; pts: number;
  }
  const rowByTeam = new Map<number, Row>();
  const groupOf = new Map<number, string>();
  for (const t of teams) {
    const g = getTeamGroup(t.name);
    if (!g) continue; // 조 매핑 안 되는 row (중복/비본선) 제외
    groupOf.set(t.id, g);
    rowByTeam.set(t.id, { teamId: t.id, name: t.name, logo: t.logoUrl, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, pts: 0 });
  }
  for (const m of matches) {
    if (m.status !== "FINISHED" || m.homeScore == null || m.awayScore == null) continue;
    const h = rowByTeam.get(m.homeTeamId);
    const a = rowByTeam.get(m.awayTeamId);
    if (!h || !a) continue;
    // 32강 이후 토너먼트 매치 제외 — 같은 조 팀끼리의 경기만 조별 집계
    if (groupOf.get(m.homeTeamId) !== groupOf.get(m.awayTeamId)) continue;
    h.played++; a.played++;
    h.gf += m.homeScore; h.ga += m.awayScore;
    a.gf += m.awayScore; a.ga += m.homeScore;
    if (m.homeScore > m.awayScore) { h.wins++; h.pts += 3; a.losses++; }
    else if (m.homeScore < m.awayScore) { a.wins++; a.pts += 3; h.losses++; }
    else { h.draws++; h.pts++; a.draws++; a.pts++; }
  }

  const groups = new Map<string, Row[]>();
  for (const [teamId, g] of groupOf) {
    const arr = groups.get(g) || [];
    arr.push(rowByTeam.get(teamId)!);
    groups.set(g, arr);
  }
  for (const arr of groups.values()) {
    arr.sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.name.localeCompare(y.name));
  }
  const groupKeys = [...groups.keys()].sort();
  const playedTotal = matches.filter((m) => m.status === "FINISHED").length;

  return (
    <div className="relative max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-4">
      <AmbientGlow />
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores" className="hover:underline">라이브 스코어</Link>
        <span>›</span>
        <Link href="/leagues/WORLD_CUP" className="hover:underline">{name}</Link>
        <span>›</span>
        <span className="text-neutral-700 dark:text-neutral-300">조별 순위</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 조별 순위
          </span>
          <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{name} 조별 순위</h1>
          <p className="text-sm text-neutral-500 mt-2 break-keep">
            48개국 12개 조 · 조별리그 {playedTotal}경기 종료 · 경기 종료 시 자동 갱신
          </p>
        </div>
        <Link
          href="/predictions/WORLD_CUP"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-600 dark:text-amber-400 hover:underline shrink-0"
        >
          <Trophy className="h-4 w-4" aria-hidden /> 우승 확률 시뮬레이션 →
        </Link>
      </header>

      <div className="grid sm:grid-cols-2 gap-4">
        {groupKeys.map((g) => (
          <section key={g} className="rounded-2xl border border-neutral-200 dark:border-white/10 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:hover:bg-white/[0.02]">
            <h2 className="px-4 py-2.5 text-sm font-black bg-neutral-50 dark:bg-white/[0.04] border-b border-neutral-200 dark:border-white/10">
              {g}조
            </h2>
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-neutral-400">
                  <th className="text-right py-1.5 pl-3 pr-1 font-semibold w-7">#</th>
                  <th className="text-left py-1.5 px-1.5 font-semibold">팀</th>
                  <th className="text-center py-1.5 px-1 font-semibold w-8">경기</th>
                  <th className="text-center py-1.5 px-1 font-semibold w-7">승</th>
                  <th className="text-center py-1.5 px-1 font-semibold w-7">무</th>
                  <th className="text-center py-1.5 px-1 font-semibold w-7">패</th>
                  <th className="text-center py-1.5 px-1 font-semibold w-10">득실</th>
                  <th className="text-right py-1.5 pr-3 pl-1 font-semibold w-10">승점</th>
                </tr>
              </thead>
              <tbody>
                {(groups.get(g) || []).map((r, i) => {
                  const gd = r.gf - r.ga;
                  // 1·2위 = 32강 직행(emerald), 3위 = 상위 8팀 와일드카드 가능(amber)
                  const stripe = i < 2 ? "#10b981" : i === 2 ? "#f59e0b" : undefined;
                  return (
                    <tr
                      key={r.teamId}
                      className="border-b border-neutral-100 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                      style={stripe ? { boxShadow: `inset 3px 0 0 0 ${stripe}` } : undefined}
                      title={i < 2 ? "32강 직행권" : i === 2 ? "3위 — 상위 8팀 32강 진출 가능" : undefined}
                    >
                      <td className="text-right py-2 pl-3 pr-1 tabular-nums text-neutral-500 font-bold">{i + 1}</td>
                      <td className="py-2 px-1.5">
                        <Link href={`/national-teams/${r.teamId}`} prefetch={false} className="flex items-center gap-2 hover:underline">
                          {r.logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />
                          ) : (
                            <span className="w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-800 shrink-0" />
                          )}
                          <span className="font-semibold truncate max-w-[120px] sm:max-w-[150px]">
                            {toKoreanTeamName(r.name, "WORLD_CUP")}
                          </span>
                        </Link>
                      </td>
                      <td className="text-center py-2 px-1 tabular-nums text-neutral-600 dark:text-neutral-400">{r.played}</td>
                      <td className="text-center py-2 px-1 tabular-nums text-emerald-600 dark:text-emerald-400">{r.wins}</td>
                      <td className="text-center py-2 px-1 tabular-nums text-neutral-500">{r.draws}</td>
                      <td className="text-center py-2 px-1 tabular-nums text-rose-500">{r.losses}</td>
                      <td className={`text-center py-2 px-1 tabular-nums font-semibold ${gd > 0 ? "text-emerald-600 dark:text-emerald-400" : gd < 0 ? "text-rose-500" : "text-neutral-500"}`}>
                        {gd > 0 ? `+${gd}` : gd}
                      </td>
                      <td className="text-right py-2 pr-3 pl-1 tabular-nums font-black">{r.pts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
      </div>

      <div className="text-[11px] text-neutral-400 text-center pt-2 space-y-0.5">
        <p>
          <span className="inline-block w-2.5 h-2.5 rounded-sm align-[-1px] mr-1" style={{ background: "#10b981" }} />
          조 1·2위 32강 직행
          <span className="inline-block w-2.5 h-2.5 rounded-sm align-[-1px] mx-1 ml-3" style={{ background: "#f59e0b" }} />
          3위는 12개 조 중 상위 8팀이 32강 진출
        </p>
        <p>ⓘ FINISHED 매치만 집계 · 동률 시 승점→득실→다득점 순.</p>
      </div>
    </div>
  );
}


// ── 배구 순위 (VNL/AVC/유럽리그) — TheSports season/table/detail cache 기반 ──
// 승점·승패·세트 득실. AVC/유럽리그는 조별(Pool) 다중 테이블 그대로 렌더.
async function VolleyballStandings({ league, name }: { league: string; name: string }) {
  const groups = await fetchVolleyballTable(league);
  const teamIds = groups.flatMap((g) => g.rows.map((r) => r.ourTeamId));
  const [teams, vbMatches] = await Promise.all([
    prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: { id: true, name: true, logoUrl: true },
    }),
    // 최근 5 도트용 — 대회 FINISHED 매치 (세트 스코어 기준 W/L)
    prisma.match.findMany({
      where: { league },
      select: { status: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, startTime: true },
    }),
  ]);
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const multi = groups.length > 1;

  return (
    <div className="relative max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-4">
      <AmbientGlow />
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores?sport=volleyball" className="hover:underline">배구 라이브 스코어</Link>
        <span>›</span>
        <span className="text-neutral-700 dark:text-neutral-300">{name} 순위표</span>
      </nav>

      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 리그 순위
        </span>
        <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{name} 순위표</h1>
        <p className="text-sm text-neutral-500 mt-2 break-keep">
          승점 · 승패 · 세트 득실 — TheSports 공식 순위, 경기 종료 후 자동 갱신
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 dark:border-white/10 px-5 py-10 text-center text-sm text-neutral-500 break-keep">
          순위 데이터 수집 중입니다. 잠시 후 다시 확인해주세요.
        </p>
      ) : (
        <div className={multi ? "grid sm:grid-cols-2 gap-4" : "space-y-4"}>
          {groups.map((g) => (
            <section key={g.name} className="rounded-2xl border border-neutral-200 dark:border-white/10 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:hover:bg-white/[0.02]">
              {multi && (
                <h2 className="px-4 py-2.5 text-sm font-black bg-neutral-50 dark:bg-white/[0.04] border-b border-neutral-200 dark:border-white/10">
                  {g.name}
                </h2>
              )}
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-neutral-400">
                    <th className="text-right py-2 pl-3 pr-2 font-semibold w-8">#</th>
                    <th className="text-left py-2 px-2 font-semibold">팀</th>
                    <th className="text-center py-2 px-1 font-semibold w-10">경기</th>
                    <th className="text-center py-2 px-1 font-semibold w-8">승</th>
                    <th className="text-center py-2 px-1 font-semibold w-8">패</th>
                    <th className="text-center py-2 px-1 font-semibold w-14">세트 +/-</th>
                    <th className="text-center py-2 px-1 font-semibold w-16 hidden sm:table-cell">최근 5</th>
                    <th className="text-right py-2 pr-3 pl-1 font-semibold w-12">승점</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => {
                    const t = teamMap.get(r.ourTeamId);
                    if (!t) return null;
                    const sd = r.setsWin - r.setsLoss;
                    return (
                      <tr key={r.ourTeamId} className="border-b border-neutral-100 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
                        <td className="text-right py-2 pl-3 pr-2 tabular-nums text-neutral-500 font-bold">{r.position}</td>
                        <td className="py-2 px-2">
                          <span className="flex items-center gap-2">
                            {t.logoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={t.logoUrl} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />
                            ) : (
                              <span className="w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-800 shrink-0" />
                            )}
                            <span className="font-semibold truncate max-w-[150px] sm:max-w-none">
                              {toKoreanTeamName(t.name, league)}
                            </span>
                          </span>
                        </td>
                        <td className="text-center py-2 px-1 tabular-nums text-neutral-600 dark:text-neutral-400">{r.played}</td>
                        <td className="text-center py-2 px-1 tabular-nums text-emerald-600 dark:text-emerald-400">{r.wins}</td>
                        <td className="text-center py-2 px-1 tabular-nums text-rose-500">{r.losses}</td>
                        <td className={`text-center py-2 px-1 tabular-nums font-semibold ${sd > 0 ? "text-emerald-600 dark:text-emerald-400" : sd < 0 ? "text-rose-500" : "text-neutral-500"}`}>
                          {r.setsWin}:{r.setsLoss}
                        </td>
                        <td className="text-center py-2 px-1 hidden sm:table-cell">
                          <RecentFormDots form={getRecentForm(vbMatches, r.ourTeamId, 5)} size="sm" />
                        </td>
                        <td className="text-right py-2 pr-3 pl-1 tabular-nums font-black text-base">{r.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}

      <div className="text-[11px] text-neutral-400 text-center pt-2">
        ⓘ 세트 +/- = 세트 득실 (승:패). 순위 산정은 대회 규정(승점→승수→세트율) 기준.
      </div>
    </div>
  );
}


// ── NHL 순위 — NHL 공식 API /standings/now (정규시즌, 승 2점·연장패 1점) ──
// 축구식 calcStandings(승×3·무×1)와 승점 체계가 달라 공식 기록을 그대로 렌더.
// 표 컬럼도 NHL 식: 경기·승·패·연장패(OTL)·득점·실점·득실·승점 ('무' 없음).
// 표 본체는 공용 NhlStandingsTable 컴포넌트가 렌더(/leagues/NHL 순위 탭과 공유).
function formatNhlSeason(s: string): string {
  // "20252026" → "2025-26"
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(6, 8)}`;
  return s;
}

async function NhlStandings({ name }: { name: string }) {
  const std = await fetchNhlStandings();
  if (!std || std.rows.length === 0) {
    return (
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <AmbientGlow />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 리그 순위
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{name} 순위표</h1>
        <p className="mt-3 text-sm text-neutral-500 break-keep">
          순위 데이터 수집 중입니다. 잠시 후 다시 확인해주세요.
        </p>
      </div>
    );
  }
  const seasonLabel = formatNhlSeason(std.season);

  // 시즌 리더보드 (골·어시·포인트·세이브%) — 데이터 있을 때만.
  const { rowsByCategory: nhlLeaders, season: nhlLeaderSeason } = await loadLeagueLeaderboard("NHL");
  const hasNhlLeaders = Object.keys(nhlLeaders).length > 0;

  return (
    <div className="relative max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-4">
      <AmbientGlow />
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores?sport=hockey" className="hover:underline">
          라이브 스코어
        </Link>
        <span>›</span>
        <Link href="/leagues/NHL" className="hover:underline">
          {name}
        </Link>
        <span>›</span>
        <span className="text-neutral-700 dark:text-neutral-300">순위표</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 리그 순위
          </span>
          <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">NHL 순위표</h1>
          <p className="text-sm text-neutral-500 mt-2 break-keep">
            {seasonLabel} 정규시즌 · 32팀 · NHL 공식 기록 (승 2점 · 연장패 1점)
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link
            href="/predictions/NHL"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-600 dark:text-amber-400 hover:underline"
          >
            <Trophy className="h-4 w-4" aria-hidden /> AI 예측 →
          </Link>
          <Link
            href="/injuries/NHL"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-600 dark:text-rose-400 hover:underline"
          >
            <HeartPulse className="h-4 w-4" aria-hidden /> 부상자 →
          </Link>
        </div>
      </header>

      <NhlStandingsTable std={std} />

      {hasNhlLeaders && (
        <section className="space-y-3 pt-4">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight">NHL 시즌 리더보드</h2>
          <LeagueLeaderBoard league="NHL" season={nhlLeaderSeason} rowsByCategory={nhlLeaders} />
        </section>
      )}
    </div>
  );
}
