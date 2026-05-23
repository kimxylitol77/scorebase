// /scores — 라이브/종료/예정 통합 스코어 페이지 (named.com 스타일 박스 카드).
// 구조: SportTabs → DateSlider → LeagueChips → MatchCard 그리드 (LIVE→예정→종료 그룹).
// LIVE 매치 있으면 LiveRefresher 가 30초마다 router.refresh().

import Link from "next/link";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import {
  SPORTS,
  leaguesForSport,
  LEAGUE_DISPLAY,
  LEAGUE_ORDER,
  type SportCode,
} from "@/lib/sports/sport-leagues";
import { toKoreanTeamName } from "@/lib/team-names";
import { getStandingsForLeagues } from "@/lib/sports/thesports/standings-helper";
import { npbPlayerToKorean } from "@/lib/sports/npb-player-names";
import { toKoreanPlayerName } from "@/lib/player-names";
import { buildSportsEventLocation } from "@/lib/seo/sports-event-location";
import {
  fetchAllLiveScores,
  fetchBaseballByDate,
  fetchMlbByDate,
  fetchSoccerGoalsByDate,
  fetchEspnPeriodLinescores,
  extractNbaUltraPeriodsFromRaw,
  soccerGoalsPairKey,
  type BaseballGameDetails,
  type PeriodLinescore as PeriodLinescoreData,
  type SoccerGoal,
  type LiveMatch,
} from "@/lib/sports/live-scores";
import SportTabs from "@/components/scores/SportTabs";
import DateSlider from "@/components/scores/DateSlider";
import LeagueChips from "@/components/scores/LeagueChips";
import SoccerStatusTabs, {
  type SoccerStatusFilter,
} from "@/components/scores/SoccerStatusTabs";
import MatchCard from "@/components/scores/MatchCard";
import FavoriteMatches from "@/components/scores/FavoriteMatches";
import EmptyState from "@/components/scores/EmptyState";
import LiveRefresher from "@/components/scores/LiveRefresher";
import SoccerCompactCard from "@/components/scores/soccer/SoccerCompactCard";
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
  searchParams: Promise<{
    date?: string;
    sport?: string;
    league?: string;
    /** soccer 전용 — all | live | scheduled | finished */
    status?: string;
  }>;
}

const BASEBALL_LEAGUES = new Set(["KBO", "NPB", "MLB"]);
// SPORTS 정의에서 soccer 리그를 그대로 사용 — 추가 리그 (CHILE_PB, POLAND_1L 등) 동기화 자동 반영
const SOCCER_LEAGUES = new Set(
  SPORTS.find((s) => s.code === "soccer")?.leagues ?? [],
);

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

/** 매치 starter 이름 한글화.
 *  - NPB: 카나 → 한국어 음역 (npbPlayerToKorean). 한국어 + 카나 혼합 깨짐 감지 시 숨김.
 *  - MLB/KBO 등: player-names 사전 lookup (toKoreanPlayerName). 미등록은 영문 그대로.
 */
function localizeStarter(name: string | null, league: string): string | null {
  if (!name) return null;
  if (league === "NPB") {
    // 깨진 mid-conversion 결과 — 한국어 + 일본 카나 mix 시 숨김.
    if (/[가-힣]/.test(name) && /[぀-ゟ゠-ヿ]/.test(name)) return null;
    return npbPlayerToKorean(name);
  }
  // 이미 한글이면 그대로
  if (/[가-힣]/.test(name)) return name;
  return toKoreanPlayerName(name) || name;
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

/** goal.minute ("67'" / "45+2'") 에서 분 추출 — 추가시간 포함 합. */
function parseGoalMinute(minute: string): number {
  const m = minute.match(/(\d+)(?:\+(\d+))?/);
  if (!m) return 0;
  return parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) : 0);
}

/**
 * 라이브 매치의 최근 1분 내 골 측 판정.
 * - statusLabel 의 elapsed (전반/후반 N') 와 골 minute 차이 ≤ 1 → recent
 * - 가장 최근 골의 side 반환 (없으면 null)
 */
function findRecentGoalSide(
  statusLabel: string | null | undefined,
  goals: SoccerGoal[] | null,
): "home" | "away" | null {
  if (!goals || goals.length === 0) return null;
  const status = parseSoccerStatus(statusLabel);
  const elapsed = status?.minute;
  if (typeof elapsed !== "number") return null;
  // 가장 최근 시각의 골 (분 + 추가시간 기준)
  const sorted = [...goals].sort((a, b) => parseGoalMinute(b.minute) - parseGoalMinute(a.minute));
  const latest = sorted[0];
  if (elapsed - parseGoalMinute(latest.minute) <= 1) return latest.side;
  return null;
}

// SEO: 종목별 한글/영문 라벨 + 키워드.
// 검색량 (월): "라이브 스코어"·"라이브스코어" 각 183만, "스포츠중계" 67만(+83%),
// "야구 중계" 13.5만(+83%), "라이브 스포츠" 1.8만(+124%), "KBO 일정" 1.2만 — 합산 250만+.
const SPORT_NAMES_KO: Record<string, string> = {
  all: "스포츠",
  soccer: "축구",
  baseball: "야구",
  basketball: "농구",
  hockey: "하키",
  esports: "e스포츠",
};
const SPORT_NAMES_EN: Record<string, string> = {
  all: "Sports",
  soccer: "Soccer",
  baseball: "Baseball",
  basketball: "Basketball",
  hockey: "Ice Hockey",
  esports: "Esports",
};
const SPORT_LEAGUE_BLURB: Record<string, string> = {
  all: "축구·야구·농구·하키·e스포츠 14개 리그",
  soccer: "K리그·EPL·라리가·분데스·세리에A·UCL·UEL·MLS",
  baseball: "KBO·NPB·MLB",
  basketball: "NBA",
  hockey: "NHL",
  esports: "LCK·롤드컵",
};
const COMMON_HIGH_VOLUME_KEYWORDS = [
  "라이브 스코어",
  "라이브스코어",
  "실시간 스코어",
  "스포츠중계",
  "라이브 스포츠",
  "스포츠 스코어",
  "오늘 경기 일정",
  "스포츠 일정",
];
const SPORT_KEYWORDS: Record<string, string[]> = {
  all: [
    "오늘 경기", "오늘 스포츠", "스포츠 라이브", "전 종목 라이브 스코어",
  ],
  soccer: [
    "축구 라이브 스코어", "축구 중계", "축구 일정", "오늘 축구",
    "EPL 라이브", "프리미어리그 일정", "K리그 일정", "J리그 일정",
    "UCL 라이브", "AFC 챔피언스리그",
  ],
  baseball: [
    "야구 라이브 스코어", "야구 중계", "오늘 야구",
    "KBO 라이브", "KBO 일정", "KBO 라이브 스코어",
    "MLB 라이브", "NPB 라이브", "프로야구 일정", "프로야구 중계", "오늘 KBO",
  ],
  basketball: [
    "농구 라이브 스코어", "NBA 라이브", "NBA 일정", "오늘 NBA", "KBL 라이브",
  ],
  hockey: [
    "하키 라이브 스코어", "NHL 라이브", "NHL 일정",
  ],
  esports: [
    "LCK 라이브", "LCK 일정", "LCK 스코어",
    "롤 라이브", "롤드컵 일정", "e스포츠 라이브",
  ],
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const sportCode = (SPORTS.find((s) => s.code === sp.sport)?.code ?? "soccer") as SportCode;
  const day = parseKstDate(sp.date);
  const dateStr = dateQuery(day);
  const dateKo = kstDateLabel(day); // "5월 17일 (일)"
  const sportKo = SPORT_NAMES_KO[sportCode] ?? "스포츠";
  const leagueBlurb = SPORT_LEAGUE_BLURB[sportCode] ?? "주요 리그";
  const leagueQ = sp.league ? `&league=${sp.league}` : "";
  const url = `${SITE_URL}/scores?sport=${sportCode}&date=${dateStr}${leagueQ}`;

  const title = `${dateKo} ${sportKo} 라이브 스코어 · 일정 · 결과 — 스코어베이스`;
  const description =
    `${dateKo} ${sportKo} 경기 일정·라이브 스코어·종료 결과. ` +
    `${leagueBlurb} 통합. Elo 모델 승률 추정·Value Bet·15초 자동 갱신. 스코어베이스.`;

  const keywords = [
    `${dateKo} ${sportKo}`,
    `${sportKo} 라이브 스코어`,
    `${sportKo} 일정`,
    `오늘 ${sportKo}`,
    ...COMMON_HIGH_VOLUME_KEYWORDS,
    ...(SPORT_KEYWORDS[sportCode] ?? []),
    "스코어베이스", "Scorebase",
  ];

  // 종목별 OG 이미지가 아직 없어서 기본 /og-image.png 폴백.
  const ogImage = "/og-image.png";

  // thin content noindex — 오늘 date 외, league/status filter 적용된 URL 은 Google 색인 제외.
  // 검색 가치 = sport 별 base URL (예: /scores?sport=soccer). 나머지는 duplicate signal.
  const todayKstStr = dateQuery(new Date());
  const isThin =
    (sp.date && dateStr !== todayKstStr) ||
    Boolean(sp.league) ||
    (sp.status !== undefined && sp.status !== "all");

  return {
    title: { absolute: title },
    description,
    keywords,
    alternates: { canonical: url },
    ...(isThin && { robots: { index: false, follow: true } }),
    openGraph: {
      title,
      description,
      url,
      siteName: "스코어베이스",
      locale: "ko_KR",
      type: "website",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${dateKo} ${sportKo} 라이브 스코어 — 스코어베이스`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function ScoresPage({ searchParams }: Props) {
  const sp = await searchParams;
  const sport = (SPORTS.find((s) => s.code === sp.sport)?.code ?? "soccer") as SportCode;
  const leaguesAll = leaguesForSport(sport);
  const leagueFilter = sp.league && leaguesAll.includes(sp.league) ? sp.league : null;
  const leagues = leagueFilter ? [leagueFilter] : leaguesAll;
  // 축구 전용 상태 필터 (다른 종목엔 무시)
  const statusFilter: SoccerStatusFilter =
    sport === "soccer" && (sp.status === "live" || sp.status === "scheduled" || sp.status === "finished")
      ? sp.status
      : "all";
  const day = parseKstDate(sp.date);
  const dayEnd = new Date(day.getTime() + 24 * 3600 * 1000);
  const dateStr = sp.date ?? dateQuery(day);

  // 축구만 ±1일 윈도우 — KST 자정 boundary 시차 매치 (유럽/북미) 누락 회피.
  // 야구/농구/하키/롤은 선택 일자만 표시 (자정 시차 영향 적고 일자별 보기 깔끔).
  const soccerRangeStart = new Date(day.getTime() - 24 * 3600 * 1000);
  const soccerRangeEnd = new Date(day.getTime() + 48 * 3600 * 1000);
  const soccerWindow = { gte: soccerRangeStart, lt: soccerRangeEnd };
  const dayWindow = { gte: day, lt: dayEnd };

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
        status: { not: "POSTPONED" },
        // TBD placeholder 매치 영구 제외 (NBA/NHL 컨퍼런스 파이널 차기 라운드 미정 등).
        // status=LIVE 로 잘못 cron update 되더라도 페이지에선 항상 hide.
        // "Sabres/Canadiens" 같은 슬래시 포함 placeholder (NHL 다음 라운드 미정) 도 제외.
        // 선택 일자 이전(어제)의 FINISHED 매치 제외 — 이미 끝난 어제 경기는 노출 X.
        // 자정 boundary 라이브/예정 매치는 유지 (status != FINISHED).
        AND: [
          { homeTeam: { is: { name: { notIn: ["TBD", "TTBD", "TBDT"] } } } },
          { awayTeam: { is: { name: { notIn: ["TBD", "TTBD", "TBDT"] } } } },
          { homeTeam: { is: { name: { not: { contains: "/" } } } } },
          { awayTeam: { is: { name: { not: { contains: "/" } } } } },
          {
            NOT: { status: "FINISHED", startTime: { lt: day } },
          },
        ],
        // 축구만 ±1일 윈도우, 그 외 종목은 선택 일자만.
        // "all" 탭은 OR 로 분기, 단일 종목/리그 탭은 단일 윈도우.
        ...(sport === "all" && !leagueFilter
          ? {
              OR: [
                {
                  league: { in: leagues.filter((l) => SOCCER_LEAGUES.has(l)) },
                  startTime: soccerWindow,
                },
                {
                  league: { in: leagues.filter((l) => !SOCCER_LEAGUES.has(l)) },
                  startTime: dayWindow,
                },
              ],
            }
          : {
              league: { in: leagues },
              startTime:
                (leagueFilter ? SOCCER_LEAGUES.has(leagueFilter) : sport === "soccer")
                  ? soccerWindow
                  : dayWindow,
            }),
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        articles: {
          where: { status: "PUBLISHED" },
          select: { slug: true, type: true },
        },
        liveCommentary: true,
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
  // NBA Ultra (api-sports) 매치는 ESPN ID 가 아니라 ESPN linescore 조회 안 됨.
  // Match.raw 의 NBA Ultra response 에 linescore 가 이미 있으므로 그걸 parse 해서 merge.
  for (const m of matches) {
    if (m.league !== "NBA") continue;
    if (periodMap[m.externalId]) continue;
    const parsed = extractNbaUltraPeriodsFromRaw(m.raw);
    if (parsed) periodMap[m.externalId] = parsed;
  }

  // KBO/NPB LIVE 매치의 베이스/아웃 컨텍스트 — TheSportsMatchCache 에서 보강
  // (api-sports baseball 은 KBO/NPB ctx 미제공)
  const baseballCacheCtx = new Map<string, { bases: [boolean, boolean, boolean]; outs: number | null }>();
  const baseballLiveDbIds = matches
    .filter((m) => (m.league === "KBO" || m.league === "NPB") && m.status === "LIVE")
    .map((m) => m.id);
  if (baseballLiveDbIds.length > 0) {
    const caches = await prisma.theSportsMatchCache.findMany({
      where: { matchId: { in: baseballLiveDbIds } },
      select: { matchId: true, detailLive: true },
    });
    const idToExt = new Map(matches.map((m) => [m.id, m.externalId] as const));
    for (const c of caches) {
      const dl = c.detailLive as { extra?: { base?: string; out?: number } } | null;
      if (!dl?.extra) continue;
      const baseStr =
        typeof dl.extra.base === "string" && /^[01]{3}$/.test(dl.extra.base) ? dl.extra.base : "000";
      const ext = idToExt.get(c.matchId);
      if (!ext) continue;
      baseballCacheCtx.set(ext, {
        bases: [baseStr[0] === "1", baseStr[1] === "1", baseStr[2] === "1"],
        outs: typeof dl.extra.out === "number" ? dl.extra.out : null,
      });
    }
  }
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

  // TheSports standings — 카드 팀명 옆 [순위] 표시용. 축구 리그만 prefetch.
  const soccerLeaguesInPage = Array.from(
    new Set(
      matches
        .filter((m) => (SPORTS.find((s) => s.code === "soccer")?.leagues ?? []).includes(m.league))
        .map((m) => m.league),
    ),
  );
  const standingsByLeague = soccerLeaguesInPage.length > 0
    ? await getStandingsForLeagues(soccerLeaguesInPage)
    : new Map<string, Map<number, number>>();

  // 매치 → 정규화 (sport 분기 + 라이브 보강)
  const normalized = matches.map((m) => {
    const live = matchLive(m);
    const elapsedMs = Date.now() - m.startTime.getTime();
    const staleLive =
      !live && m.status === "LIVE" && elapsedMs > 4 * 3600 * 1000;
    const effStatus = live ? "LIVE" : staleLive ? "FINISHED" : m.status;
    // monotonic max(live, DB.Match) — TheSports MQTT/fast-poller 가 채운 DB 가 live (api-sports 15-30s) 보다 fresh 한 경우 그쪽 사용.
    // 점수는 단방향 증가 — 더 큰 값이 안전.
    const liveH = live?.homeScore;
    const liveA = live?.awayScore;
    const dbH = m.homeScore;
    const dbA = m.awayScore;
    const homeScore = liveH != null && dbH != null ? Math.max(liveH, dbH) : (liveH ?? dbH);
    const awayScore = liveA != null && dbA != null ? Math.max(liveA, dbA) : (liveA ?? dbA);
    const sport_ = sportFromLeague(m.league);
    const isBaseball = BASEBALL_LEAGUES.has(m.league);
    const preview = m.articles.find((a) => a.type === "PREVIEW")?.slug;
    const recap = m.articles.find((a) => a.type === "RECAP")?.slug;

    // 모든 매치 → 라이브 상세 페이지로 (점수판 클릭 시 매치 detail 우선).
    // KBO/NPB/MLB/LOL 은 전용 라우트, NBA/NHL/축구 (36 리그) 는 /live/{league}/{externalId}.
    let href: string | null = null;
    if (m.league === "MLB") href = `/live/mlb/${m.externalId}`;
    else if (m.league === "KBO") href = `/live/kbo/${m.externalId}`;
    else if (m.league === "NPB") href = `/live/npb/${m.externalId}`;
    else if (m.league === "LOL") href = `/live/lol/${m.externalId}`;
    else if (m.league === "NBA" || m.league === "NHL" || SOCCER_LEAGUES.has(m.league)) {
      href = `/live/${m.league}/${m.externalId}`;
    } else if (recap) href = `/articles/${recap}`;
    else if (preview) href = `/articles/${preview}`;

    return {
      id: m.id,
      sport: sport_,
      league: m.league,
      status: effStatus as "LIVE" | "FINISHED" | "SCHEDULED" | "POSTPONED",
      home: {
        name: toKoreanTeamName(m.homeTeam.name, m.league),
        abbr: m.homeTeam.shortName,
        logo: m.homeTeam.logoUrl,
        score: homeScore,
        teamId: m.homeTeamId,
        position: standingsByLeague.get(m.league)?.get(m.homeTeamId) ?? null,
      },
      away: {
        name: toKoreanTeamName(m.awayTeam.name, m.league),
        abbr: m.awayTeam.shortName,
        logo: m.awayTeam.logoUrl,
        score: awayScore,
        teamId: m.awayTeamId,
        position: standingsByLeague.get(m.league)?.get(m.awayTeamId) ?? null,
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
      // 라이브 매치 한정: 최근 1분 내 골 발생 측 (점수 셀 노란 highlight)
      recentGoalSide:
        sport_ === "soccer" && effStatus === "LIVE" && live
          ? findRecentGoalSide(
              live.statusLabel,
              soccerGoalsMap[m.externalId] ??
                soccerGoalsMap[soccerGoalsPairKey(m.awayTeam.name, m.homeTeam.name)] ??
                null,
            )
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
                toKoreanTeamName(m.awayTeam.name, m.league),
              ),
              homeLabel: shortLabel(
                m.homeTeam.shortName,
                toKoreanTeamName(m.homeTeam.name, m.league),
              ),
            };
          })()
        : null,
      // 라이브 야구 컨텍스트 (베이스/아웃/회·말).
      // KBO/NPB: TheSportsMatchCache (baseballCacheCtx) 우선 — ESPN MLB 는 baseballDetailsMap.ctx.
      baseballCtx: isBaseball
        ? (() => {
            const cached = baseballCacheCtx.get(m.externalId);
            if (cached) {
              return {
                inning: undefined,
                half: null,
                outs: cached.outs,
                bases: cached.bases,
              } satisfies BaseballContext;
            }
            const mlb = baseballDetailsMap[m.externalId]?.ctx;
            if (mlb) {
              return {
                inning: mlb.inning ?? undefined,
                half: mlb.half,
                outs: mlb.outs,
                bases: mlb.bases,
              } satisfies BaseballContext;
            }
            return null;
          })()
        : null,
      liveCommentary:
        isBaseball && m.liveCommentary
          ? {
              matchSummary: m.liveCommentary.matchSummary,
              summaryAt: m.liveCommentary.summaryAt,
              scoreSnapshot: m.liveCommentary.scoreSnapshot,
            }
          : null,
      preview,
      recap,
      href,
    };
  });

  // 상태 그룹화
  const liveList = normalized.filter((m) => m.status === "LIVE");
  const scheduledList = normalized.filter((m) => m.status === "SCHEDULED");
  // 종료 섹션 — effStatus=FINISHED 이면서 startTime 이 선택 일자(KST 자정) 이후인 매치만.
  // 어제 LIVE 로 stuck 되었다가 staleLive 로 FINISHED 변환된 매치 (collector cron 누락 케이스)
  // 가 오늘 종료 섹션에 노출되는 문제 방지. 자정 boundary 매치는 startTime >= day 라 OK.
  const finishedList = normalized.filter(
    (m) => m.status === "FINISHED" && m.startTime.getTime() >= day.getTime(),
  );

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

  const extraQuery =
    (leagueFilter ? `&league=${leagueFilter}` : "") +
    (statusFilter !== "all" ? `&status=${statusFilter}` : "");

  // SEO 동적 값 — generateMetadata 와 일치시킴.
  const sportKo = SPORT_NAMES_KO[sport] ?? "스포츠";
  const dateKo = kstDateLabel(day);
  const leagueBlurb = SPORT_LEAGUE_BLURB[sport] ?? "주요 리그";
  const pageUrl = `${SITE_URL}/scores?sport=${sport}&date=${dateStr}${extraQuery}`;

  // JSON-LD: BreadcrumbList — 홈 → 라이브 스코어 → 종목 · 일자
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "홈", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "라이브 스코어", item: `${SITE_URL}/scores` },
      {
        "@type": "ListItem",
        position: 3,
        name: `${sportKo} · ${dateKo}`,
        item: pageUrl,
      },
    ],
  };
  // JSON-LD: ItemList (SportsEvent up to 20) — 검색 결과 rich snippet
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${dateKo} ${sportKo} 라이브 스코어 · 일정 · 결과`,
    numberOfItems: normalized.length,
    itemListElement: normalized.slice(0, 20).map((m, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "SportsEvent",
        name: `${m.away.name} vs ${m.home.name}`,
        startDate: m.startTime.toISOString(),
        sport: SPORT_NAMES_EN[m.sport] ?? "Sports",
        location: buildSportsEventLocation({ league: m.league, homeName: m.home.name }),
        homeTeam: { "@type": "SportsTeam", name: m.home.name },
        awayTeam: { "@type": "SportsTeam", name: m.away.name },
        ...(m.href ? { url: `${SITE_URL}${m.href}` } : {}),
      },
    })),
  };

  // 모든 종목 동일 max-w-6xl (헤더와 일치) — 사이드바 + 메인이 그 안에 fit
  const containerMaxW = "max-w-6xl";

  // 축구 상태 필터 — 표시할 매치 결정
  // 오늘 KST 아닌 다른 날짜 선택 시 LIVE 섹션 숨김 (LIVE 는 현재 시점 매치 — 미래/과거 일자에선 의미 없음)
  const todayKstStr = dateQuery(new Date());
  const isToday = dateStr === todayKstStr;
  const showLive =
    isToday &&
    (sport !== "soccer" || statusFilter === "all" || statusFilter === "live");
  const showScheduled = sport !== "soccer" || statusFilter === "all" || statusFilter === "scheduled";
  const showFinished = sport !== "soccer" || statusFilter === "all" || statusFilter === "finished";
  const visibleLive = showLive ? liveList : [];
  const visibleScheduled = showScheduled ? scheduledList : [];
  const visibleFinished = showFinished ? finishedList : [];
  const visibleCount = visibleLive.length + visibleScheduled.length + visibleFinished.length;

  return (
    <div className={`${containerMaxW} mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-4`}>
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      {normalized.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
        />
      )}

      {/* 헤더 */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            라이브 스코어
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500">
            {dateKo} · 총 {normalized.length}경기
            {liveList.length > 0 && (
              <span className="ml-2 text-rose-600 dark:text-rose-400 font-semibold">
                ● LIVE {liveList.length}
              </span>
            )}
          </p>
        </div>
        <LiveRefresher liveCount={liveList.length} />
      </header>

      {/* SEO 친화 보조 텍스트 (H1 직후) — 검색 키워드 자연 포함 */}
      <p className="text-[13px] sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
        {dateKo} {sportKo} 라이브 스코어·경기 일정·종료 결과를 한곳에서 확인하세요.
        {" "}{leagueBlurb} 통합, Elo 모델 승률 추정, 15초 자동 갱신.
        {normalized.length === 0 && (
          <span className="block mt-1 text-neutral-500">
            해당 일자에 경기가 없습니다. 인접한 일자를 확인해 보세요.
          </span>
        )}
      </p>

      {/* 종목 탭 */}
      <SportTabs activeSport={sport} liveCounts={liveCounts} date={dateStr} />

      {/* 일자 슬라이더 */}
      <DateSlider selectedDate={dateStr} sport={sport} extraQuery={extraQuery} />

      {/* 축구: 사이드바 제거 — 매치 list 만 가운데 정렬 / 다른 종목: 기존 그대로 */}
      {sport === "soccer" ? (
        <div className="space-y-4">
            {/* 상태 탭 — 전체/라이브/예정/종료 */}
            <SoccerStatusTabs
              active={statusFilter}
              counts={{
                all: normalized.length,
                live: liveList.length,
                scheduled: scheduledList.length,
                finished: finishedList.length,
              }}
              date={dateStr}
              league={leagueFilter}
            />

            {/* 매치 list */}
            {normalized.length === 0 ? (
              <EmptyState sport={sport} nextAvailable={nextAvailable} />
            ) : visibleCount === 0 ? (
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 px-5 py-10 text-center text-sm text-neutral-500">
                선택한 상태에 해당하는 경기가 없습니다.
              </div>
            ) : (
              <div className="space-y-6">
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
                    liveCommentary: m.liveCommentary,
                  }))}
                />
                <SoccerRowLayout
                  liveList={visibleLive}
                  scheduledList={visibleScheduled}
                  finishedList={visibleFinished}
                />
              </div>
            )}
        </div>
      ) : (
        <>
          {/* 리그 필터 (해당 종목 리그가 2개 이상일 때만) */}
          {leaguesAll.length > 1 && (
            <LeagueChips
              leagues={leaguesAll}
              activeLeague={leagueFilter}
              sport={sport}
              date={dateStr}
            />
          )}

          {/* 매치 list */}
          {normalized.length === 0 ? (
            <EmptyState sport={sport} nextAvailable={nextAvailable} />
          ) : (
            <div className="space-y-6">
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
              {isToday && liveList.length > 0 && (
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
            </div>
          )}
        </>
      )}

      <p className="text-[11px] text-neutral-500 leading-relaxed pt-2">
        ⓘ 목록은 15초 자동 갱신. 매치 상세 페이지는 TheSports 라이브 푸시로 평균 2-3초 갱신 (KBO·NPB·MLB 베이스 상황·볼카운트 포함).
      </p>

      <section className="mt-8 sm:mt-10 pt-6 sm:pt-8 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
        <h2 className="text-base sm:text-lg font-bold tracking-tight">
          오늘의 라이브스코어 및 스포츠 분석
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
          오늘 진행되는 EPL, MLB, NBA, KBO 주요 경기의 라이브스코어와 실시간 경기 데이터를 제공합니다.
        </p>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
          경기 전{" "}
          <Link href="/previews" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            프리뷰
          </Link>{" "}
          분석과 종료 후{" "}
          <Link href="/predictions" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            리뷰
          </Link>{" "}
          콘텐츠를 통해 회원들이 경기 흐름과 핵심 데이터를 한눈에 확인할 수 있습니다.{" "}
          <Link href="/injuries" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            부상자 명단
          </Link>
          과{" "}
          <Link href="/standings" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            리그별 분석
          </Link>
          도 함께 제공됩니다.
        </p>
      </section>
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
          teamId: m.home.teamId,
        }}
        away={{
          name: m.away.name,
          logo: m.away.logo ?? null,
          teamId: m.away.teamId,
        }}
        homeScore={m.home.score}
        awayScore={m.away.score}
        soccerGoals={m.soccerGoals}
        homeShort={m.home.abbr ?? m.home.name}
        awayShort={m.away.abbr ?? m.away.name}
        previewSlug={m.preview ?? null}
        recapSlug={m.recap ?? null}
        recentGoalSide={m.recentGoalSide ?? null}
        href={m.href}
        homePosition={m.home.position ?? null}
        awayPosition={m.away.position ?? null}
      />
    );
  };

  // 정렬 — startTime 우선, 같은 시간이면 league 알파벳 (KBO → MLB → NPB / J1 → J2 등).
  // 동시간 KBO 매치가 맨 위 (사용자: 국야 위로).
  const byStartThenLeague = (a: NormalizedMatch, b: NormalizedMatch) =>
    a.startTime.getTime() - b.startTime.getTime() || a.league.localeCompare(b.league);
  const liveSorted = [...liveList].sort(byStartThenLeague);
  const scheduledSorted = [...scheduledList].sort(byStartThenLeague);
  const finishedSorted = [...finishedList].sort(byStartThenLeague);
  const dayKey = (d: Date): string =>
    new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const dayLabel = (d: Date): string => {
    const k = new Date(d.getTime() + 9 * 3600 * 1000);
    const y = k.getUTCFullYear();
    const mm = String(k.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(k.getUTCDate()).padStart(2, "0");
    const weekday = d.toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul",
      weekday: "short",
    });
    return `${y}년${mm}월${dd}일(${weekday})`;
  };
  const dayGroupsOf = (
    list: NormalizedMatch[],
  ): Array<{ day: string; label: string; items: NormalizedMatch[] }> => {
    const groups: Array<{ day: string; label: string; items: NormalizedMatch[] }> = [];
    for (const m of list) {
      const k = dayKey(m.startTime);
      const last = groups[groups.length - 1];
      if (last && last.day === k) last.items.push(m);
      else groups.push({ day: k, label: dayLabel(m.startTime), items: [m] });
    }
    return groups;
  };
  const scheduledGroups = dayGroupsOf(scheduledSorted);
  const finishedGroups = dayGroupsOf(finishedSorted);

  const mobileCardFor = (m: NormalizedMatch) => {
    const statusKey =
      m.status === "LIVE"
        ? "live"
        : m.status === "FINISHED"
          ? "finished"
          : m.status === "POSTPONED"
            ? "postponed"
            : "scheduled";
    if (m.sport === "soccer") {
      return (
        <SoccerCompactCard
          key={String(m.id)}
          matchId={m.id}
          league={m.league}
          status={statusKey}
          timeLabel={m.timeLabel}
          liveStatusLabel={m.liveStatusLabel}
          home={m.home}
          away={m.away}
          previewSlug={m.preview ?? null}
          recapSlug={m.recap ?? null}
          recentGoalSide={m.recentGoalSide ?? null}
          href={m.href}
        />
      );
    }
    return (
      <MatchCard
        key={String(m.id)}
        matchId={m.id}
        sport={m.sport}
        status={statusKey}
        league={m.league}
        home={m.home}
        away={m.away}
        timeLabel={m.timeLabel}
        liveStatusLabel={m.liveStatusLabel}
        soccerCtx={m.soccerCtx}
        soccerGoals={null}
        recentGoalSide={m.recentGoalSide ?? null}
        href={m.href}
      />
    );
  };

  const dateHeaderMobile = (label: string) => (
    <div className="rounded-md border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-white/[0.06] text-neutral-700 dark:text-neutral-200 text-center text-[12px] font-bold py-1.5 tabular-nums">
      {label}
    </div>
  );
  const dateHeaderDesktop = (label: string) => (
    <div className="border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-white/[0.06] text-neutral-700 dark:text-neutral-200 text-center text-[13px] font-bold py-1.5 my-2 rounded-md tabular-nums">
      {label}
    </div>
  );
  const statusHeader = (label: string, color: string, size: "sm" | "md") => (
    <div
      className={`flex items-center gap-2 px-1 ${size === "sm" ? "text-[12px]" : "text-[13px]"} font-bold ${color}`}
    >
      <span>{label}</span>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* 모바일 */}
      <div className="md:hidden space-y-4">
        {liveSorted.length > 0 && (
          <section className="space-y-2">
            {statusHeader(`● 진행 중 (${liveSorted.length})`, "text-rose-600 dark:text-rose-500", "sm")}
            <ul className="divide-y divide-neutral-200 dark:divide-white/10 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 overflow-hidden">
              {liveSorted.map((m) => mobileCardFor(m))}
            </ul>
          </section>
        )}
        {scheduledGroups.length > 0 && (
          <section className="space-y-2">
            {statusHeader("⏳ 예정", "text-neutral-600 dark:text-neutral-400", "sm")}
            {scheduledGroups.map((g) => (
              <div key={g.day} className="space-y-2">
                {dateHeaderMobile(g.label)}
                <ul className="divide-y divide-neutral-200 dark:divide-white/10 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 overflow-hidden">
                  {g.items.map((m) => mobileCardFor(m))}
                </ul>
              </div>
            ))}
          </section>
        )}
        {finishedGroups.length > 0 && (
          <section className="space-y-2">
            {statusHeader("✅ 종료", "text-neutral-500", "sm")}
            {finishedGroups.map((g) => (
              <div key={g.day} className="space-y-2">
                {dateHeaderMobile(g.label)}
                <ul className="divide-y divide-neutral-200 dark:divide-white/10 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 overflow-hidden">
                  {g.items.map((m) => mobileCardFor(m))}
                </ul>
              </div>
            ))}
          </section>
        )}
      </div>

      {/* 데스크탑 — row table */}
      <div className="hidden md:block rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-x-auto">
        <div className="min-w-[860px] px-4 pt-1 pb-16">
          <SoccerLiveRowHeader />
          {liveSorted.length > 0 && (
            <>
              <div className="px-0 pt-3 pb-1 text-[12px] font-bold text-rose-600 dark:text-rose-500">
                ● 진행 중 ({liveSorted.length})
              </div>
              {liveSorted.map(renderRow)}
            </>
          )}
          {scheduledGroups.length > 0 && (
            <>
              <div className="px-0 pt-3 pb-1 text-[12px] font-bold text-neutral-600 dark:text-neutral-400">
                ⏳ 예정
              </div>
              {scheduledGroups.map((g) => (
                <div key={g.day}>
                  {dateHeaderDesktop(g.label)}
                  {g.items.map(renderRow)}
                </div>
              ))}
            </>
          )}
          {finishedGroups.length > 0 && (
            <>
              <div className="px-0 pt-3 pb-1 text-[12px] font-bold text-neutral-500">
                ✅ 종료
              </div>
              {finishedGroups.map((g) => (
                <div key={g.day}>
                  {dateHeaderDesktop(g.label)}
                  {g.items.map(renderRow)}
                </div>
              ))}
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
  home: { name: string; abbr?: string | null; logo?: string | null; score: number | null; teamId: number; position?: number | null };
  away: { name: string; abbr?: string | null; logo?: string | null; score: number | null; teamId: number; position?: number | null };
  timeLabel: string;
  liveStatusLabel: string | null;
  homeStarter: string | null;
  awayStarter: string | null;
  soccerCtx: SoccerContext | null;
  soccerGoals: SoccerGoal[] | null;
  /** 라이브 매치 최근 1분 내 골 발생 측 — 점수 셀 노란 highlight 용 */
  recentGoalSide?: "home" | "away" | null;
  esportsCtx: EsportsContext | null;
  baseballCtx: BaseballContext | null;
  baseballLinescore: BaseballLinescoreData | null;
  periodLinescore: PeriodLinescoreData | null;
  liveCommentary: {
    matchSummary: string | null;
    summaryAt: Date | string | null;
    scoreSnapshot: string | null;
  } | null;
  startTime: Date;
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
      liveCommentary={m.liveCommentary}
    />
  );
}

// LEAGUE_ORDER import 유지 (LEAGUE_DISPLAY 와 함께 sport-leagues 에서 export됨)
void LEAGUE_ORDER;
