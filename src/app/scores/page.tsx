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
  BASEBALL_LEAGUES,
  BASKETBALL_LEAGUES,
  HOCKEY_LEAGUES,
  MMA_LEAGUES,
  leaguesForSport,
  LEAGUE_DISPLAY,
  LEAGUE_ORDER,
  type SportCode,
} from "@/lib/sports/sport-leagues";
import { toKoreanTeamName } from "@/lib/team-names";
import { getStandingsForLeagues } from "@/lib/sports/thesports/standings-helper";
import { getFifaRank, NATIONAL_TEAM_LEAGUES } from "@/lib/sports/fifa-rankings";
import { npbPlayerToKorean } from "@/lib/sports/npb-player-names";
import { toKoreanPlayerName } from "@/lib/player-names";
import { buildSportsEventLocation } from "@/lib/seo/sports-event-location";
import {
  fetchAllLiveScores,
  fetchBaseballByDate,
  fetchMlbByDate,
  fetchEspnPeriodLinescores,
  extractNbaUltraPeriodsFromRaw,
  tsIncidentsToGoals,
  tsIncidentsToCards,
  type BaseballGameDetails,
  type PeriodLinescore as PeriodLinescoreData,
  type SoccerGoal,
  type SoccerCard,
  type LiveMatch,
  parseTsFootballScore,
  type TsFootballScoreParsed,
} from "@/lib/sports/live-scores";
import SportTabs from "@/components/scores/SportTabs";
import DateSlider from "@/components/scores/DateSlider";
import LeagueChips from "@/components/scores/LeagueChips";
import LeagueDropdown from "@/components/scores/LeagueDropdown";
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
import LiveSoundToggle from "@/components/LiveSoundToggle";

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
// (축구 골/카드는 ESPN 미사용 — TheSportsMatchCache.detailLive.incidents 에서 직접 추출)
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

// SPORTS 정의에서 soccer 리그를 그대로 사용 — 추가 리그 (CHILE_PB, POLAND_1L 등) 동기화 자동 반영
const SOCCER_LEAGUES = new Set(
  SPORTS.find((s) => s.code === "soccer")?.leagues ?? [],
);

function sportFromLeague(league: string): string {
  if (BASEBALL_LEAGUES.has(league)) return "baseball";
  if (SOCCER_LEAGUES.has(league)) return "soccer";
  if (BASKETBALL_LEAGUES.has(league)) return "basketball"; // NBA/WNBA/KBL/WKBL (이전엔 NBA 만 → 나머지가 "other" 한 줄로 빠짐)
  if (HOCKEY_LEAGUES.has(league)) return "hockey"; // NHL + IIHF_WC (이전엔 NHL 만 → IIHF_WC 가 "other" 한 줄로 빠짐)
  if (MMA_LEAGUES.has(league)) return "mma"; // UFC
  if (league === "LOL") return "esports";
  return "other";
}

// ice_hockey status_id → 진행 피리어드 라벨 (IIHF_WC 등 live statusLabel 이 없을 때
// HockeyCard 의 피리어드 표시·하이라이트용). parsePeriod("2P") 호환 형식.
// 코드표: 30/31/32=P1/P2/P3, 331/332=인터미션, 6/10=OT, 8/13=SO, 17=중단.
function iceHockeyLiveLabel(statusId: number): string | null {
  switch (statusId) {
    case 30:
      return "1P";
    case 31:
      return "2P";
    case 32:
      return "3P";
    case 331:
      return "1P 인터미션";
    case 332:
      return "2P 인터미션";
    case 6:
    case 10:
      return "OT";
    case 8:
    case 13:
      return "SO";
    case 17:
      return "중단";
    default:
      return null;
  }
}

// basketball status_id → 진행 쿼터 라벨 (live statusLabel 이 없는 WNBA/KBL/WKBL +
// BALLDONTLIE 가 period 0 으로 "LIVE" 만 주는 NBA 모두 cache 로 보강).
// 코드표 (status-codes.ts): 2/4/6/8 = Q1~Q4 진행, 3/5/7 = 쿼터 사이 휴식, 9/13 = 연장, 11 = 중단.
// remainingSec = detailLive.timer[3] = 현재 쿼터 잔여 초 (countdown, 2026-05-29 검증: 362→212).
// in-play 는 "3Q 6:02" (영문 Q) — BasketballCard parseQuarter 가 "N쿼터"+클럭으로 렌더.
// 휴식/연장/중단은 한국어 라벨 (parseQuarter 미매칭 → 카드가 라벨 그대로 표시).
function basketballLiveLabel(
  statusId: number,
  remainingSec: number | null,
): string | null {
  const clock =
    remainingSec != null && Number.isFinite(remainingSec) && remainingSec >= 0
      ? `${Math.floor(remainingSec / 60)}:${String(remainingSec % 60).padStart(2, "0")}`
      : null;
  switch (statusId) {
    case 2:
      return clock ? `1Q ${clock}` : "1Q";
    case 4:
      return clock ? `2Q ${clock}` : "2Q";
    case 6:
      return clock ? `3Q ${clock}` : "3Q";
    case 8:
      return clock ? `4Q ${clock}` : "4Q";
    case 3:
      return "1쿼터 종료";
    case 5:
      return "하프타임";
    case 7:
      return "3쿼터 종료";
    case 9:
    case 13:
      return clock ? `연장 ${clock}` : "연장";
    case 11:
      return "중단";
    default:
      return null;
  }
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
 * - statusLabel 의 elapsed (전반/후반 N') 와 골 minute 차이 가 0~2분 사이 → recent
 * - 가장 최근 골의 side 반환 (없으면 null)
 * - 2026-05-23: 1분 → 2분으로 늘림. LiveRefresher 15초 refresh 의 타이밍 miss 회피.
 * - 2026-05-25: 음수 통과 버그 fix (elapsed=70, 골 73분이면 -3 ≤ 2 통과해 영구 flash).
 *   ts incidents 기반에서 cache 가 goals 영구 저장이라 매치 끝까지 깜빡임 지속됐음.
 *   추가: halfLabel === "FT" 또는 elapsed >= 90 같은 종료 임박 매치도 flash 차단.
 */
function findRecentGoalSide(
  statusLabel: string | null | undefined,
  goals: SoccerGoal[] | null,
): "home" | "away" | null {
  if (!goals || goals.length === 0) return null;
  const status = parseSoccerStatus(statusLabel);
  const elapsed = status?.minute;
  if (typeof elapsed !== "number") return null;
  // 종료/FT 또는 statusLabel 자체에 FT 가 보이면 flash X
  if (status?.halfLabel === "FT" || /FT|종료|FINISHED/i.test(statusLabel ?? "")) return null;
  // 가장 최근 시각의 골 (분 + 추가시간 기준)
  const sorted = [...goals].sort((a, b) => parseGoalMinute(b.minute) - parseGoalMinute(a.minute));
  const latest = sorted[0];
  const diff = elapsed - parseGoalMinute(latest.minute);
  // 0 ~ 2분 사이만 recent. 음수(= 골이 elapsed 보다 미래 = cache stale 또는 종료) 차단.
  if (diff >= 0 && diff <= 2) return latest.side;
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
    `${leagueBlurb} 통합. Elo 모델 승률 추정·Value Bet·라이브 푸시 평균 2-3초 갱신. 스코어베이스.`;

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
  // prisma query 용 — sport 탭 무관 모든 종목 매치 가져옴 (FavoriteMatches 가
  // 다른 종목 즐겨찾기도 표시하도록). leagueFilter 일 때만 그 리그 한정.
  // 메인 그리드 표시 시 sportFilteredNormalized 로 sport 별 filter.
  const leaguesForQuery = leagueFilter
    ? [leagueFilter]
    : leaguesForSport("all");
  // 축구 전용 상태 필터 (다른 종목엔 무시)
  const statusFilter: SoccerStatusFilter =
    sport === "soccer" &&
    (sp.status === "live" ||
      sp.status === "scheduled" ||
      sp.status === "finished" ||
      sp.status === "postponed")
      ? sp.status
      : "all";
  const day = parseKstDate(sp.date);
  const dayEnd = new Date(day.getTime() + 24 * 3600 * 1000);
  const dateStr = sp.date ?? dateQuery(day);

  // 축구는 KST 자정 boundary 매치 (UCL/EPL 새벽 매치) 만 추가 cover —
  // -1h ~ +25h 윈도우로 전날 21시 매치 등은 정확히 제외 (2026-05-24 사용자 보고).
  const soccerRangeStart = new Date(day.getTime() - 1 * 3600 * 1000);
  const soccerRangeEnd = new Date(day.getTime() + 25 * 3600 * 1000);
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
    nbaPeriods,
    nhlPeriods,
  ] = await Promise.all([
    prisma.match.findMany({
      where: {
        // POSTPONED 매치도 노출 — 축구 "연기" 탭에서 표시 (2026-05-23).
        // TBD placeholder 매치 영구 제외 (NBA/NHL 컨퍼런스 파이널 차기 라운드 미정 등).
        // status=LIVE 로 잘못 cron update 되더라도 페이지에선 항상 hide.
        // "Sabres/Canadiens" 같은 슬래시 포함 placeholder (NHL 다음 라운드 미정) 도 제외.
        // 선택 일자 이전(어제)의 FINISHED 매치 제외 — 이미 끝난 어제 경기는 노출 X.
        // 자정 boundary 라이브/예정 매치는 유지 (status != FINISHED).
        AND: [
          { homeTeam: { is: { name: { notIn: ["TBD", "TTBD", "TBDT"] } } } },
          { awayTeam: { is: { name: { notIn: ["TBD", "TTBD", "TBDT"] } } } },
          // 슬래시 포함 팀명 hide — NBA/NHL placeholder ("Sabres/Canadiens" 다음 라운드 미정)
          // 만 hide. 페로 제도/도서 국가 합병팀 (EB/Streymur II 등) 은 실제 클럽이라 노출.
          {
            OR: [
              { league: { notIn: ["NBA", "NHL"] } },
              {
                AND: [
                  { homeTeam: { is: { name: { not: { contains: "/" } } } } },
                  { awayTeam: { is: { name: { not: { contains: "/" } } } } },
                ],
              },
            ],
          },
          {
            NOT: { status: "FINISHED", startTime: { lt: day } },
          },
        ],
        // 축구 + 하키는 ±1일 윈도우(soccerWindow), 그 외 종목은 선택 일자만(dayWindow).
        // 하키(IIHF_WC 등)는 KST 자정 직전(23:20) 시작해 자정을 넘겨 진행하는 경기가
        // 많아, dayWindow 면 "오늘" 탭에서 빠짐 → 축구와 동일 자정 boundary 윈도우 적용.
        // leagueFilter 가 있으면 단일 리그 단일 window, 없으면 모든 종목 OR.
        // sport tab 과 무관하게 모든 종목 매치 가져옴 — FavoriteMatches 가
        // sport tab 무관 모든 종목 fav 표시하기 위해 (2026-05-23 변경).
        ...(leagueFilter
          ? {
              league: leagueFilter,
              startTime:
                SOCCER_LEAGUES.has(leagueFilter) || HOCKEY_LEAGUES.has(leagueFilter)
                  ? soccerWindow
                  : dayWindow,
            }
          : {
              OR: [
                {
                  league: {
                    in: leaguesForQuery.filter(
                      (l) => SOCCER_LEAGUES.has(l) || HOCKEY_LEAGUES.has(l),
                    ),
                  },
                  startTime: soccerWindow,
                },
                {
                  league: {
                    in: leaguesForQuery.filter(
                      (l) => !SOCCER_LEAGUES.has(l) && !HOCKEY_LEAGUES.has(l),
                    ),
                  },
                  startTime: dayWindow,
                },
              ],
            }),
      },
      // include → select 로 좁힘 — Match.raw (큰 JSON, NBA Ultra 만 필요)
      // + Team 의 elo/country/venue 등 미사용 컬럼 + prediction 필드 fetch 제외.
      // payload 60% 감소 + SSR latency 0.5-1s 단축 예상.
      select: {
        id: true,
        league: true,
        externalId: true,
        status: true,
        homeScore: true,
        awayScore: true,
        startTime: true,
        updatedAt: true,
        homeTeamId: true,
        awayTeamId: true,
        homeStarter: true,
        awayStarter: true,
        homeTeam: {
          select: {
            id: true, name: true, externalId: true, shortName: true, logoUrl: true,
            // UFC 파이터 프로필 (league="UFC" 일 때만 non-null) — 한글명 + Tale of the Tape
            mmaFighter: {
              select: { nameKo: true, nickname: true, category: true, height: true, weight: true, reach: true, stance: true, headshot: true, photo: true },
            },
          },
        },
        awayTeam: {
          select: {
            id: true, name: true, externalId: true, shortName: true, logoUrl: true,
            // UFC 파이터 프로필 (league="UFC" 일 때만 non-null) — 한글명 + Tale of the Tape
            mmaFighter: {
              select: { nameKo: true, nickname: true, category: true, height: true, weight: true, reach: true, stance: true, headshot: true, photo: true },
            },
          },
        },
        articles: {
          where: { status: "PUBLISHED" },
          select: { slug: true, type: true },
        },
        liveCommentary: {
          select: { eventComments: true, matchSummary: true, summaryAt: true, scoreSnapshot: true },
        },
        // AI 승률 예측 — predict-match endpoint 가 cache write. UI 카드 chip 용.
        predHome: true,
        predDraw: true,
        predAway: true,
        predWinner: true,
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
  // raw 는 큰 JSON 이라 메인 matches select 에서 제외 — NBA 만 별도 fetch (시즌 중 max 15-20 매치, cost 작음).
  const nbaMatchIds = matches.filter((m) => m.league === "NBA").map((m) => m.id);
  if (nbaMatchIds.length > 0) {
    const nbaRaws = await prisma.match.findMany({
      where: { id: { in: nbaMatchIds } },
      select: { id: true, raw: true, externalId: true },
    });
    for (const r of nbaRaws) {
      if (periodMap[r.externalId]) continue;
      const parsed = extractNbaUltraPeriodsFromRaw(r.raw);
      if (parsed) periodMap[r.externalId] = parsed;
    }
  }

  // TheSportsMatchCache 한 번에 조회 — 축구 골/카드(incidents) + 야구 베이스/아웃(extra)
  // 두 source 동시 사용. 이전: soccer + baseball 별도 두 round-trip → 합쳐서 한 round-trip
  // (~50-100ms 단축 + Neon pool 사용량 절약).
  //
  // 야구 baseballLiveDbIds 는 DB.status === "LIVE" 만 보면 SCHEDULED → LIVE 미갱신 매치
  // (특히 MLB ESPN collector 갭) 가 빠짐. cache 의 detailLive 가 5분 이내면 실제 진행
  // 중이므로 SCHEDULED 매치도 포함, FINISHED 만 제외.
  const soccerGoalsByMatchId = new Map<number, SoccerGoal[]>();
  const soccerCardsByMatchId = new Map<number, SoccerCard[]>();
  // 축구 라인업(cache.lineup) 실제 존재 매치 — L 배지용 (리그 whitelist 대신 실제 유무).
  const lineupMatchIdSet = new Set<number>();
  const footballScoreByMatchId = new Map<number, TsFootballScoreParsed>();
  // 하키 (특히 IIHF_WC) 피리어드 점수표 — ESPN periodMap 에 없는 매치는 cache 에서 추출.
  const hockeyPeriodByMatchId = new Map<number, PeriodLinescoreData>();
  // 하키 진행 피리어드 라벨 (IIHF 등 live statusLabel 없을 때 cache status_id 로 생성)
  const hockeyStatusLabelByMatchId = new Map<number, string>();
  // 농구 (WNBA/KBL/WKBL) 쿼터 점수표 — NBA 는 ESPN periodMap 사용, 나머지는 ESPN 미지원이라 cache 에서 추출.
  const basketballPeriodByMatchId = new Map<number, PeriodLinescoreData>();
  // 농구 진행 쿼터 라벨 ("3Q 6:02"/"하프타임") — cache status_id + timer 로 생성.
  // NBA 포함 전 리그 (BDL "LIVE" / WNBA 등 라벨 부재 보강).
  const basketballStatusLabelByMatchId = new Map<number, string>();
  const baseballCacheCtx = new Map<string, {
    bases: [boolean, boolean, boolean];
    outs: number | null;
    inning: number | null;
    half: "top" | "bottom" | null;
    awayInnings: (number | null)[];
    homeInnings: (number | null)[];
    awayHits: number | null;
    homeHits: number | null;
    awayErrors: number | null;
    homeErrors: number | null;
    isExtra: boolean;
  }>();

  const soccerMatchIds = needsSoccerGoals
    ? matches.filter((m) => SOCCER_LEAGUES.has(m.league)).map((m) => m.id)
    : [];
  // KBO/NPB/MLB + CPBL/LMB. cache.detailLive 의 bases/outs/inning(LIVE) +
  // 이닝별 점수표(LIVE/종료) 추출. CPBL/LMB 는 api-baseball 매핑이 없어 종료 경기
  // 이닝표가 TheSports cache 가 유일 소스 → SCHEDULED 만 제외(이닝 없음).
  const baseballLiveDbIds = matches
    .filter(
      (m) =>
        ["KBO", "NPB", "MLB", "CPBL", "LMB"].includes(m.league) &&
        m.status !== "SCHEDULED",
    )
    .map((m) => m.id);
  // 하키 (NHL/IIHF_WC) — IIHF_WC 는 ESPN periodMap 에 없어 cache.score 에서 피리어드 추출.
  // SCHEDULED 제외 (피리어드 없음). NHL 은 ESPN 우선 + cache fallback.
  const hockeyMatchIds = matches
    .filter((m) => HOCKEY_LEAGUES.has(m.league) && m.status !== "SCHEDULED")
    .map((m) => m.id);
  // 농구 (NBA/WNBA/KBL/WKBL) — SCHEDULED 제외 (쿼터 없음).
  // cache.score[3]=home 쿼터배열, score[4]=away 쿼터배열에서 추출.
  // NBA 도 포함 — ESPN periodMap 이 우선, 비어있을 때만 cache fallback (1114줄).
  const basketballMatchIds = matches
    .filter(
      (m) =>
        BASKETBALL_LEAGUES.has(m.league) &&
        m.status !== "SCHEDULED",
    )
    .map((m) => m.id);
  // 진행 쿼터 라벨용 — NBA 포함 모든 농구 LIVE 매치 (period 표와 달리 NBA 도 cache 라벨 사용).
  const basketballLabelMatchIds = matches
    .filter(
      (m) => BASKETBALL_LEAGUES.has(m.league) && m.status !== "SCHEDULED",
    )
    .map((m) => m.id);
  const cacheIds = Array.from(
    new Set([
      ...soccerMatchIds,
      ...baseballLiveDbIds,
      ...hockeyMatchIds,
      ...basketballMatchIds,
      ...basketballLabelMatchIds,
    ]),
  );

  if (cacheIds.length > 0) {
    const caches = await prisma.theSportsMatchCache.findMany({
      where: { matchId: { in: cacheIds } },
      select: { matchId: true, detailLive: true, lineup: true },
    });
    const soccerIdSet = new Set(soccerMatchIds);
    const baseballIdSet = new Set(baseballLiveDbIds);
    const hockeyIdSet = new Set(hockeyMatchIds);
    const basketballIdSet = new Set(basketballMatchIds);
    const basketballLabelIdSet = new Set(basketballLabelMatchIds);
    const idToExt = new Map(matches.map((m) => [m.id, m.externalId] as const));
    for (const c of caches) {
      // 축구 라인업 존재 — cache.lineup 이 비어있지 않은 객체면 L 배지 (football-poller 가 빈 건 null 로 저장).
      if (
        soccerIdSet.has(c.matchId) &&
        c.lineup &&
        typeof c.lineup === "object" &&
        Object.keys(c.lineup as object).length > 0
      ) {
        lineupMatchIdSet.add(c.matchId);
      }
      const dl = c.detailLive as
        | {
            incidents?: unknown;
            extra?: { base?: string; out?: number };
            score?: [string, number, number, Record<string, [string, string] | undefined>];
          }
        | null;
      if (!dl) continue;
      // 축구 골/카드 + 승부차기/연장 점수 (score 배열은 incidents 없어도 존재)
      if (soccerIdSet.has(c.matchId)) {
        const fs = parseTsFootballScore(dl);
        if (fs) footballScoreByMatchId.set(c.matchId, fs);
        if (dl.incidents) {
          const goals = tsIncidentsToGoals(dl.incidents);
          const cards = tsIncidentsToCards(dl.incidents);
          if (goals.length > 0) soccerGoalsByMatchId.set(c.matchId, goals);
          if (cards.length > 0) soccerCardsByMatchId.set(c.matchId, cards);
        }
      }
      // 하키 피리어드 (NHL/IIHF_WC) — cache.detailLive.score[3] 의 ft/p_i = [home, away].
      // IIHF_WC 는 ESPN periodMap 없어 여기서 추출 (commit 검증: ft=[home,away] 우리 관점 일치).
      // _swap 키 있으면 ts perspective 반대 → home/away 반전 (야구 패턴 동일).
      if (hockeyIdSet.has(c.matchId) && Array.isArray(dl.score) && dl.score.length >= 4) {
        // status_id (score[1]) → 진행 피리어드 라벨 (IIHF live statusLabel 없을 때 대체)
        const plabel = iceHockeyLiveLabel(Number(dl.score[1]));
        if (plabel) hockeyStatusLabelByMatchId.set(c.matchId, plabel);
        const sObj = dl.score[3] as Record<string, unknown>;
        const swap = (dl as { _swap?: boolean })?._swap === true;
        const homePeriods: (number | null)[] = [];
        const awayPeriods: (number | null)[] = [];
        for (let i = 1; i <= 9; i++) {
          const p = sObj?.["p" + i];
          if (!Array.isArray(p) || p.length < 2) continue;
          const h = Number(p[0]);
          const a = Number(p[1]);
          const hv = Number.isFinite(h) ? h : null;
          const av = Number.isFinite(a) ? a : null;
          homePeriods.push(swap ? av : hv);
          awayPeriods.push(swap ? hv : av);
        }
        if (homePeriods.length > 0) {
          const ft = sObj?.["ft"];
          const ftH = Array.isArray(ft) ? Number(ft[0]) : NaN;
          const ftA = Array.isArray(ft) ? Number(ft[1]) : NaN;
          const sum = (arr: (number | null)[]) =>
            arr.reduce<number>((s, n) => s + (n ?? 0), 0);
          const hScore = Number.isFinite(ftH)
            ? swap
              ? Number(ftA)
              : ftH
            : sum(homePeriods);
          const aScore = Number.isFinite(ftA)
            ? swap
              ? Number(ftH)
              : ftA
            : sum(awayPeriods);
          hockeyPeriodByMatchId.set(c.matchId, {
            homePeriods,
            awayPeriods,
            homeScore: hScore,
            awayScore: aScore,
          });
        }
      }
      // 농구 쿼터 (NBA/WNBA/KBL/WKBL) — cache.score[3]=home 쿼터배열, score[4]=away 쿼터배열
      // (하키/야구의 score[3] 객체와 다름). 농구는 TheSports cache 가 우선 (1112줄).
      // swap 없음 검증 완료 (production: 정렬 13 / swap 0 / _swap 플래그 0).
      if (basketballIdSet.has(c.matchId)) {
        const bScore = dl.score as unknown[] | undefined;
        const homeArr = Array.isArray(bScore) ? bScore[3] : undefined;
        const awayArr = Array.isArray(bScore) ? bScore[4] : undefined;
        if (Array.isArray(homeArr) && Array.isArray(awayArr)) {
          const toNum = (x: unknown): number | null => {
            const n = Number(x);
            return Number.isFinite(n) ? n : null;
          };
          const homePeriods = homeArr.map(toNum);
          const awayPeriods = awayArr.map(toNum);
          // 트레일링 OT 컬럼(정규 4쿼터 초과) 이 양 팀 모두 0 이면 제거 — NBA ESPN 렌더와 컬럼 수 맞춤.
          let len = Math.max(homePeriods.length, awayPeriods.length);
          while (
            len > 4 &&
            (homePeriods[len - 1] ?? 0) === 0 &&
            (awayPeriods[len - 1] ?? 0) === 0
          ) {
            len--;
          }
          const hp = homePeriods.slice(0, len);
          const ap = awayPeriods.slice(0, len);
          const sum = (arr: (number | null)[]) =>
            arr.reduce<number>((s, n) => s + (n ?? 0), 0);
          if (hp.length > 0 || ap.length > 0) {
            basketballPeriodByMatchId.set(c.matchId, {
              homePeriods: hp,
              awayPeriods: ap,
              homeScore: sum(hp),
              awayScore: sum(ap),
            });
          }
        }
      }
      // 농구 진행 쿼터 라벨 (NBA 포함) — score[1]=status_id, timer[3]=쿼터 잔여초.
      if (basketballLabelIdSet.has(c.matchId)) {
        const bScore = dl.score as unknown[] | undefined;
        const statusId = Array.isArray(bScore) ? Number(bScore[1]) : NaN;
        const timerArr = (dl as { timer?: unknown[] }).timer;
        const remaining = Array.isArray(timerArr) ? Number(timerArr[3]) : NaN;
        if (Number.isFinite(statusId)) {
          const label = basketballLiveLabel(
            statusId,
            Number.isFinite(remaining) ? remaining : null,
          );
          if (label) basketballStatusLabelByMatchId.set(c.matchId, label);
        }
      }
      // 야구 베이스/아웃 + 이닝/half + 이닝별 점수표 (linescore).
      // cache.detailLive.score[3] 의 p_i = [tsHome, tsAway] (commit f25de7a 정정).
      // _swap=true 면 ts perspective 가 우리와 반대 → 우리 home/away 로 변환.
      if (baseballIdSet.has(c.matchId)) {
        const extraBase = dl.extra?.base;
        const baseStr =
          typeof extraBase === "string" && /^[01]{3}$/.test(extraBase)
            ? extraBase
            : "000";
        const ext = idToExt.get(c.matchId);
        const swap = (dl as { _swap?: boolean })?._swap === true;
        let inning: number | null = null;
        let half: "top" | "bottom" | null = null;
        let isExtra = false;
        const awayInnings: (number | null)[] = [];
        const homeInnings: (number | null)[] = [];
        let awayHits: number | null = null;
        let homeHits: number | null = null;
        let awayErrors: number | null = null;
        let homeErrors: number | null = null;
        if (Array.isArray(dl.score) && dl.score.length >= 4) {
          const sObj = dl.score[3] as Record<string, [string, string] | undefined>;
          for (let i = 1; i <= 12; i++) {
            const p = sObj?.["p" + i];
            if (!Array.isArray(p) || p.length < 2) continue;
            inning = i;
            const tsHome = parseInt(String(p[0]), 10);
            const tsAway = parseInt(String(p[1]), 10);
            if (swap) {
              homeInnings.push(Number.isFinite(tsAway) ? tsAway : null);
              awayInnings.push(Number.isFinite(tsHome) ? tsHome : null);
            } else {
              homeInnings.push(Number.isFinite(tsHome) ? tsHome : null);
              awayInnings.push(Number.isFinite(tsAway) ? tsAway : null);
            }
          }
          // 연장: TheSports 가 연장 이닝별(p10+) 미제공, score[3].ft(연장 포함 총점)만 줌.
          // ft - 9회합 > 0 이면 연장 점수 → "연장" 통합 칸 1개 추가 (10/11/12 이닝별은 소스 한계).
          const ftArr = sObj?.ft as [string, string] | undefined;
          if (Array.isArray(ftArr) && ftArr.length >= 2 && homeInnings.length >= 9) {
            const ftHome = parseInt(String(ftArr[swap ? 1 : 0]), 10);
            const ftAway = parseInt(String(ftArr[swap ? 0 : 1]), 10);
            let sumHome = 0;
            let sumAway = 0;
            for (const v of homeInnings) sumHome += v ?? 0;
            for (const v of awayInnings) sumAway += v ?? 0;
            if (Number.isFinite(ftHome) && Number.isFinite(ftAway) && (ftHome > sumHome || ftAway > sumAway)) {
              homeInnings.push(ftHome - sumHome);
              awayInnings.push(ftAway - sumAway);
              isExtra = true;
            }
          }
          const h = dl.score[2];
          if (h === 1) half = "top";
          else if (h === 2) half = "bottom";
          const hits = sObj?.h;
          if (Array.isArray(hits) && hits.length >= 2) {
            const th = parseInt(String(hits[0]), 10);
            const ta = parseInt(String(hits[1]), 10);
            homeHits = Number.isFinite(swap ? ta : th) ? (swap ? ta : th) : null;
            awayHits = Number.isFinite(swap ? th : ta) ? (swap ? th : ta) : null;
          }
          const errs = sObj?.e;
          if (Array.isArray(errs) && errs.length >= 2) {
            const th = parseInt(String(errs[0]), 10);
            const ta = parseInt(String(errs[1]), 10);
            homeErrors = Number.isFinite(swap ? ta : th) ? (swap ? ta : th) : null;
            awayErrors = Number.isFinite(swap ? th : ta) ? (swap ? th : ta) : null;
          }
        }
        if (ext) {
          baseballCacheCtx.set(ext, {
            bases: [baseStr[0] === "1", baseStr[1] === "1", baseStr[2] === "1"],
            outs: typeof dl.extra?.out === "number" ? dl.extra.out : null,
            inning,
            half,
            awayInnings,
            homeInnings,
            awayHits,
            homeHits,
            awayErrors,
            homeErrors,
            isExtra,
          });
        }
      }
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
  // 더블헤더 — 같은 league + 두 팀 페어 + 같은 KST 일자에 2경기 이상이면 name fallback 금지.
  // 이름만으로는 1차전 (FINISHED) 과 2차전 (LIVE) 라이브 데이터 구분 불가 → 종료된 1차전이
  // 2차전 라이브 데이터를 받아 effStatus=LIVE 로 잘못 표시되고 ctx 는 비어서 "주자 정보 없음"
  // 표시되는 버그. externalId 정확 매치만 허용. (2026-05-24 fix — STL@CIN 더블헤더)
  const dhPairKey = (league: string, homeTeamId: number, awayTeamId: number, startTime: Date) =>
    `${league}|${[homeTeamId, awayTeamId].sort((a, b) => a - b).join("-")}|${dateQuery(startTime)}`;
  const dhPairCount = new Map<string, number>();
  for (const m of matches) {
    const k = dhPairKey(m.league, m.homeTeamId, m.awayTeamId, m.startTime);
    dhPairCount.set(k, (dhPairCount.get(k) ?? 0) + 1);
  }

  function matchLive(m: {
    externalId: string;
    league: string;
    startTime: Date;
    homeTeamId: number;
    awayTeamId: number;
    homeTeam: { name: string };
    awayTeam: { name: string };
  }): LiveMatch | undefined {
    const byExt = liveByExternalId.get(m.externalId);
    if (byExt) return byExt;
    const isDoubleHeader =
      (dhPairCount.get(dhPairKey(m.league, m.homeTeamId, m.awayTeamId, m.startTime)) ?? 0) > 1;
    if (isDoubleHeader) return undefined; // name fallback 금지
    const byName = liveByNameKey.get(
      `${m.league}|${normalizeName(m.homeTeam.name)}|${normalizeName(m.awayTeam.name)}`,
    );
    if (byName) return byName;
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
  // 야구 [순위] chip 은 별도 검증 후 활성화 (2026-05-27 /predictions 500 사고로 revert).
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
  const normalizedAll = matches.map((m) => {
    const live = matchLive(m);
    const elapsedMs = Date.now() - m.startTime.getTime();
    const sport_ = sportFromLeague(m.league);
    // sport 별 staleLive 임계 — 정규 경기 시간 + 적당 마진.
    // 축구: 90+추가시간 = ~2h → 2.5h 후 staleLive (DB.status=LIVE 인데 라이브
    // API 응답에 없으면 종료로 간주). 야간 매치가 cron 갭 (KST 22:00 ~ 다음날
    // 11:30) 안에서도 페이지에 자동 종료 표시. (2026-05-23)
    const staleThresholdMs =
      sport_ === "soccer" ? 2.5 * 3600 * 1000
      : sport_ === "basketball" ? 3 * 3600 * 1000
      : sport_ === "hockey" ? 3.5 * 3600 * 1000
      : sport_ === "esports" ? 6 * 3600 * 1000
      : 4 * 3600 * 1000; // baseball (12회 연장 가능) 기본
    const staleLive =
      !live && m.status === "LIVE" && elapsedMs > staleThresholdMs;
    // staleScheduled — DB.status=SCHEDULED 인데 시작 + 임계 지났고 라이브 데이터도 없음.
    // = 안 열리는 유령 경기(플레이오프 if-necessary, 시리즈 이미 종료 등) 또는 cron 갱신 누락.
    // 거짓 "연기"(POSTPONED)/"예정"으로 노출하지 않고 /scores 에서 hidden 처리.
    // 진짜 경기면 cleanup-stale-scheduled cron 이 외부 verify 후 FINISHED/POSTPONED 정정 → 그때 노출.
    // (2026-05-29 VGK@COL: VGK 4-0 스윕으로 안 열리는 if-necessary 경기가 예정/연기로 오표시)
    const staleScheduled =
      !live && m.status === "SCHEDULED" && elapsedMs > staleThresholdMs;
    const effStatus = live
      ? "LIVE"
      : staleLive
        ? "FINISHED"
        : m.status;
    // monotonic max(live, DB.Match) — TheSports MQTT/fast-poller 가 채운 DB 가 live (api-sports 15-30s) 보다 fresh 한 경우 그쪽 사용.
    // 점수는 단방향 증가 — 더 큰 값이 안전.
    //
    // ⚠️ 야구 예외 (2026-05-27 화면 5:5/5:5/5:5/7:7 동점 사고):
    // 야구는 live API (api-baseball) 와 DB (TheSports cache→Match sync) 의 home/away
    // perspective 가 swap 될 수 있음. Math.max 로 비교하면 양 팀 점수가 같은 max 값으로
    // 합쳐져 동점 표시. DB 는 cache→Match sync 가 swap 처리 후 정확 → 야구는 DB 만 사용.
    const liveH = live?.homeScore;
    const liveA = live?.awayScore;
    const dbH = m.homeScore;
    const dbA = m.awayScore;
    const isBaseball = BASEBALL_LEAGUES.has(m.league);
    // 축구: TheSports cache 의 정규/연장 점수(fs.main) 우선 — DB.homeScore 는 승부차기 합산
    // 오염 가능(예: UCL 결승 4-3). 승부차기는 별도 penHome/penAway 로 분리 표시.
    const fs = footballScoreByMatchId.get(m.id) ?? null;
    const homeScore = isBaseball
      ? (dbH ?? liveH ?? null)
      : fs
        ? fs.mainHome
        : (liveH != null && dbH != null ? Math.max(liveH, dbH) : (liveH ?? dbH));
    const awayScore = isBaseball
      ? (dbA ?? liveA ?? null)
      : fs
        ? fs.mainAway
        : (liveA != null && dbA != null ? Math.max(liveA, dbA) : (liveA ?? dbA));
    const preview = m.articles.find((a) => a.type === "PREVIEW")?.slug;
    const recap = m.articles.find((a) => a.type === "RECAP")?.slug;

    // 모든 매치 → 라이브 상세 페이지로 (점수판 클릭 시 매치 detail 우선).
    // KBO/NPB/MLB/LOL 은 전용 라우트, NBA/NHL/축구 (36 리그) 는 /live/{league}/{externalId}.
    let href: string | null = null;
    if (m.league === "MLB") href = `/live/mlb/${m.externalId}`;
    else if (m.league === "KBO") href = `/live/kbo/${m.externalId}`;
    else if (m.league === "NPB") href = `/live/npb/${m.externalId}`;
    else if (m.league === "LOL") href = `/live/lol/${m.externalId}`;
    else if (m.league === "UFC") href = `/live/ufc/${m.id}`; // UFC 매치 상세 (파이터 Tale of the Tape + 전적/배당)
    else if (
      BASEBALL_LEAGUES.has(m.league) ||    // LMB/CPBL/KBO_FUTURES/NPB_MINOR 등 마이너 야구 (MLB/KBO/NPB 는 위 전용 라우트)
      BASKETBALL_LEAGUES.has(m.league) || // NBA/WNBA/KBL/WKBL
      HOCKEY_LEAGUES.has(m.league) ||      // NHL/IIHF_WC
      SOCCER_LEAGUES.has(m.league)
    ) {
      href = `/live/${m.league}/${m.externalId}`;
    } else if (recap) href = `/articles/${recap}`;
    else if (preview) href = `/articles/${preview}`;

    // 국가대항(친선/예선/대륙컵) 매치 — 리그 standings 개념이 없으므로 [순위] 자리에
    // FIFA 국가 랭킹을 표시. 클럽 리그(EPL/이라크 스타스 리그 등)는 절대 안 건드림(position 유지).
    const isNationalTeam = NATIONAL_TEAM_LEAGUES.has(m.league);
    // UFC 파이터는 정적 dict 대신 MmaFighter.nameKo (haiku 음역) 우선, 없으면 영문 fallback.
    const homeNameKo =
      m.homeTeam.mmaFighter?.nameKo ?? toKoreanTeamName(m.homeTeam.name, m.league);
    const awayNameKo =
      m.awayTeam.mmaFighter?.nameKo ?? toKoreanTeamName(m.awayTeam.name, m.league);
    const homeFifaRank = isNationalTeam
      ? getFifaRank(m.homeTeam.name, homeNameKo)
      : null;
    const awayFifaRank = isNationalTeam
      ? getFifaRank(m.awayTeam.name, awayNameKo)
      : null;

    return {
      id: m.id,
      sport: sport_,
      league: m.league,
      status: effStatus as "LIVE" | "FINISHED" | "SCHEDULED" | "POSTPONED",
      hidden: staleScheduled, // 유령/stale SCHEDULED → /scores 표시에서 제외
      home: {
        name: homeNameKo,
        abbr: m.homeTeam.shortName,
        // UFC: ESPN 헤드샷 우선(api-sports photo 일부 깨짐) → photo → 로고. 비UFC 는 mmaFighter null → logoUrl.
        logo: m.homeTeam.mmaFighter?.headshot ?? m.homeTeam.mmaFighter?.photo ?? m.homeTeam.logoUrl,
        score: homeScore,
        teamId: m.homeTeamId,
        position: isNationalTeam
          ? null
          : standingsByLeague.get(m.league)?.get(m.homeTeamId) ?? null,
        fifaRank: homeFifaRank,
      },
      away: {
        name: awayNameKo,
        abbr: m.awayTeam.shortName,
        logo: m.awayTeam.mmaFighter?.headshot ?? m.awayTeam.mmaFighter?.photo ?? m.awayTeam.logoUrl,
        score: awayScore,
        teamId: m.awayTeamId,
        position: isNationalTeam
          ? null
          : standingsByLeague.get(m.league)?.get(m.awayTeamId) ?? null,
        fifaRank: awayFifaRank,
      },
      // UFC Tale of the Tape — 파이터 신체/별명 (mma 외 종목은 null)
      mma:
        sport_ === "mma"
          ? {
              category:
                m.homeTeam.mmaFighter?.category ?? m.awayTeam.mmaFighter?.category ?? null,
              home: {
                nickname: m.homeTeam.mmaFighter?.nickname ?? null,
                height: m.homeTeam.mmaFighter?.height ?? null,
                weight: m.homeTeam.mmaFighter?.weight ?? null,
                reach: m.homeTeam.mmaFighter?.reach ?? null,
                stance: m.homeTeam.mmaFighter?.stance ?? null,
              },
              away: {
                nickname: m.awayTeam.mmaFighter?.nickname ?? null,
                height: m.awayTeam.mmaFighter?.height ?? null,
                weight: m.awayTeam.mmaFighter?.weight ?? null,
                reach: m.awayTeam.mmaFighter?.reach ?? null,
                stance: m.awayTeam.mmaFighter?.stance ?? null,
              },
            }
          : null,
      startTime: m.startTime,
      timeLabel: kstHHmm(m.startTime),
      liveStatusLabel:
        sport_ === "basketball"
          ? basketballStatusLabelByMatchId.get(m.id) ?? live?.statusLabel ?? null
          : live?.statusLabel ??
            (sport_ === "hockey"
              ? hockeyStatusLabelByMatchId.get(m.id) ?? null
              : null),
      homeStarter: isBaseball
        ? localizeStarter(parseStarter(m.homeStarter), m.league)
        : null,
      awayStarter: isBaseball
        ? localizeStarter(parseStarter(m.awayStarter), m.league)
        : null,
      soccerCtx:
        sport_ === "soccer" && live ? parseSoccerStatus(live.statusLabel) : null,
      // TheSports cache 의 incidents 에서 추출 — match.id 직접 키.
      soccerGoals: sport_ === "soccer" ? soccerGoalsByMatchId.get(m.id) ?? null : null,
      soccerCards: sport_ === "soccer" ? soccerCardsByMatchId.get(m.id) ?? null : null,
      penHome: sport_ === "soccer" ? fs?.penHome ?? null : null,
      penAway: sport_ === "soccer" ? fs?.penAway ?? null : null,
      // 라이브 매치 한정: 최근 골 발생 측 (점수 셀 emerald flash)
      recentGoalSide:
        sport_ === "soccer" && effStatus === "LIVE" && live
          ? findRecentGoalSide(
              live.statusLabel,
              soccerGoalsByMatchId.get(m.id) ?? null,
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
        sport_ === "basketball"
          ? // 농구는 TheSports cache 우선 (쿼터 데이터 정확), ESPN 은 fallback.
            basketballPeriodByMatchId.get(m.id) ??
            periodMap[m.externalId] ??
            null
          : sport_ === "hockey"
            ? periodMap[m.externalId] ??
              hockeyPeriodByMatchId.get(m.id) ??
              null
            : null,
      // LIVE 매치는 live.baseball 우선, 종료된 매치는 fetchBaseballByDate
      // 결과 (externalId key) 에서 가져옴. 둘 다 없으면 null.
      baseballLinescore: isBaseball
        ? (() => {
            const details =
              live?.baseball ?? baseballDetailsMap[m.externalId];
            const cachedBb = baseballCacheCtx.get(m.externalId);
            // TheSports 야구(MLB 외 KBO/NPB/CPBL/LMB)는 cache 우선 — 연장을 ft 로 복구.
            // (ESPN/API-Sports 는 연장이 extra 1칸이라 이닝별 표가 부정확/9회까지만)
            const tsBaseballHasInnings =
              m.league !== "MLB" &&
              !!cachedBb &&
              (cachedBb.awayInnings.length > 0 || cachedBb.homeInnings.length > 0);
            if (details && !tsBaseballHasInnings) {
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
            }
            const cached = baseballCacheCtx.get(m.externalId);
            if (cached && (cached.awayInnings.length > 0 || cached.homeInnings.length > 0)) {
              return {
                awayInnings: cached.awayInnings,
                homeInnings: cached.homeInnings,
                awayScore: awayScore ?? 0,
                homeScore: homeScore ?? 0,
                awayHits: cached.awayHits,
                homeHits: cached.homeHits,
                awayErrors: cached.awayErrors,
                homeErrors: cached.homeErrors,
                awayLabel: shortLabel(
                  m.awayTeam.shortName,
                  toKoreanTeamName(m.awayTeam.name, m.league),
                ),
                homeLabel: shortLabel(
                  m.homeTeam.shortName,
                  toKoreanTeamName(m.homeTeam.name, m.league),
                ),
              };
            }
            return null;
          })()
        : null,
      // 라이브 야구 컨텍스트 (베이스/아웃/회·말).
      // KBO/NPB: TheSportsMatchCache (baseballCacheCtx) 우선 — ESPN MLB 는 baseballDetailsMap.ctx.
      baseballCtx: isBaseball
        ? (() => {
            const cached = baseballCacheCtx.get(m.externalId);
            if (cached) {
              return {
                inning: cached.inning ?? undefined,
                half: cached.half,
                outs: cached.outs,
                bases: cached.bases,
                isExtra: cached.isExtra,
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
              // AI 승률 예측 chip — predictionEngine 결과 (commit 7e9a349).
              // predHome 있는데 predWinner=null 이면 NO_PICK → chip 숨김 + 본문에 고정 문구 표시.
              prediction:
                m.predHome != null
                  ? {
                      pick: (m.predWinner as "HOME" | "AWAY" | "DRAW" | null) ?? null,
                      probHome: m.predHome,
                      probDraw: m.predDraw,
                      probAway: m.predAway,
                      homeName: m.homeTeam.name,
                      awayName: m.awayTeam.name,
                    }
                  : null,
              homeScore: m.homeScore,
              awayScore: m.awayScore,
              sport: "baseball" as const,
            }
          : null,
      preview,
      recap,
      href,
      doubleHeader: null as { index: number; total: number } | null,
    };
  })
    // 유령/stale SCHEDULED 는 favorites·doubleheader·데이터 payload 등 모든 소비에서 제외.
    .filter((m) => !m.hidden);

  // 더블헤더 감지 — 같은 league + 두 팀 페어 + 같은 KST 일자에 2경기 이상.
  // 시작 시간 순서로 1, 2 번호 부여. MLB 정규 더블헤더 + KBO/NPB 가능성 모두 대응.
  const dhBuckets = new Map<string, (typeof normalizedAll)[number][]>();
  for (const m of normalizedAll) {
    const pair = [m.home.teamId, m.away.teamId].sort((a, b) => a - b).join("-");
    const key = `${m.league}|${pair}|${dateQuery(m.startTime)}`;
    let bucket = dhBuckets.get(key);
    if (!bucket) {
      bucket = [];
      dhBuckets.set(key, bucket);
    }
    bucket.push(m);
  }
  for (const bucket of dhBuckets.values()) {
    if (bucket.length < 2) continue;
    bucket.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    bucket.forEach((m, i) => {
      m.doubleHeader = { index: i + 1, total: bucket.length };
    });
  }

  // normalizedAll = 모든 종목 매치 (FavoriteMatches 용 — sport tab 무관 fav 표시).
  // normalized = 현재 sport 의 리그만 — 메인 그리드 / 상태 섹션 / 헤더 카운트 용.
  const sportLeagueSet = new Set(leaguesForSport(sport));
  const normalized = normalizedAll.filter((m) => sportLeagueSet.has(m.league) && !m.hidden);

  // 상태 그룹화 — sport 별 filtered 기반
  const liveList = normalized.filter((m) => m.status === "LIVE");
  const scheduledList = normalized.filter((m) => m.status === "SCHEDULED");
  // 종료 섹션 — effStatus=FINISHED 이면서 startTime 이 선택 일자(KST 자정) 이후인 매치만.
  // 어제 LIVE 로 stuck 되었다가 staleLive 로 FINISHED 변환된 매치 (collector cron 누락 케이스)
  // 가 오늘 종료 섹션에 노출되는 문제 방지. 자정 boundary 매치는 startTime >= day 라 OK.
  const finishedList = normalized.filter(
    (m) => m.status === "FINISHED" && m.startTime.getTime() >= day.getTime(),
  );
  // 연기 섹션 — POSTPONED 매치. cleanup-stale-scheduled cron 으로 자동 처리되는 매치도 포함.
  const postponedList = normalized.filter((m) => m.status === "POSTPONED");

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
  // 기본은 오늘 KST 만 LIVE 섹션 표시. 단 자정 boundary 매치(예: 5/28 23:20 시작 →
  // 5/29 새벽 진행 중)는 어제 날짜에 속하지만 현재 LIVE 이므로, 실제 LIVE 매치가
  // 있으면(liveList>0) 날짜 무관 표시 — 헤더 "LIVE N" 카운트와 렌더 불일치 방지.
  // (staleLive 는 이미 effStatus=FINISHED 로 변환되므로 liveList 는 진짜 진행 중만)
  const todayKstStr = dateQuery(new Date());
  const isToday = dateStr === todayKstStr;
  const showLive =
    (isToday || liveList.length > 0) &&
    (sport !== "soccer" || statusFilter === "all" || statusFilter === "live");
  const showScheduled = sport !== "soccer" || statusFilter === "all" || statusFilter === "scheduled";
  const showFinished = sport !== "soccer" || statusFilter === "all" || statusFilter === "finished";
  const showPostponed = sport !== "soccer" || statusFilter === "all" || statusFilter === "postponed";
  const visibleLive = showLive ? liveList : [];
  const visibleScheduled = showScheduled ? scheduledList : [];
  const visibleFinished = showFinished ? finishedList : [];
  const visiblePostponed = showPostponed ? postponedList : [];
  const visibleCount =
    visibleLive.length + visibleScheduled.length + visibleFinished.length + visiblePostponed.length;

  return (
    <div data-scores-root className={`${containerMaxW} mx-auto px-3 sm:px-6 py-5 sm:py-8 space-y-4`}>
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
          <p className="text-xs sm:text-sm text-neutral-500 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span>{dateKo} · 총 {normalized.length}경기</span>
            {liveList.length > 0 && (
              <span className="text-rose-600 dark:text-rose-400 font-semibold">
                ● LIVE {liveList.length}
              </span>
            )}
            {liveList.length > 0 && <LiveSoundToggle />}
          </p>
        </div>
        <LiveRefresher liveCount={liveList.length} />
      </header>

      {/* SEO 친화 보조 텍스트 (H1 직후) — 검색 키워드 자연 포함 */}
      <p className="text-[13px] sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
        {dateKo} {sportKo} 라이브 스코어·경기 일정·종료 결과를 한곳에서 확인하세요.
        {" "}{leagueBlurb} 통합, Elo 모델 승률 추정, 라이브 푸시 평균 2-3초 갱신.
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
                postponed: postponedList.length,
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
                  matches={normalizedAll.map((m) => ({
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
                    leagueLabel: displayLeagueLabel(m.league, m.startTime),
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
                    preview: m.preview,
                    recap: m.recap,
                    recentGoalSide: m.recentGoalSide ?? null,
                  }))}
                />
                <SoccerRowLayout
                  liveList={visibleLive}
                  scheduledList={visibleScheduled}
                  finishedList={visibleFinished}
                  postponedList={visiblePostponed}
                  lineupSet={lineupMatchIdSet}
                />
              </div>
            )}
        </div>
      ) : (
        <>
          {/* 리그 필터 — 야구 (12+ 리그) 는 드롭다운, 그 외는 가로 chip */}
          {leaguesAll.length > 1 &&
            (sport === "baseball" ? (
              <LeagueDropdown
                leagues={leaguesAll}
                activeLeague={leagueFilter}
                sport={sport}
                date={dateStr}
              />
            ) : (
              <LeagueChips
                leagues={leaguesAll}
                activeLeague={leagueFilter}
                sport={sport}
                date={dateStr}
              />
            ))}

          {/* 매치 list */}
          {normalized.length === 0 ? (
            <EmptyState sport={sport} nextAvailable={nextAvailable} />
          ) : (
            <div className="space-y-6">
              <FavoriteMatches
                matches={normalizedAll.map((m) => ({
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
                  leagueLabel: displayLeagueLabel(m.league, m.startTime),
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
                  preview: m.preview,
                  recap: m.recap,
                  recentGoalSide: m.recentGoalSide ?? null,
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
              {postponedList.length > 0 && (
                <Section title="🚫 연기" count={postponedList.length}>
                  {postponedList.map((m) => renderCard(m))}
                </Section>
              )}
            </div>
          )}
        </>
      )}

      <p className="text-[11px] text-neutral-500 leading-relaxed pt-2">
        ⓘ 라이브 점수는 TheSports 라이브 푸시로 평균 2-3초 반영됩니다 (매치 상세는 KBO·NPB·MLB 베이스 상황·볼카운트까지 실시간).
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
  postponedList,
  lineupSet,
}: {
  liveList: NormalizedMatch[];
  scheduledList: NormalizedMatch[];
  finishedList: NormalizedMatch[];
  postponedList: NormalizedMatch[];
  /** cache.lineup 존재 매치 id — L 배지용 */
  lineupSet: Set<number>;
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
        penaltyHome={m.penHome ?? null}
        penaltyAway={m.penAway ?? null}
        soccerGoals={m.soccerGoals}
        soccerCards={m.soccerCards}
        homeShort={m.home.abbr ?? m.home.name}
        awayShort={m.away.abbr ?? m.away.name}
        previewSlug={m.preview ?? null}
        recapSlug={m.recap ?? null}
        recentGoalSide={m.recentGoalSide ?? null}
        href={m.href}
        homePosition={m.home.position ?? null}
        awayPosition={m.away.position ?? null}
        homeFifaRank={m.home.fifaRank ?? null}
        awayFifaRank={m.away.fifaRank ?? null}
        awayFirst={BASEBALL_LEAGUES.has(m.league)}
        hasLineup={lineupSet.has(Number(m.id))}
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
  const postponedSorted = [...postponedList].sort(byStartThenLeague);
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
  const postponedGroups = dayGroupsOf(postponedSorted);

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
        doubleHeader={m.doubleHeader}
        mma={m.mma}
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
        {postponedGroups.length > 0 && (
          <section className="space-y-2">
            {statusHeader(`🚫 연기 (${postponedSorted.length})`, "text-amber-600 dark:text-amber-500", "sm")}
            {postponedGroups.map((g) => (
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

      {/* 데스크탑 — row table. overflow-x-auto = 좁은 창에서 잘림 대신 가로 스크롤(fallback).
          스코어보드.kr(sb-mode)은 data-srow-table min-width 해제로 화면폭에 맞춰 압축(스크롤 불필요). */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.02]">
        <div data-srow-table className="min-w-[860px] px-4 pt-1 pb-16">
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
          {postponedGroups.length > 0 && (
            <>
              <div className="px-0 pt-3 pb-1 text-[12px] font-bold text-amber-600 dark:text-amber-500">
                🚫 연기 ({postponedSorted.length})
              </div>
              {postponedGroups.map((g) => (
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

type MmaTale = {
  nickname: string | null;
  height: string | null;
  weight: string | null;
  reach: string | null;
  stance: string | null;
};

type NormalizedMatch = {
  id: string | number;
  sport: string;
  league: string;
  status: "LIVE" | "FINISHED" | "SCHEDULED" | "POSTPONED";
  home: { name: string; abbr?: string | null; logo?: string | null; score: number | null; teamId: number; position?: number | null; fifaRank?: number | null };
  away: { name: string; abbr?: string | null; logo?: string | null; score: number | null; teamId: number; position?: number | null; fifaRank?: number | null };
  timeLabel: string;
  liveStatusLabel: string | null;
  homeStarter: string | null;
  awayStarter: string | null;
  soccerCtx: SoccerContext | null;
  soccerGoals: SoccerGoal[] | null;
  soccerCards: SoccerCard[] | null;
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
  /** 축구 승부차기 — 정규/연장 동점 후 PK */
  penHome?: number | null;
  penAway?: number | null;
  doubleHeader: { index: number; total: number } | null;
  /** UFC Tale of the Tape — 파이터 신체/별명 (mma 외 종목은 null) */
  mma: { category: string | null; home: MmaTale; away: MmaTale } | null;
};

// 야구 라인업 cover 리그 — MLB 만 풍부한 boxscore 라인업 (MLB Stats API).
// KBO/NPB/CPBL/LMB 등은 라인업 미커버 (TheSports squad 정도, 풍부 X).
const BASEBALL_LINEUP_LEAGUES = new Set(["MLB"]);

function actionsFor(m: NormalizedMatch) {
  const showAi = !!m.href; // 모든 매치 — 라이브 페이지의 매치 인사이트 5탭 진입
  const showLineup = !!m.href && BASEBALL_LINEUP_LEAGUES.has(m.league);
  if (!showAi && !m.recap && !showLineup) return null;
  return (
    <>
      {showAi && (
        <Link
          href={m.href!}
          prefetch={false}
          className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/25 transition"
        >
          AI 예측
        </Link>
      )}
      {showLineup && (
        <Link
          href={m.href!}
          prefetch={false}
          className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-500/25 transition"
        >
          라인업
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

// 리그 표시 라벨 — NHL 은 6월에 스탠리컵 파이널만 열리므로(TheSports stage 데이터가
// SCHEDULED 단계엔 없음) 6월(KST) NHL 경기는 "🏆 스탠리컵 파이널" 로 표시.
function displayLeagueLabel(league: string, startTime: string | Date): string {
  const t = typeof startTime === "string" ? new Date(startTime) : startTime;
  const kstMonth = new Date(t.getTime() + 9 * 3600 * 1000).getUTCMonth();
  if (league === "NHL" && kstMonth === 5) return "🏆 스탠리컵 파이널"; // 5 = 6월(0-idx)
  return LEAGUE_DISPLAY[league] ?? league;
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
      leagueLabel={displayLeagueLabel(m.league, m.startTime)}
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
      doubleHeader={m.doubleHeader}
      mma={m.mma}
    />
  );
}

// LEAGUE_ORDER import 유지 (LEAGUE_DISPLAY 와 함께 sport-leagues 에서 export됨)
void LEAGUE_ORDER;
