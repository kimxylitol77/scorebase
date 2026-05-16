// /scores — 라이브/종료/예정 통합 스코어 페이지 (named.com 스타일 박스 카드).
// 구조: SportTabs → DateSlider → LeagueChips → MatchCard 그리드 (LIVE→예정→종료 그룹).
// LIVE 매치 있으면 LiveRefresher 가 30초마다 router.refresh().

import Link from "next/link";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import {
  SPORTS,
  leaguesForSport,
  LEAGUE_DISPLAY,
  LEAGUE_ORDER,
  type SportCode,
} from "@/lib/sports/sport-leagues";
import { toKoreanTeamName } from "@/lib/team-names";
import { npbPlayerToKorean } from "@/lib/sports/npb-player-names";
import {
  fetchAllLiveScores,
  fetchBaseballByDate,
  fetchMlbByDate,
  fetchSoccerGoalsByDate,
  fetchEspnPeriodLinescores,
  soccerGoalsPairKey,
  type BaseballGameDetails,
  type PeriodLinescore as PeriodLinescoreData,
  type SoccerGoal,
  type LiveMatch,
} from "@/lib/sports/live-scores";
import SportTabs from "@/components/scores/SportTabs";
import DateSlider from "@/components/scores/DateSlider";
import LeagueChips from "@/components/scores/LeagueChips";
import MatchCard from "@/components/scores/MatchCard";
import FavoriteMatches from "@/components/scores/FavoriteMatches";
import EmptyState from "@/components/scores/EmptyState";
import LiveRefresher from "@/components/scores/LiveRefresher";
import SoccerLiveRow, {
  SoccerLiveRowHeader,
} from "@/components/scores/soccer/SoccerLiveRow";
import type { SoccerContext } from "@/components/scores/SoccerMiniBoard";
import type { BaseballLinescoreData } from "@/components/scores/BaseballLinescore";
import type { BaseballContext } from "@/components/scores/BaseballMiniBoard";
import type { EsportsContext } from "@/components/scores/EsportsMiniBoard";

const fetchLiveCached = unstable_cache(
  fetchAllLiveScores,
  ["scores-page-live"],
  { revalidate: 30, tags: ["live-scores"] },
);

// 일자별 야구 매치 innings (LIVE+FINISHED 모두) — 종료 매치 linescore 보강용.
// 일자 별 cache key 분리, 60초 revalidate.
const fetchBaseballByDateCached = unstable_cache(
  fetchBaseballByDate,
  ["scores-page-baseball-by-date"],
  { revalidate: 60, tags: ["live-scores"] },
);
// MLB 는 ESPN 기반 collector 라 externalId = ESPN game id. api-sports 와 별도 fetch.
const fetchMlbByDateCached = unstable_cache(
  fetchMlbByDate,
  ["scores-page-mlb-by-date"],
  { revalidate: 60, tags: ["live-scores"] },
);
// 축구 골 list — ESPN scoreboard 의 details (scoringPlay). EPL 제외 7리그.
const fetchSoccerGoalsByDateCached = unstable_cache(
  fetchSoccerGoalsByDate,
  ["scores-page-soccer-goals"],
  { revalidate: 60, tags: ["live-scores"] },
);
// NBA/NHL 쿼터/피리어드별 점수 — ESPN scoreboard linescores.
const fetchPeriodsByDateCached = unstable_cache(
  fetchEspnPeriodLinescores,
  ["scores-page-period-linescores"],
  { revalidate: 60, tags: ["live-scores"] },
);

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ date?: string; sport?: string; league?: string }>;
}

const BASEBALL_LEAGUES = new Set(["KBO", "NPB", "MLB"]);
const SOCCER_LEAGUES = new Set([
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "MLS",
  "UCL",
  "WORLD_CUP",
  "K_LEAGUE_1",
  "K_LEAGUE_2",
  "J1_LEAGUE",
  "AFC_CL",
]);

function sportFromLeague(league: string): string {
  if (BASEBALL_LEAGUES.has(league)) return "baseball";
  if (SOCCER_LEAGUES.has(league)) return "soccer";
  if (league === "NBA") return "basketball";
  if (league === "NHL") return "hockey";
  if (league === "LOL") return "esports";
  return "other";
}

function parseKstDate(s: string | undefined): Date {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T00:00:00+09:00`);
  }
  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  return new Date(
    Date.UTC(
      nowKst.getUTCFullYear(),
      nowKst.getUTCMonth(),
      nowKst.getUTCDate(),
      -9,
    ),
  );
}
function dateQuery(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return k.toISOString().slice(0, 10);
}
function kstHHmm(d: Date): string {
  return d.toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
function kstDateLabel(d: Date): string {
  return d.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}
function parseStarter(json: string | null): string | null {
  if (!json) return null;
  try {
    const obj = JSON.parse(json) as { name?: string };
    return obj.name?.trim() || null;
  } catch {
    return null;
  }
}

/** NPB 매치의 starter 이름을 한국어로 음역. 다른 리그는 원문 유지.
 *  깨진 변환 (한국어 + 일본 카나 혼합) 감지 시 starter 숨김.
 */
function localizeStarter(name: string | null, league: string): string | null {
  if (!name) return null;
  if (league !== "NPB") return name;
  // 깨진 mid-conversion 결과 — 한국어 + 일본 카나 mix 시 숨김.
  if (/[가-힣]/.test(name) && /[぀-ゟ゠-ヿ]/.test(name)) return null;
  return npbPlayerToKorean(name);
}

/** 카드 linescore 등 좁은 곳의 팀 약칭. shortName 우선, 없으면 한글 첫 단어
 *  (4자 cap), 영문은 첫 단어 또는 4자. */
function shortLabel(shortName: string | null, koName: string): string {
  if (shortName && shortName.trim()) return shortName.trim();
  if (/[가-힣]/.test(koName)) {
    const first = koName.split(/\s+/)[0];
    return first.length > 4 ? first.slice(0, 4) : first;
  }
  const tokens = koName.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2 && tokens[0].length <= 4) return tokens[0];
  return koName.slice(0, 4);
}
// "전반 38'", "후반 67'", "HT" 등에서 minute / half short 추출
function parseSoccerStatus(statusLabel?: string | null): SoccerContext | null {
  if (!statusLabel) return null;
  if (/^HT$/i.test(statusLabel)) return { halfLabel: "HT", minute: 45 };
  const m = statusLabel.match(/(전반|후반|연장|LIVE)\s*(\d+)/);
  if (m) {
    const half =
      m[1] === "전반" ? "1H" : m[1] === "후반" ? "2H" : m[1] === "연장" ? "ET" : "LIVE";
    return { halfLabel: half, minute: parseInt(m[2], 10) };
  }
  return { halfLabel: statusLabel };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const sportCode = (SPORTS.find((s) => s.code === sp.sport)?.code ?? "soccer") as SportCode;
  const sportLabel = SPORTS.find((s) => s.code === sportCode)?.label ?? "전체";
  const day = parseKstDate(sp.date);
  const dateStr = kstDateLabel(day);
  return {
    title: `${dateStr} ${sportLabel} 라이브 스코어 · 일정 — 스코어베이스`,
    description: `${dateStr} ${sportLabel} 경기 일정·라이브 스코어·종료 결과. KBO·NPB·MLB·EPL·NBA·LCK 통합. 30초 자동 갱신.`,
    alternates: { canonical: `https://www.scorebase.kr/scores?sport=${sportCode}&date=${dateQuery(day)}` },
  };
}

export default async function ScoresPage({ searchParams }: Props) {
  const sp = await searchParams;
  const sport = (SPORTS.find((s) => s.code === sp.sport)?.code ?? "soccer") as SportCode;
  const leaguesAll = leaguesForSport(sport);
  const leagueFilter = sp.league && leaguesAll.includes(sp.league) ? sp.league : null;
  const leagues = leagueFilter ? [leagueFilter] : leaguesAll;
  const day = parseKstDate(sp.date);
  const dayEnd = new Date(day.getTime() + 24 * 3600 * 1000);
  const dateStr = sp.date ?? dateQuery(day);

  // 야구 카테고리 (또는 전체) 일 때만 종료 매치용 innings 추가 fetch.
  const needsBaseballDetails =
    sport === "baseball" ||
    sport === "all" ||
    leagues.some((l) => BASEBALL_LEAGUES.has(l));
  // 축구 카테고리 (또는 전체) — 골 list fetch
  const needsSoccerGoals =
    sport === "soccer" ||
    sport === "all" ||
    leagues.some((l) => SOCCER_LEAGUES.has(l));
  const needsNba =
    sport === "basketball" || sport === "all" || leagues.includes("NBA");
  const needsNhl =
    sport === "hockey" || sport === "all" || leagues.includes("NHL");

  const [
    matches,
    liveMatches,
    apiSportsDetails,
    mlbDetails,
    soccerGoalsMap,
    nbaPeriods,
    nhlPeriods,
  ] = await Promise.all([
    prisma.match.findMany({
      where: {
        league: { in: leagues },
        startTime: { gte: day, lt: dayEnd },
        status: { not: "POSTPONED" },
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        articles: {
          where: { status: "PUBLISHED" },
          select: { slug: true, type: true },
        },
      },
      orderBy: { startTime: "asc" },
    }),
    fetchLiveCached(),
    // fetch 가 실패하면 throw → unstable_cache 가 빈 응답 캐싱 안 함.
    // 이 페이지 렌더는 빈 결과로 계속 — catch 해서 빈 객체로 대체.
    needsBaseballDetails
      ? fetchBaseballByDateCached(dateStr).catch(
          () => ({}) as Record<string, BaseballGameDetails>,
        )
      : Promise.resolve({} as Record<string, BaseballGameDetails>),
    needsBaseballDetails && leagues.includes("MLB")
      ? fetchMlbByDateCached(dateStr).catch(
          () => ({}) as Record<string, BaseballGameDetails>,
        )
      : Promise.resolve({} as Record<string, BaseballGameDetails>),
    needsSoccerGoals
      ? fetchSoccerGoalsByDateCached(dateStr, leagues)
      : Promise.resolve({} as Record<string, SoccerGoal[]>),
    needsNba
      ? fetchPeriodsByDateCached("basketball/nba", dateStr)
      : Promise.resolve({} as Record<string, PeriodLinescoreData>),
    needsNhl
      ? fetchPeriodsByDateCached("hockey/nhl", dateStr)
      : Promise.resolve({} as Record<string, PeriodLinescoreData>),
  ]);
  const periodMap: Record<string, PeriodLinescoreData> = { ...nbaPeriods, ...nhlPeriods };
  // 두 source 합침 — externalId key 가 source 별 ID 시스템이라 충돌 X.
  const baseballDetailsMap: Record<string, BaseballGameDetails> = {
    ...apiSportsDetails,
    ...mlbDetails,
  };

  // 외부 라이브 매치 ↔ DB 매치 매칭 (externalId 또는 league+이름)
  const liveByExternalId = new Map<string, LiveMatch>();
  const liveByNameKey = new Map<string, LiveMatch>();
  function normalizeName(s: string): string {
    const stripped = s
      .replace(/\s+(fc|sc|cf|united|club|esports|f\.c\.|s\.c\.)\s*$/gi, "")
      .trim();
    let ko = toKoreanTeamName(stripped);
    if (ko === stripped) {
      const spaced = stripped.replace(/\./g, ". ").replace(/\s+/g, " ").trim();
      if (spaced !== stripped) {
        const ko2 = toKoreanTeamName(spaced);
        if (ko2 !== spaced) ko = ko2;
      }
    }
    return ko.toLowerCase().replace(/[\s.·\-_]/g, "");
  }
  // 라이브 매치를 페이지의 KST 일자로 필터 — 다른 날짜 매치가 같은 팀명으로 false-match 되는 것 방지.
  // (예: 5/15 한화-KT 라이브 데이터가 5/16 한화-KT DB 매치에 잘못 붙어 "진행 중" 으로 보이던 버그)
  const liveForThisDay = liveMatches.filter((lm) => {
    const kstDate = new Date(new Date(lm.startTime).getTime() + 9 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    return kstDate === dateStr;
  });
  for (const lm of liveForThisDay) {
    const rawId = lm.id.replace(/^[a-z]+-/i, "");
    liveByExternalId.set(rawId, lm);
    liveByNameKey.set(
      `${lm.league}|${normalizeName(lm.homeName)}|${normalizeName(lm.awayName)}`,
      lm,
    );
  }
  function matchLive(m: {
    externalId: string;
    league: string;
    startTime: Date;
    homeTeam: { name: string };
    awayTeam: { name: string };
  }): LiveMatch | undefined {
    const exact =
      liveByExternalId.get(m.externalId) ??
      liveByNameKey.get(
        `${m.league}|${normalizeName(m.homeTeam.name)}|${normalizeName(m.awayTeam.name)}`,
      );
    if (exact) return exact;
    // substring fallback — api-football "Urawa" vs DB "Urawa Red Diamonds" 등
    // 양쪽 normalize 후 둘 중 한쪽이 다른쪽 포함하면 매치로 간주.
    const dbHome = normalizeName(m.homeTeam.name);
    const dbAway = normalizeName(m.awayTeam.name);
    for (const lm of liveForThisDay) {
      if (lm.league !== m.league) continue;
      const lh = normalizeName(lm.homeName);
      const la = normalizeName(lm.awayName);
      const homeOk = lh.includes(dbHome) || dbHome.includes(lh);
      const awayOk = la.includes(dbAway) || dbAway.includes(la);
      if (homeOk && awayOk) return lm;
    }
    return undefined;
  }

  // 매치 → 정규화 (sport 분기 + 라이브 보강)
  const normalized = matches.map((m) => {
    const live = matchLive(m);
    const elapsedMs = Date.now() - m.startTime.getTime();
    const staleLive =
      !live && m.status === "LIVE" && elapsedMs > 4 * 3600 * 1000;
    const effStatus = live ? "LIVE" : staleLive ? "FINISHED" : m.status;
    const homeScore = live ? live.homeScore : m.homeScore;
    const awayScore = live ? live.awayScore : m.awayScore;
    const sport_ = sportFromLeague(m.league);
    const isBaseball = BASEBALL_LEAGUES.has(m.league);
    const preview = m.articles.find((a) => a.type === "PREVIEW")?.slug;
    const recap = m.articles.find((a) => a.type === "RECAP")?.slug;

    // 야구 (KBO/NPB/MLB) 와 LOL 은 자체 라이브 상세 페이지로.
    // 그 외 종목은 글 (recap > preview) 우선.
    let href: string | null = null;
    if (m.league === "MLB") href = `/live/mlb/${m.externalId}`;
    else if (m.league === "KBO") href = `/live/kbo/${m.externalId}`;
    else if (m.league === "NPB") href = `/live/npb/${m.externalId}`;
    else if (m.league === "LOL") href = `/live/lol/${m.externalId}`;
    else if (
      m.league === "NBA" ||
      m.league === "NHL" ||
      m.league === "EPL" ||
      m.league === "LALIGA" ||
      m.league === "BUNDESLIGA" ||
      m.league === "SERIE_A" ||
      m.league === "LIGUE_1" ||
      m.league === "MLS" ||
      m.league === "UCL" ||
      m.league === "WORLD_CUP"
    ) {
      href = `/live/${m.league}/${m.externalId}`;
    } else if (recap) href = `/articles/${recap}`;
    else if (preview) href = `/articles/${preview}`;

    return {
      id: m.id,
      sport: sport_,
      league: m.league,
      status: effStatus as "LIVE" | "FINISHED" | "SCHEDULED" | "POSTPONED",
      home: {
        name: toKoreanTeamName(m.homeTeam.name),
        abbr: m.homeTeam.shortName,
        logo: m.homeTeam.logoUrl,
        score: homeScore,
      },
      away: {
        name: toKoreanTeamName(m.awayTeam.name),
        abbr: m.awayTeam.shortName,
        logo: m.awayTeam.logoUrl,
        score: awayScore,
      },
      startTime: m.startTime,
      timeLabel: kstHHmm(m.startTime),
      liveStatusLabel: live?.statusLabel ?? null,
      homeStarter: isBaseball
        ? localizeStarter(parseStarter(m.homeStarter), m.league)
        : null,
      awayStarter: isBaseball
        ? localizeStarter(parseStarter(m.awayStarter), m.league)
        : null,
      soccerCtx:
        sport_ === "soccer" && live ? parseSoccerStatus(live.statusLabel) : null,
      // ESPN event id 매칭 + team-name fallback (EPL 등 DB externalId ≠ ESPN id)
      soccerGoals:
        sport_ === "soccer"
          ? soccerGoalsMap[m.externalId] ??
            soccerGoalsMap[
              soccerGoalsPairKey(m.awayTeam.name, m.homeTeam.name)
            ] ??
            null
          : null,
      esportsCtx:
        sport_ === "esports" && live?.esports
          ? ({
              bestOf: live.esports.bestOf,
              currentGame: live.esports.currentGame,
              series: live.esports.series,
            } as EsportsContext)
          : null,
      periodLinescore:
        sport_ === "basketball" || sport_ === "hockey"
          ? periodMap[m.externalId] ?? null
          : null,
      // LIVE 매치는 live.baseball 우선, 종료된 매치는 fetchBaseballByDate
      // 결과 (externalId key) 에서 가져옴. 둘 다 없으면 null.
      baseballLinescore: isBaseball
        ? (() => {
            const details =
              live?.baseball ?? baseballDetailsMap[m.externalId];
            if (!details) return null;
            return {
              awayInnings: details.awayInnings,
              homeInnings: details.homeInnings,
              awayScore: awayScore ?? 0,
              homeScore: homeScore ?? 0,
              awayHits: details.awayHits,
              homeHits: details.homeHits,
              awayErrors: details.awayErrors,
              homeErrors: details.homeErrors,
              awayLabel: shortLabel(
                m.awayTeam.shortName,
                toKoreanTeamName(m.awayTeam.name),
              ),
              homeLabel: shortLabel(
                m.homeTeam.shortName,
                toKoreanTeamName(m.homeTeam.name),
              ),
            };
          })()
        : null,
      // 라이브 야구 컨텍스트 (베이스/아웃/회·말) — ESPN MLB 만 채워짐 (KBO/NPB 는 ESPN 데이터 없음).
      baseballCtx: isBaseball
        ? baseballDetailsMap[m.externalId]?.ctx
          ? ({
              inning: baseballDetailsMap[m.externalId].ctx!.inning ?? undefined,
              half: baseballDetailsMap[m.externalId].ctx!.half,
              outs: baseballDetailsMap[m.externalId].ctx!.outs,
              bases: baseballDetailsMap[m.externalId].ctx!.bases,
            } satisfies BaseballContext)
          : null
        : null,
      preview,
      recap,
      href,
    };
  });

  // 상태 그룹화
  const liveList = normalized.filter((m) => m.status === "LIVE");
  const scheduledList = normalized.filter((m) => m.status === "SCHEDULED");
  const finishedList = normalized.filter((m) => m.status === "FINISHED");

  // 라이브 카운트 (종목 탭 dot 표시용)
  const liveCounts: Partial<Record<SportCode, number>> = {};
  for (const m of liveList) {
    const sCode = SPORTS.find((s) => s.leagues.includes(m.league))?.code;
    if (sCode) liveCounts[sCode] = (liveCounts[sCode] ?? 0) + 1;
    liveCounts.all = (liveCounts.all ?? 0) + 1;
  }

  // 빈 상태 → 가까운 가용 일자 lookup (±7일 내)
  let nextAvailable: { date: string; label: string } | null = null;
  if (normalized.length === 0) {
    const rangeStart = new Date(day.getTime() - 7 * 24 * 3600 * 1000);
    const rangeEnd = new Date(day.getTime() + 7 * 24 * 3600 * 1000);
    const nearby = await prisma.match.findFirst({
      where: {
        league: { in: leagues },
        startTime: { gte: rangeStart, lt: rangeEnd, not: day },
      },
      orderBy: { startTime: "asc" },
      select: { startTime: true },
    });
    if (nearby) {
      const nd = new Date(nearby.startTime);
      nextAvailable = {
        date: dateQuery(new Date(nd.getTime() - (nd.getTime() % (24 * 3600 * 1000)))),
        label: kstDateLabel(nd),
      };
    }
  }

  const extraQuery = leagueFilter ? `&league=${leagueFilter}` : "";

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-4">
      {/* 헤더 */}
      <header className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            라이브 스코어
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500">
            {kstDateLabel(day)} · 총 {normalized.length}경기
            {liveList.length > 0 && (
              <span className="ml-2 text-rose-600 dark:text-rose-400 font-semibold">
                ● LIVE {liveList.length}
              </span>
            )}
          </p>
        </div>
        <LiveRefresher liveCount={liveList.length} />
      </header>

      {/* 종목 탭 */}
      <SportTabs activeSport={sport} liveCounts={liveCounts} date={dateStr} />

      {/* 일자 슬라이더 */}
      <DateSlider selectedDate={dateStr} sport={sport} extraQuery={extraQuery} />

      {/* 리그 필터 (해당 종목 리그가 2개 이상일 때만) */}
      {leaguesAll.length > 1 && (
        <LeagueChips
          leagues={leaguesAll}
          activeLeague={leagueFilter}
          sport={sport}
          date={dateStr}
        />
      )}

      {/* 매치 list — 상태별 그룹 + 즐겨찾기 섹션 */}
      {normalized.length === 0 ? (
        <EmptyState sport={sport} nextAvailable={nextAvailable} />
      ) : (
        <div className="space-y-6">
          {/* 즐겨찾기 매치 (localStorage 기반, client) — 최상단 */}
          <FavoriteMatches
            matches={normalized.map((m) => ({
              id: String(m.id),
              sortKey:
                m.status === "LIVE" ? 0 : m.status === "SCHEDULED" ? 1 : 2,
              matchId: String(m.id),
              sport: m.sport,
              status:
                m.status === "LIVE"
                  ? "live"
                  : m.status === "FINISHED"
                    ? "finished"
                    : m.status === "POSTPONED"
                      ? "postponed"
                      : "scheduled",
              league: m.league,
              leagueLabel: LEAGUE_DISPLAY[m.league] ?? m.league,
              home: m.home,
              away: m.away,
              timeLabel: m.timeLabel,
              liveStatusLabel: m.liveStatusLabel,
              baseballCtx: m.baseballCtx,
              baseballLinescore: m.baseballLinescore,
              periodLinescore: m.periodLinescore,
              soccerGoals: m.soccerGoals,
              soccerCtx: m.soccerCtx,
              esportsCtx: m.esportsCtx,
              homeStarter: m.homeStarter,
              awayStarter: m.awayStarter,
              href: m.href,
              actions: actionsFor(m),
            }))}
          />
          {/* 축구 카테고리 — named.com 스타일 row layout */}
          {sport === "soccer" ? (
            <SoccerRowLayout
              liveList={liveList}
              scheduledList={scheduledList}
              finishedList={finishedList}
            />
          ) : (
            <>
              {liveList.length > 0 && (
                <Section title="🔴 진행 중" count={liveList.length}>
                  {liveList.map((m) => renderCard(m))}
                </Section>
              )}
              {scheduledList.length > 0 && (
                <Section title="⏳ 예정" count={scheduledList.length}>
                  {scheduledList.map((m) => renderCard(m))}
                </Section>
              )}
              {finishedList.length > 0 && (
                <Section title="✅ 종료" count={finishedList.length}>
                  {finishedList.map((m) => renderCard(m))}
                </Section>
              )}
            </>
          )}
        </div>
      )}

      <p className="text-[11px] text-neutral-500 leading-relaxed pt-2">
        ⓘ 라이브 매치는 30초 간격으로 자동 갱신. 베이스 상황·볼카운트 등 KBO/NPB 상세는 외부 라이브 데이터 미제공으로 표시되지 않습니다.
      </p>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2.5 px-1">
        <h2 className="text-sm font-bold tracking-tight">{title}</h2>
        <span className="text-[11px] text-neutral-400 tabular-nums">
          {count}경기
        </span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</ul>
    </section>
  );
}

/** 축구 row layout — named.com 스타일 한 줄 매치 표. */
function SoccerRowLayout({
  liveList,
  scheduledList,
  finishedList,
}: {
  liveList: NormalizedMatch[];
  scheduledList: NormalizedMatch[];
  finishedList: NormalizedMatch[];
}) {
  const renderRow = (m: NormalizedMatch) => {
    const statusKey: "scheduled" | "live" | "finished" | "postponed" =
      m.status === "LIVE"
        ? "live"
        : m.status === "FINISHED"
          ? "finished"
          : m.status === "POSTPONED"
            ? "postponed"
            : "scheduled";
    return (
      <SoccerLiveRow
        key={String(m.id)}
        matchId={m.id}
        league={m.league}
        status={statusKey}
        timeLabel={m.timeLabel}
        liveStatusLabel={m.liveStatusLabel}
        home={{
          name: m.home.name,
          logo: m.home.logo ?? null,
        }}
        away={{
          name: m.away.name,
          logo: m.away.logo ?? null,
        }}
        homeScore={m.home.score}
        awayScore={m.away.score}
        soccerGoals={m.soccerGoals}
        homeShort={m.home.abbr ?? m.home.name}
        awayShort={m.away.abbr ?? m.away.name}
        previewSlug={m.preview ?? null}
        recapSlug={m.recap ?? null}
        href={m.href}
      />
    );
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-x-auto">
        {/* 하단 pb-32 — 마지막 row 의 GoalsTooltip (점수 hover 시 양 팀 골 list) 가 컨테이너 끝에서 잘리지 않게 ~3행 분량 여백 확보 */}
        <div className="min-w-[860px] px-4 pt-1 pb-32">
          <SoccerLiveRowHeader />
          {liveList.length > 0 && (
            <>
              <div className="px-0 pt-3 pb-1 text-[11px] font-bold text-rose-600 dark:text-rose-500">
                ● 진행 중 ({liveList.length})
              </div>
              {liveList.map(renderRow)}
            </>
          )}
          {scheduledList.length > 0 && (
            <>
              <div className="px-0 pt-3 pb-1 text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
                ⏳ 예정 ({scheduledList.length})
              </div>
              {scheduledList.map(renderRow)}
            </>
          )}
          {finishedList.length > 0 && (
            <>
              <div className="px-0 pt-3 pb-1 text-[11px] font-bold text-neutral-500">
                ✅ 종료 ({finishedList.length})
              </div>
              {finishedList.map(renderRow)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

type NormalizedMatch = {
  id: string | number;
  sport: string;
  league: string;
  status: "LIVE" | "FINISHED" | "SCHEDULED" | "POSTPONED";
  home: { name: string; abbr?: string | null; logo?: string | null; score: number | null };
  away: { name: string; abbr?: string | null; logo?: string | null; score: number | null };
  timeLabel: string;
  liveStatusLabel: string | null;
  homeStarter: string | null;
  awayStarter: string | null;
  soccerCtx: SoccerContext | null;
  soccerGoals: SoccerGoal[] | null;
  esportsCtx: EsportsContext | null;
  baseballCtx: BaseballContext | null;
  baseballLinescore: BaseballLinescoreData | null;
  periodLinescore: PeriodLinescoreData | null;
  preview?: string;
  recap?: string;
  href: string | null;
};

function actionsFor(m: NormalizedMatch) {
  if (!m.preview && !m.recap) return null;
  return (
    <>
      {m.preview && (
        <Link
          href={`/articles/${m.preview}`}
          prefetch={false}
          className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/25 transition"
        >
          프리뷰
        </Link>
      )}
      {m.recap && (
        <Link
          href={`/articles/${m.recap}`}
          prefetch={false}
          className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 transition"
        >
          리뷰
        </Link>
      )}
    </>
  );
}

function renderCard(m: NormalizedMatch) {
  const statusKey: "scheduled" | "live" | "finished" | "postponed" =
    m.status === "LIVE"
      ? "live"
      : m.status === "FINISHED"
        ? "finished"
        : m.status === "POSTPONED"
          ? "postponed"
          : "scheduled";

  return (
    <MatchCard
      key={String(m.id)}
      matchId={m.id}
      sport={m.sport}
      status={statusKey}
      league={m.league}
      leagueLabel={LEAGUE_DISPLAY[m.league] ?? m.league}
      home={m.home}
      away={m.away}
      timeLabel={m.timeLabel}
      liveStatusLabel={m.liveStatusLabel}
      baseballCtx={m.baseballCtx}
      baseballLinescore={m.baseballLinescore}
      periodLinescore={m.periodLinescore}
      soccerGoals={m.soccerGoals}
      soccerCtx={m.soccerCtx}
      esportsCtx={m.esportsCtx}
      homeStarter={m.homeStarter}
      awayStarter={m.awayStarter}
      href={m.href}
      actions={actionsFor(m)}
    />
  );
}

// LEAGUE_ORDER import 유지 (LEAGUE_DISPLAY 와 함께 sport-leagues 에서 export됨)
void LEAGUE_ORDER;
