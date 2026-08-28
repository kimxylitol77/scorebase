// 팀 페이지 — 클럽 정보·로스터·경기장·일정(종목별 분기).
import { prisma } from "@/lib/db";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import LeagueBadge from "@/components/LeagueBadge";
import ArticleCard from "@/components/ArticleCard";
import { matchLiveHref } from "@/lib/links/match-live-link";
import { toKoreanTeamName } from "@/lib/team-names";
import { koEnLanguages } from "@/lib/i18n/en";
import { SITE_URL } from "@/lib/site-url";
import { ogPageImage } from "@/lib/seo/og";
import FavoriteTeamButton from "@/components/FavoriteTeamButton";
import { NATIONAL_TEAM_LEAGUES, SOCCER_LEAGUES, BASEBALL_LEAGUES } from "@/lib/sports/sport-leagues";
import { fetchBaseballTable, npbDivisionKo } from "@/lib/sports/thesports/baseball-table";
import TeamAbout from "@/components/teams/TeamAbout";
import TransfersSection from "@/components/teams/TransfersSection";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { toKoreanPlayerName } from "@/lib/player-names";
import { fetchNhlRoster, type NhlRosterPlayer } from "@/lib/sports/nhl-api";
import { fetchMlbRoster, type MlbRosterPlayer } from "@/lib/sports/mlb-stats-api";
import { getNbaRoster, type NbaRosterPlayer } from "@/lib/sports/nba-players";
import { resolvePlayerNames } from "@/lib/players/resolvePlayerName";
import { getSportFromLeague } from "@/lib/players/types";
import rawTOverrides from "../../../../data/player-overrides.json";
import rawTPhotos from "../../../../data/player-photos.json";
import rawTPos from "../../../../data/player-positions.json";
import rawClubRank from "../../../../data/club-rank-by-team.json";
import rawTSquads from "../../../../data/team-squads.json";
import rawTeamVenues from "../../../../data/team-venues.json";
import rawBaseballRosters from "../../../../data/baseball-rosters.json";
import { npbPlayerKo, npbPlayerPhoto } from "@/lib/sports/npb-player-ko";
import { kboPhotoUrl } from "@/lib/sports/kbo-official";
import rawTeamHistory from "../../../../data/team-history.json";
import TeamHistory, { type TeamHistoryData } from "@/components/teams/TeamHistory";
import LolTeamRoster from "@/components/LolTeamRoster";
import AmbientGlow from "@/components/AmbientGlow";
import { Globe, Landmark, Goal, Users, Target, Star, HeartPulse, Shirt } from "lucide-react";
import TeamRecentLineup, { type LineupPlayer } from "@/components/teams/TeamRecentLineup";
import TeamSeasonPanel, { type SeasonSlice, type PanelTeamStat, type PanelXgItem } from "@/components/teams/TeamSeasonPanel";
import { seasonLabelFor } from "@/lib/sports/season-calendar";
import { parseFixtureXg } from "@/lib/xg/outcome";
import rawCoaches from "../../../../data/team-coaches.json";
import rawNonsoccerCoaches from "../../../../data/nonsoccer-coaches.json";
import rawCoachNames from "../../../../data/coach-names.json";
import rawCoachPhotos from "../../../../data/coach-photos.json";
import { venueKo, cityKo } from "@/lib/venue-ko";
import { calcStandings } from "@/lib/predict/standings";
import { calcEloTable, getElo } from "@/lib/predict/elo";
import { currentSeasonStart, previousSeasonStart } from "@/lib/predict/season-window";
import { calcForm } from "@/lib/predict/form";
import { getTeamMatches } from "@/lib/predict/league-data";
import { calcStreaks } from "@/lib/predict/streak";
import { calcHomeAway } from "@/lib/predict/home-away";
import { calcWinProbability } from "@/lib/predict/win-probability";
import type { PredictMatch } from "@/lib/predict/types";
import {
  fetchSeasonTopScorers,
  getApiFootballSeason,
  getTeamKeyPlayers,
  API_FOOTBALL_LEAGUE_ID,
} from "@/lib/sports/api-football-pro";
import FormDots from "@/components/FormDots";
import { jsonLdScript } from "@/lib/seo/jsonld";

// ISR — 순위·로스터·경기 결과는 5분 캐시로 충분(라이브 점수는 /scores·/live 가 정본).
export const revalidate = 300;

// ISR 활성화 — 이 선언이 없으면 revalidate 가 있어도 매 요청 렌더된다 (2026-08-01 실측).
// 빈 배열 = 빌드 프리렌더 0건, 요청 온 경로만 생성 후 캐시.
export function generateStaticParams() {
  return [] as { id: string }[];
}

// TheSports 선수단(이적시장 데이터) — 이름 → /transfers/{ts id} 링크용
const T_OVERRIDES = rawTOverrides as Record<string, { nameKo?: string; flag?: string }>;
const T_PHOTOS = rawTPhotos as Record<string, string>;
const T_POS = rawTPos as Record<string, string>;
// 세계 클럽 랭킹 (ts team id → 순위, 2729팀). 팀 헤더 배지용. [[club-ranking]]
const CLUB_RANK = rawClubRank as Record<string, number>;
// 팀 시즌 통계 — TeamSeasonStatArchive(시즌별 영구 아카이브, archive-team-stats 잡)로 이관.
// 이전의 data/team-season-stats.json 단일 스냅샷은 25-26 분으로 백필됨.
// 공식 스쿼드 (ts team/squad/list — 등번호·공식 coarse 포지션, 154팀). 생성: scripts/build-team-squads.ts [[transfers-league-expansion]]
const T_SQUADS = rawTSquads as Record<string, { updatedAt: string; squad: Array<{ id: string; name: string; position: string | null; number: number | null }> }>;
// 축구 팀 홈구장+메타 (build-team-venues.ts — TheSports team/additional+venue)
interface TeamVenue { venueName?: string; capacity?: number; city?: string; country?: string; foundation?: number; website?: string; marketValue?: number; currency?: string; totalPlayers?: number; foreignPlayers?: number }
const TEAM_VENUES = rawTeamVenues as Record<string, TeamVenue>;
// KBO·NPB 팀 로스터 (build-baseball-rosters.ts — koreabaseball·npb scrape, key=DB Team.id)
interface BaseballRosterPlayer { id: string; name: string; group: "P" | "B" }
const BASEBALL_ROSTERS = rawBaseballRosters as Record<string, BaseballRosterPlayer[]>;
const T_HISTORY = rawTeamHistory as Record<string, TeamHistoryData>;
// 감독 스냅샷 (ts coach/list + af 폴백, 키=ts team id) — 생성: scripts/build-team-coaches.ts
const COACHES = rawCoaches as Record<string, { id?: string; name: string; nameKo: string | null; logo: string | null; age: number | null; nationality: string | null; preferredFormation: string | null; joined: number | null; contractUntil: number | null }>;
const COACH_KO = rawCoachNames as Record<string, string>; // coachId → 한글명 (build-coach-names-haiku)
// 비축구(야구 KBO·MLB·NPB / 농구 NBA·WNBA·KBL·WKBL / 하키 NHL) 감독 (키=우리 Team.id) — 생성: scripts/build-nonsoccer-coaches.ts
const NONSOCCER_COACHES = rawNonsoccerCoaches as Record<string, { nameKo: string; nameEn?: string; interim?: boolean; asOf: string }>;
// 라인업 감독 사전(수집·번역 범위가 가장 넓음) — team-coaches nameKo 누락분 폴백 (박태하 실측)
const COACH_PHOTOS = rawCoachPhotos as Record<string, { nameKo?: string }>;
const squadPos = (id: string, coarse: string | null | undefined): string | null =>
  T_POS[id] || (coarse === "G" ? "GK" : coarse === "M" ? "MF" : coarse === "D" ? "DF" : coarse === "F" ? "FW" : null);

const LEAGUE_GRADIENT: Record<string, string> = {
  EPL: "from-purple-600 via-fuchsia-500 to-pink-500",
  LALIGA: "from-amber-500 via-red-600 to-yellow-500",
  BUNDESLIGA: "from-yellow-400 via-red-600 to-slate-900",
  SERIE_A: "from-sky-500 via-blue-700 to-emerald-600",
  LIGUE_1: "from-blue-700 via-rose-600 to-indigo-600",
  MLS: "from-red-600 via-slate-900 to-blue-700",
  UCL: "from-indigo-700 via-blue-600 to-cyan-500",
  NBA: "from-orange-500 via-amber-500 to-yellow-500",
  NHL: "from-cyan-500 via-blue-600 to-indigo-700",
  MLB: "from-emerald-500 via-green-600 to-teal-700",
  KBO: "from-blue-600 via-cyan-500 to-teal-500",
  NPB: "from-red-600 via-rose-500 to-pink-500",
  // 아시아 축구
  K_LEAGUE_1: "from-blue-700 via-blue-500 to-sky-400",
  K_LEAGUE_2: "from-blue-500 via-sky-400 to-cyan-300",
  J1_LEAGUE: "from-pink-600 via-rose-500 to-red-500",
  J2_LEAGUE: "from-pink-400 via-rose-300 to-red-300",
  AFC_CL: "from-orange-600 via-red-500 to-amber-500",
  SAUDI_PL: "from-emerald-700 via-green-600 to-lime-500",
  // 유럽 컵
  UEL: "from-orange-500 via-amber-500 to-yellow-400",
  UECL: "from-emerald-500 via-green-500 to-teal-400",
  // 유럽 2부
  CHAMPIONSHIP: "from-violet-700 via-purple-600 to-fuchsia-500",
  LALIGA_2: "from-red-700 via-orange-500 to-amber-400",
  BUNDESLIGA_2: "from-red-700 via-rose-600 to-slate-700",
  SERIE_B: "from-blue-500 via-sky-400 to-emerald-400",
  LIGUE_2: "from-blue-800 via-indigo-700 to-blue-500",
  CLUB_WORLD_CUP: "from-yellow-500 via-amber-400 to-orange-400",
  // 아시아 추가
  AFC_CL_TWO: "from-orange-400 via-amber-300 to-yellow-300",
  AFC_U23: "from-indigo-700 via-purple-600 to-violet-500",
  CSL: "from-red-700 via-rose-600 to-amber-400",
  A_LEAGUE: "from-yellow-500 via-amber-500 to-emerald-500",
  // 유럽 추가
  EREDIVISIE: "from-orange-600 via-amber-500 to-red-500", // 네덜란드 오렌지
  PRIMEIRA_LIGA: "from-emerald-700 via-green-600 to-red-600", // 포르투갈
  SUPER_LIG: "from-red-600 via-rose-500 to-red-700", // 터키
  JUPILER_PL: "from-yellow-500 via-black to-red-600", // 벨기에
  SPL: "from-blue-800 via-indigo-700 to-sky-600", // 스코틀랜드
  GREEK_SL: "from-blue-700 via-sky-500 to-blue-400", // 그리스
  // 북중남미 추가
  BRASILEIRAO: "from-yellow-500 via-emerald-500 to-blue-700", // 브라질
  LIGA_MX: "from-emerald-700 via-green-600 to-red-600", // 멕시코
  COPA_LIB: "from-blue-900 via-indigo-700 to-yellow-500",
  COPA_SUD: "from-orange-600 via-amber-500 to-yellow-400",
};

// /injuries/[league] 지원 리그 (그 라우트 VALID 와 동기 — 미지원 리그는 부상 바로가기 숨김)
const INJURY_LEAGUES = new Set<string>([
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "NBA", "MLB", "NHL", "KBO", "NPB",
  "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE", "AFC_CL", "SAUDI_PL",
]);

interface Props {
  params: Promise<{ id: string }>;
}

// 종목별 검색 의도 키워드 — "다저스 순위", "양키스 로스터" 등 한국 검색 수요를 title·description 에 반영.
function teamIntentKeywords(league: string): string {
  let sport: string;
  try {
    sport = getSportFromLeague(league);
  } catch {
    sport = "soccer";
  }
  switch (sport) {
    case "baseball":
      // 빙 실측 "삼성 라이온즈 팀 순위 야구" 류 롱테일 — "야구"·"팀 순위" 토큰 정확 매칭.
      return "야구 팀 순위·일정·로스터·선수 통계";
    case "basketball":
      return "순위·일정·로스터·선수 기록";
    case "hockey":
      return "순위·일정·로스터";
    default:
      return "순위·일정·이적·라인업"; // soccer
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const team = await prisma.team.findUnique({ where: { id: Number(id) } });
  if (!team) return { title: "팀을 찾을 수 없습니다" };
  const ko = toKoreanTeamName(team.name, team.league);
  const intent = teamIntentKeywords(team.league);
  const enName = ko === team.name ? "" : `(${team.name})`;
  let title = `${ko} ${intent}`;
  let description = `${team.league} ${ko}${enName} ${intent} 정보. 현재 순위와 최근 폼, 다음 경기 일정, 주요 선수와 AI 승부예측을 실시간 데이터로 한 페이지에 모았습니다.`;
  // 야구(KBO/NPB) — 빙 "{구단} 팀 순위 야구" 패턴이 노출 1,256에 클릭 2 (2026-08-08 실측).
  // 순위표 페이지(67491a5)에서 먹힌 방식 그대로: 검색어를 앞세우고 현재 순위·날짜를 동적 삽입해
  // SERP 에서 "지금 몇 위인지 바로 보이는" 제목으로 클릭 유인. 캐시 stale 이면 정적 제목 유지.
  if (BASEBALL_LEAGUES.has(team.league)) {
    try {
      const rows = await fetchBaseballTable(team.league);
      const r = rows.find((x) => x.ourTeamId === team.id);
      if (r) {
        const kst = new Date(Date.now() + 9 * 3600_000);
        const dateLabel = `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
        const pct = (r.wins / Math.max(r.wins + r.losses, 1)).toFixed(3);
        // 순위는 배열 인덱스가 아니라 ts 가 준 position 을 쓴다 — 매핑 결손·복수 표(NPB 양대 리그)
        // 에서 인덱스는 실제 순위와 어긋난다(2026-08-27 KIA 4위 → "7위" 오표기 사고).
        const divLabel = npbDivisionKo(r.division); // NPB 만 "센트럴/퍼시픽", KBO 는 빈 문자열
        const rankLabel = `${team.league}${divLabel ? ` ${divLabel}` : ""} ${r.position}위`;
        title = `${ko} 팀 순위 (${dateLabel}) — ${rankLabel} · 야구 일정·로스터·통계`;
        description =
          `오늘의 ${ko} 팀 순위 (${dateLabel}): ${rankLabel}, ${r.wins}승 ${r.losses}패 승률 ${pct}. ` +
          `일정·로스터·선수 통계와 AI 승부예측을 실시간 갱신합니다.`;
      }
    } catch {
      // 순위 캐시 불가 시 정적 폴백 유지
    }
  } else {
    // 비야구(축구·농구·하키) — 빙 실측(6/26~8/14) 클럽 페이지 노출 7.4천에 CTR 0.50%
    // (레알 266·아틀레티코 703·토트넘 233 노출에 클릭 0~1). 야구(8/8)에서 먹힌 동적 삽입을
    // 확장하되, 시즌 초 순위는 노이즈라 다음 경기·최근 폼을 넣는다("토트넘 경기일정" 류 정조준).
    try {
      const [next, recent] = await Promise.all([
        prisma.match.findFirst({
          where: { league: team.league, status: "SCHEDULED", startTime: { gte: new Date() }, OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }] },
          orderBy: { startTime: "asc" },
          select: { startTime: true, homeTeamId: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
        }),
        prisma.match.findMany({
          where: { league: team.league, status: "FINISHED", OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }] },
          orderBy: { startTime: "desc" },
          take: 5,
          select: { homeTeamId: true, homeScore: true, awayScore: true },
        }),
      ]);
      if (next) {
        const oppName = next.homeTeamId === team.id ? next.awayTeam.name : next.homeTeam.name;
        const oppKo = toKoreanTeamName(oppName, team.league);
        const kst = new Date(next.startTime.getTime() + 9 * 3600_000);
        const dateLabel = `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`;
        let w = 0, d = 0, l = 0;
        for (const m of recent) {
          if (m.homeScore == null || m.awayScore == null) continue;
          if (m.homeScore === m.awayScore) d++;
          else if ((m.homeScore > m.awayScore) === (m.homeTeamId === team.id)) w++;
          else l++;
        }
        const form = w + d + l > 0 ? `최근 ${w + d + l}경기 ${w}승${d > 0 ? ` ${d}무` : ""} ${l}패` : null;
        title = `${ko} ${intent.replace("일정", "경기 일정")} — 다음 경기 ${dateLabel} ${oppKo}전`;
        description =
          `${ko}${enName} 다음 경기 ${dateLabel} ${oppKo}전.${form ? ` ${form}.` : ""} ` +
          `${team.league} ${intent.replace("일정", "경기 일정")}과 AI 승부예측을 실시간 데이터로 한 페이지에 모았습니다.`;
      }
    } catch {
      // 매치 조회 불가 시 정적 폴백 유지
    }
  }
  return {
    title,
    description,
    alternates: {
      canonical: `/teams/${id}`,
      // 영어판(/en/teams) hreflang 상호 연결
      languages: koEnLanguages(`/teams/${id}`, `/en/teams/${id}`),
    },
    openGraph: {
      title: `${ko} · ${team.league}`,
      description,
      type: "profile",
      images: ogPageImage({ title: ko, subtitle: `${team.league} 순위·일정·로스터·AI 승부예측`, tag: team.league }),
    },
  };
}

export default async function TeamPage({ params }: Props) {
  const { id } = await params;
  const teamId = Number(id);
  if (!Number.isFinite(teamId)) notFound();

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  if (!team) notFound();

  // 국가대표팀은 /national-teams 가 단일 진실 — 클럽 페이지와 이원화 방지 (308)
  if (NATIONAL_TEAM_LEAGUES.has(team.league)) permanentRedirect(`/national-teams/${teamId}`);

  const gradient =
    LEAGUE_GRADIENT[team.league] ?? "from-neutral-700 to-neutral-900";

  // team 만 의존하는 독립 쿼리 5개 — 직렬 5왕복을 한 라운드로 병렬화 (페이지 이동 가속).
  const [dbMatches, recentMatches, upcoming, articles, tsTeamRows] = await Promise.all([
    // 같은 리그 매치 전체 (순위·Elo·폼 계산용)
    prisma.match.findMany({
      where: { league: team.league },
      select: {
        id: true, league: true, status: true, homeTeamId: true, awayTeamId: true,
        homeScore: true, awayScore: true, startTime: true,
      },
    }),
    // 최근 5개 끝난 매치
    prisma.match.findMany({
      where: { league: team.league, status: "FINISHED", OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { startTime: "desc" },
      take: 5,
    }),
    // 다가오는 5개 매치
    prisma.match.findMany({
      where: { league: team.league, status: "SCHEDULED", OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { startTime: "asc" },
      take: 5,
    }),
    // 관련 기사
    prisma.article.findMany({
      where: {
        status: "PUBLISHED",
        league: team.league,
        OR: [{ match: { homeTeamId: teamId } }, { match: { awayTeamId: teamId } }],
      },
      orderBy: { publishedAt: "desc" },
      take: 9,
    }),
    // TheSports 선수단 매핑 (PlayerMarketValue·squad 빌드용)
    prisma.teamSourceId.findMany({ where: { source: "thesports", teamId: team.id }, select: { externalId: true } }),
  ]);
  const matches: PredictMatch[] = dbMatches.map((m) => ({ ...m }));

  // === 선발 라인업 (축구) — "아스날 라인업" 류 검색어 대응. title 이 라인업을 약속하는데
  // 실제 섹션이 없던 것을 콘텐츠로 채운다. 이미 로드된 upcoming·recentMatches 행에서
  // 이 팀 쪽 lineup JSON 이 있는 가장 최근 매치를 고른다(킥오프 전 도착분 = upcoming 우선).
  let recentLineup: {
    formation: string | null;
    xi: string[];
    oppKo: string;
    dateLabel: string;
    finished: boolean;
  } | null = null;
  if (SOCCER_LEAGUES.has(team.league)) {
    for (const m of [...upcoming, ...recentMatches]) {
      const isHome = m.homeTeamId === teamId;
      const raw = isHome ? m.lineupHome : m.lineupAway;
      if (!raw) continue;
      try {
        const lu = JSON.parse(raw) as { formation?: string | null; startXI?: string[] };
        if (!Array.isArray(lu.startXI) || lu.startXI.length < 11) continue;
        const opp = isHome ? m.awayTeam : m.homeTeam;
        const kst = new Date(m.startTime.getTime() + 9 * 3600_000);
        recentLineup = {
          formation: lu.formation ?? null,
          xi: lu.startXI.slice(0, 11),
          oppKo: toKoreanTeamName(opp.name, team.league) || opp.name,
          dateLabel: `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`,
          finished: m.status === "FINISHED",
        };
        break;
      } catch {
        // 파싱 안 되는 라인업은 없는 것으로 — 다음 매치 시도
      }
    }
  }
  // 선발 11명 한글명 — DB nameKo 우선(축구 4.3만명 보유), 동명이인 충돌 시 확정하지 않음.
  let lineupPlayers: LineupPlayer[] = [];
  if (recentLineup) {
    const koRows = await prisma.theSportsPlayer.findMany({
      where: { name: { in: recentLineup.xi } },
      select: { name: true, nameKo: true },
    });
    const koMap = new Map<string, string | null>();
    for (const r of koRows) {
      koMap.set(r.name, koMap.has(r.name) && koMap.get(r.name) !== r.nameKo ? null : r.nameKo);
    }
    lineupPlayers = recentLineup.xi.map((n) => ({
      name: n,
      ko: koMap.get(n) ?? (toKoreanPlayerName(n) !== n ? toKoreanPlayerName(n) || null : null),
    }));
  }

  // 순위·폼·스트릭·홈원정은 현재 시즌만 (지난 시즌 접기·롤오버 자동, 구시즌/중복 매치 합산 방지).
  // Elo 는 시즌을 넘어 누적돼야 하므로 전체 매치 유지 (윈도잉하면 시즌마다 레이팅 리셋되는 회귀).
  const seasonStart = currentSeasonStart(team.league);
  let seasonMatches = seasonStart ? matches.filter((m) => m.startTime >= seasonStart) : matches;
  if (seasonStart && seasonMatches.filter((m) => m.status === "FINISHED").length < 10) {
    const prev = previousSeasonStart(seasonStart);
    seasonMatches = matches.filter((m) => m.startTime >= prev && m.startTime < seasonStart);
  }

  // 승격팀 폴백 — 위 매치는 전부 team.league 기준이라, 이번에 올라온 팀은 지난 시즌으로 물러나도
  //  여전히 0건이다(26-27 EPL 헐 시티: EPL 0건 / 25-26 챔피언십 49건). 그래서 "최근 5경기 폼
  //  데이터 없음"이 떴다. 폼·흐름·홈원정만 팀 기준 매치로 채운다 — 순위·공수 랭크는 리그 안에서만
  //  뜻이 있고, 시즌 통계 패널이 이미 "새 시즌 데이터가 쌓이는 중"이라고 밝히므로 그대로 둔다.
  const playedInLeague = seasonMatches.some(
    (m) => m.status === "FINISHED" && (m.homeTeamId === teamId || m.awayTeamId === teamId),
  );
  const formMatches = playedInLeague ? seasonMatches : await getTeamMatches(teamId);

  // 통계
  const standings = calcStandings(seasonMatches);
  const row = standings.byTeam.get(teamId);
  const eloTable = calcEloTable(matches); // 전체 — Elo 는 시즌 누적
  const elo = getElo(eloTable, teamId);
  const recentForm = calcForm(formMatches, teamId, undefined, 5);
  const streak = calcStreaks(formMatches, teamId);
  const ha = calcHomeAway(formMatches, teamId);
  const attackRank = standings.attackRank.get(teamId);
  const defenseRank = standings.defenseRank.get(teamId);

  // 부상자 + 핵심 선수 (api-football Pro, 축구 리그만)
  let keyPlayers: Awaited<ReturnType<typeof getTeamKeyPlayers>> = [];
  if (process.env.API_FOOTBALL_KEY && API_FOOTBALL_LEAGUE_ID[team.league]) {
    try {
      const season = getApiFootballSeason(new Date(), team.league);
      const allTop = await fetchSeasonTopScorers(team.league, season);
      keyPlayers = getTeamKeyPlayers(allTop, team.name, 5);
    } catch {}
  }

  // Supabase + 코드 fallback 으로 선수명 한글화
  const sport = (() => {
    try { return getSportFromLeague(team.league); } catch { return "soccer" as const; }
  })();
  const playerNameResolved = await resolvePlayerNames(
    keyPlayers.map((p) => ({ apiFootballId: p.playerId, nameEn: p.playerName })),
    sport,
    team.league,
  );
  const koName = (id: number, en: string) =>
    playerNameResolved.get(id)?.ko ?? toKoreanPlayerName(en);

  // TheSports 선수단 (PlayerMarketValue, ts player id) — 이름 클릭 → /transfers 상세.
  // tsTeamRows 는 위 Promise.all 에서 미리 로드됨.
  const clubRank = tsTeamRows.map((t) => CLUB_RANK[t.externalId]).filter((r): r is number => !!r).sort((a, b) => a - b)[0] ?? null;
  const teamVenue = tsTeamRows.map((t) => TEAM_VENUES[t.externalId]).find((v): v is TeamVenue => !!v) || null;
  // 현 감독 — ts coach id 있으면 /coaches/{id} 프로필 링크, 없으면(af 폴백 팀) 표시만.
  // 비축구 리그는 nonsoccer-coaches.json 폴백 (프로필 링크 없음).
  const bbCoach = NONSOCCER_COACHES[String(team.id)] ?? null;
  const coach =
    tsTeamRows.map((t) => COACHES[t.externalId]).find((c) => !!c) ??
    (bbCoach
      ? { name: bbCoach.nameEn ?? bbCoach.nameKo, nameKo: bbCoach.nameKo, logo: null, age: null, nationality: null, preferredFormation: null, joined: null, contractUntil: null }
      : null);
  const coachRole = coach && !coach.id && bbCoach?.interim ? "감독대행" : "감독";
  const coachName = coach ? coach.nameKo || (coach.id && (COACH_KO[coach.id] || COACH_PHOTOS[coach.id]?.nameKo)) || coach.name : null;

  // TeamAbout(SEO 소개 문단)용 — 이미 계산된 값 재사용, 시즌 라벨·종목명만 파생.
  const aboutSeasonLabel = (() => {
    const s = seasonMatches.find((m) => m.status === "FINISHED")?.startTime;
    if (!s) return null;
    const d = new Date(s);
    const y = d.getUTCMonth() >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
  })();
  const sportLabel =
    ({ soccer: "축구", baseball: "야구", basketball: "농구", hockey: "아이스하키", esports: "e스포츠" } as Record<string, string>)[sport] ?? "축구";
  let squad: { id: string; name: string; photo: string | null; pos: string | null; value: number; number: number | null; flag: string | null }[] = [];
  if (tsTeamRows.length) {
    const extIds = tsTeamRows.map((t) => t.externalId);
    // 시장가치(PMV) — 공식 스쿼드 멤버에 join + fallback 용
    const pmvAll = await prisma.playerMarketValue.findMany({
      where: { teamId: { in: extIds }, currentValue: { not: null } },
      orderBy: { currentValue: "desc" }, select: { id: true, currentValue: true, history: true },
    });
    // 공식 스쿼드(team/squad/list — 등번호 포함 정본) 우선. 없는 팀(154팀 외)은 PMV 18개월 컷오프 fallback.
    // PlayerMarketValue.teamId 는 "마지막 소속팀" 이라 은퇴 선수(칸·라암 등)가 영구 잔류 → 컷오프로만 거른다.
    const official = tsTeamRows.map((t) => T_SQUADS[t.externalId]?.squad).find((s) => Array.isArray(s) && s.length > 0);
    let members: { id: string; coarse: string | null; number: number | null }[];
    if (official) {
      members = official.map((m) => ({ id: m.id, coarse: m.position, number: m.number }));
    } else {
      // 서버 컴포넌트 — 요청(또는 revalidate)마다 1회 렌더라 클라이언트 렌더 순수성 규칙 대상이 아니다.
      // eslint-disable-next-line react-hooks/purity
      const cutoff = Math.floor(Date.now() / 1000) - 18 * 30 * 86400;
      members = pmvAll
        .filter((p) => { const h = (p.history as { market_time?: number }[]) || []; return (h[h.length - 1]?.market_time ?? 0) >= cutoff; })
        .map((p) => ({ id: p.id, coarse: null, number: null }));
    }

    // 몸값은 명단 id 로 다시 조회 — PMV.teamId 는 시장가치 스냅샷 시점 소속이라
    // 이적창에 새로 온 선수는 아직 옛 팀에 걸려 있어 teamId 로만 찾으면 € 0 으로 뜬다.
    const valueRows = official
      ? await prisma.playerMarketValue.findMany({
          where: { id: { in: members.map((m) => m.id) }, currentValue: { not: null } },
          select: { id: true, currentValue: true },
        })
      : pmvAll;
    const valueOf = new Map(valueRows.map((p) => [p.id, Math.round((p.currentValue || 0) / 1e6)]));

    const sp = await prisma.theSportsPlayer.findMany({ where: { id: { in: members.map((m) => m.id) } }, select: { id: true, name: true, nameKo: true, photoUrl: true, position: true } });
    const spMap = new Map(sp.map((p) => [p.id, p]));
    const seen = new Set<string>();
    squad = members
      .map((m) => {
        const t = spMap.get(m.id); const ov = T_OVERRIDES[m.id];
        return { id: m.id, name: ov?.nameKo || t?.nameKo || t?.name || "선수", photo: T_PHOTOS[m.id] || t?.photoUrl || null, pos: squadPos(m.id, m.coarse ?? t?.position), value: valueOf.get(m.id) ?? 0, number: m.number, flag: ov?.flag || null };
      })
      // 이름없음("선수") 제외 + 동일 표시명 중복 제거
      .filter((p) => { if (p.name === "선수" || seen.has(p.name)) return false; seen.add(p.name); return true; })
      // 시장가치순, 동가면 등번호순
      .sort((a, b) => b.value - a.value || (a.number ?? 99) - (b.number ?? 99));
  }

  // 스쿼드 가치 — ts team/additional 의 marketValue 는 몸값 커버가 얕은 리그(K리그 등)에서
  // 신뢰할 수 없어 쓰지 않는다. 우리 몸값 데이터(PMV)가 스쿼드를 실질 커버(15명+)할 때만 합산 표시.
  const squadValued = squad.filter((p) => p.value > 0);
  const squadValueM = squadValued.length >= 15 ? squadValued.reduce((s, p) => s + p.value, 0) : null;


  // NHL 로스터 (NHL 공식 API, id=nhlId) — 팀 페이지 선수 명단 → 선수 상세(/players/{id}?league=NHL) 연결.
  //  shortName=팀 약어(FLA 등). roster/current 는 여름 빈 응답이라 fetchNhlRoster 가 시즌 명시+직전 fallback.
  let nhlRoster: NhlRosterPlayer[] = [];
  if (team.league === "NHL" && team.shortName) {
    const dn = new Date();
    const ny = dn.getUTCMonth() + 1 >= 9 ? dn.getUTCFullYear() : dn.getUTCFullYear() - 1;
    nhlRoster = await fetchNhlRoster(team.shortName, `${ny}${ny + 1}`);
  }

  // MLB 로스터 (MLB Stats API, person.id=mlbStatsId) → /players/{id}?league=MLB 선수페이지 연결.
  let mlbRoster: MlbRosterPlayer[] = [];
  if (team.league === "MLB") mlbRoster = await fetchMlbRoster(team.name);
  // KBO·NPB — 정적 JSON 로스터 (런타임 scrape 안 함, 주간 빌드)
  const baseballRoster: BaseballRosterPlayer[] =
    team.league === "KBO" || team.league === "NPB"
      ? (BASEBALL_ROSTERS[String(team.id)] ?? [])
      : [];
  // NBA — 정적 인덱스(nba-players.json, ESPN 30팀 로스터·주간 빌드). team=DB name 매칭.
  const nbaRoster: NbaRosterPlayer[] =
    team.league === "NBA" ? getNbaRoster(team.name) : [];

  // ── 시즌 데이터 패널 (시즌 통계·팀 시즌 통계·xG 추이) — 시즌 칩으로 접는 슬라이스 ──
  // 현재 시즌 = 라이브 계산(매치). 과거 시즌 순위 = SeasonStandingsArchive 정본(1단계 아카이브 —
  // 수집 개시 이전 부분 시즌을 매치로 재계산하면 틀리므로 재계산하지 않는다).
  // 과거 팀 시즌 통계 = TeamSeasonStatArchive. xG = 매치 원자료를 시즌 창으로 분할.
  interface XgTrendItem {
    matchId: number;
    startTime: Date;
    opp: string;
    result: "W" | "D" | "L";
    gf: number;
    ga: number;
    xgFor: number;
    xgAgainst: number;
  }
  const xgAll: XgTrendItem[] = [];
  if (sport === "soccer") {
    const withStats = await prisma.match.findMany({
      where: {
        league: team.league,
        status: "FINISHED",
        fixtureStats: { not: null },
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      },
      orderBy: { startTime: "desc" },
      take: 120, // 시즌 3개 커버
      select: {
        id: true, startTime: true, homeTeamId: true, homeScore: true, awayScore: true, fixtureStats: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
    });
    for (const m of withStats) {
      const { home, away } = parseFixtureXg(m.fixtureStats);
      if (home == null || away == null || m.homeScore == null || m.awayScore == null) continue;
      const isHome = m.homeTeamId === teamId;
      const gf = isHome ? m.homeScore : m.awayScore;
      const ga = isHome ? m.awayScore : m.homeScore;
      xgAll.push({
        matchId: m.id,
        startTime: m.startTime,
        opp: toKoreanTeamName(isHome ? m.awayTeam.name : m.homeTeam.name, team.league),
        result: gf > ga ? "W" : gf < ga ? "L" : "D",
        gf,
        ga,
        xgFor: isHome ? home : away,
        xgAgainst: isHome ? away : home,
      });
    }
  }
  const buildXg = (items: XgTrendItem[]): SeasonSlice["xg"] => {
    if (items.length < 5) return null; // 기존 규칙 유지 — 표본 5경기 미만 미노출
    const asc = [...items].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    const avg = (f: (x: XgTrendItem) => number) => asc.reduce((s, x) => s + f(x), 0) / asc.length;
    const toItem = (x: XgTrendItem): PanelXgItem => ({
      matchId: x.matchId, date: x.startTime.toISOString(), opp: x.opp, result: x.result,
      gf: x.gf, ga: x.ga, xgFor: x.xgFor, xgAgainst: x.xgAgainst,
    });
    return {
      count: asc.length,
      xgForAvg: avg((x) => x.xgFor),
      xgAgainstAvg: avg((x) => x.xgAgainst),
      goalsAvg: avg((x) => x.gf),
      items: asc.slice(-10).map(toItem),
    };
  };

  const seasonSlices: SeasonSlice[] = [];
  {
    // 이 팀의 시즌별 ts 집계 + 리그의 시즌별 최종 순위 아카이브
    const tsStatRows = await prisma.teamSeasonStatArchive.findMany({
      where: { teamId },
      select: { seasonLabel: true, stat: true },
    });
    const tsStatByLabel = new Map(tsStatRows.map((r) => [r.seasonLabel, r.stat as unknown as PanelTeamStat]));

    if (seasonStart) {
      const starts = [seasonStart, previousSeasonStart(seasonStart), previousSeasonStart(previousSeasonStart(seasonStart))];
      const labels = starts.map((s) => seasonLabelFor(team.league, s.getUTCFullYear()));
      const archived = await prisma.seasonStandingsArchive.findMany({
        where: { league: team.league, seasonLabel: { in: labels.slice(1) } },
        select: { seasonLabel: true, rows: true },
      });
      interface ArchRow { teamId: number | null; position: number; played: number; won: number; draw?: number; loss: number; gf?: number; ga?: number; points?: number }
      const archByLabel = new Map(archived.map((a) => [a.seasonLabel, (a.rows as unknown as ArchRow[]) ?? []]));

      for (let i = 0; i < starts.length; i++) {
        const start = starts[i];
        const end = i === 0 ? null : starts[i - 1];
        const label = labels[i];
        const xg = buildXg(xgAll.filter((x) => x.startTime >= start && (!end || x.startTime < end)));
        if (i === 0) {
          // 현재 시즌 — 매치 라이브 계산 (개막 전이면 stats null → "쌓이는 중" 표시)
          const windowMatches = matches.filter((m) => m.startTime >= start);
          const st = calcStandings(windowMatches);
          const r = st.byTeam.get(teamId);
          seasonSlices.push({
            label, isCurrent: true,
            stats: r
              ? {
                  position: r.position, teams: st.rows.length, points: r.points,
                  wins: r.wins, draws: r.draws, losses: r.losses,
                  goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst, goalDiff: r.goalDiff,
                  attackRank: st.attackRank.get(teamId) ?? null,
                  defenseRank: st.defenseRank.get(teamId) ?? null,
                }
              : null,
            elo, tsStat: tsStatByLabel.get(label) ?? null, xg,
          });
        } else {
          const rows = archByLabel.get(label) ?? [];
          const me = rows.find((r) => r.teamId === teamId);
          const tsStat = tsStatByLabel.get(label) ?? null;
          if (!me && !tsStat && !xg) continue; // 그 시즌 데이터가 전혀 없으면 칩 생략
          const byGf = rows.filter((r) => r.gf != null).sort((a, b) => (b.gf ?? 0) - (a.gf ?? 0));
          const byGa = rows.filter((r) => r.ga != null).sort((a, b) => (a.ga ?? 0) - (b.ga ?? 0));
          seasonSlices.push({
            label, isCurrent: false,
            stats: me
              ? {
                  position: me.position, teams: rows.length,
                  points: me.points ?? me.won * 3 + (me.draw ?? 0),
                  wins: me.won, draws: me.draw ?? 0, losses: me.loss,
                  goalsFor: me.gf ?? 0, goalsAgainst: me.ga ?? 0,
                  goalDiff: (me.gf ?? 0) - (me.ga ?? 0),
                  attackRank: me.gf != null ? byGf.findIndex((r) => r.teamId === teamId) + 1 || null : null,
                  defenseRank: me.ga != null ? byGa.findIndex((r) => r.teamId === teamId) + 1 || null : null,
                }
              : null,
            elo: null, tsStat, xg,
          });
        }
      }
    } else {
      // 시즌 경계 없는 대회(월드컵·컵) — 단일 슬라이스, 기존 동작 유지
      const st = calcStandings(seasonMatches);
      const r = st.byTeam.get(teamId);
      seasonSlices.push({
        label: null, isCurrent: true,
        stats: r
          ? {
              position: r.position, teams: st.rows.length, points: r.points,
              wins: r.wins, draws: r.draws, losses: r.losses,
              goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst, goalDiff: r.goalDiff,
              attackRank: st.attackRank.get(teamId) ?? null,
              defenseRank: st.defenseRank.get(teamId) ?? null,
            }
          : null,
        elo, tsStat: null, xg: buildXg(xgAll),
      });
    }
  }

  return (
    <div className="relative">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            "@context": "https://schema.org",
            "@type": "SportsTeam",
            name: toKoreanTeamName(team.name, team.league),
            alternateName: team.name,
            sport:
              sport === "baseball"
                ? "Baseball"
                : sport === "basketball"
                  ? "Basketball"
                  : sport === "hockey"
                    ? "Ice Hockey"
                    : "Soccer",
            url: `${SITE_URL}/teams/${team.id}`,
            ...(team.logoUrl ? { logo: team.logoUrl } : {}),
            memberOf: { "@type": "SportsOrganization", name: team.league },
          }),
        }}
      />
      <AmbientGlow />
      {/* 헤더 */}
      <section className="relative overflow-hidden border-b border-neutral-200 dark:border-neutral-800">
        <div
          className={`absolute inset-0 -z-10 bg-gradient-to-br ${gradient} opacity-10 dark:opacity-15`}
        />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <div className="flex items-center gap-3 mb-3">
            <Link
              href={`/leagues/${team.league}`}
              className="text-xs text-neutral-500 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-neutral-900 dark:hover:text-white"
            >
              ← {team.league}
            </Link>
          </div>
          <div className="flex items-center gap-4">
            {team.logoUrl &&
              (team.logoUrl.includes("liquipedia.net") ? (
                <Image
                  src={team.logoUrl}
                  alt={team.name}
                  width={64}
                  height={64}
                  className="rounded-md bg-white p-1 shadow-sm"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={team.logoUrl}
                  alt={team.name}
                  width={64}
                  height={64}
                  className="rounded-md bg-white p-1 shadow-sm"
                />
              ))}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <LeagueBadge league={team.league} />
                {team.shortName && (
                  <span className="text-xs text-neutral-500">
                    {team.shortName}
                  </span>
                )}
                {clubRank && (
                  <Link
                    href="/predictions/club-ranking"
                    className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-300 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-amber-200 dark:hover:bg-amber-900/60"
                    title="세계 클럽 랭킹"
                  >
                    <Globe className="h-3 w-3" aria-hidden /> 세계 {clubRank}위
                  </Link>
                )}
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 팀 프로필
              </span>
              <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
                {toKoreanTeamName(team.name, team.league)}
              </h1>
              <div className="text-xs text-neutral-500 mt-1">{team.name}</div>
              <div className="mt-3">
                <FavoriteTeamButton
                  id={team.id}
                  name={toKoreanTeamName(team.name, team.league)}
                  league={team.league}
                />
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-300 break-keep">
                {toKoreanTeamName(team.name, team.league)} {teamIntentKeywords(team.league)} 정보를 실시간 데이터로 정리했습니다. 현재 순위·다음 경기 일정·로스터·AI 승부예측을 아래에서 확인하세요.
              </p>
              {coach && (() => {
                const inner = (
                  <>
                    {coach.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={coach.logo} alt={coachName ?? coach.name} className="w-12 h-12 rounded-full object-cover bg-neutral-100 dark:bg-neutral-800 ring-1 ring-black/5 dark:ring-white/10 shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 grid place-items-center text-lg shrink-0">👔</div>
                    )}
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-neutral-400">{coachRole}</div>
                      <div className="font-bold leading-tight truncate">{coachName}</div>
                      <div className="text-[11px] text-neutral-500 truncate">
                        {[coach.nationality, coach.age ? `${coach.age}세` : null, coach.preferredFormation ? `선호 ${coach.preferredFormation}` : null].filter(Boolean).join(" · ")}
                        {coach.id && <span className="text-rose-600 dark:text-rose-400"> · 프로필 →</span>}
                      </div>
                    </div>
                  </>
                );
                const cls = "mt-4 inline-flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white/70 p-3 pr-4 dark:border-neutral-800 dark:bg-white/[0.04]";
                return coach.id ? (
                  <Link
                    href={`/coaches/${coach.id}`}
                    prefetch={false}
                    className={`${cls} transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-neutral-50 dark:hover:bg-white/[0.06]`}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className={cls}>{inner}</div>
                );
              })()}
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        {/* 팀 소개 — SEO 서술 문단 (홈구장·지난 시즌 성적, 이미 계산된 값 조립) */}
        <TeamAbout
          name={toKoreanTeamName(team.name, team.league)}
          enName={toKoreanTeamName(team.name, team.league) === team.name ? "" : team.name}
          leagueLabel={LEAGUE_DISPLAY[team.league] ?? team.league}
          sportLabel={sportLabel}
          isSoccer={SOCCER_LEAGUES.has(team.league)}
          venue={teamVenue}
          record={row ?? null}
          attackRank={attackRank ?? null}
          defenseRank={defenseRank ?? null}
          seasonLabel={aboutSeasonLabel}
        />

        {/* 역대 우승·명장·레전드 — 위키피디아 사실 기반(data/team-history.json). 데이터 있는 팀만 */}
        {T_HISTORY[String(teamId)] && (
          <TeamHistory data={T_HISTORY[String(teamId)]} teamName={toKoreanTeamName(team.name, team.league)} />
        )}

        {/* 클럽 정보 — 홈구장·창단·스쿼드 (TheSports team/additional+venue) */}
        {teamVenue && (teamVenue.venueName || teamVenue.foundation || teamVenue.totalPlayers) && (
          <section>
            <SectionH title="클럽 정보" icon={<Landmark className="h-5 w-5" aria-hidden />} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {teamVenue.venueName && (
                <Stat label="홈구장" value={venueKo(teamVenue.venueName)!} subtle={[teamVenue.capacity ? `${teamVenue.capacity.toLocaleString()}석` : "", cityKo(teamVenue.city) ?? ""].filter(Boolean).join(" · ")} />
              )}
              {teamVenue.foundation ? <Stat label="창단" value={`${teamVenue.foundation}년`} /> : null}
              {teamVenue.totalPlayers ? (
                <Stat label="선수단" value={`${teamVenue.totalPlayers}명`} subtle={teamVenue.foreignPlayers != null ? `외국인 ${teamVenue.foreignPlayers}명` : undefined} />
              ) : null}
              {squadValueM != null ? (
                <Stat label="스쿼드 가치" value={`€${squadValueM}M`} />
              ) : null}
            </div>
            {teamVenue.website && (
              <a href={teamVenue.website} target="_blank" rel="noopener noreferrer nofollow" className="mt-3 inline-block text-xs text-rose-600 dark:text-rose-400 hover:underline">
                공식 웹사이트 →
              </a>
            )}
          </section>
        )}

        {/* 시즌 통계 + 팀 시즌 통계 + xG 추이 — 시즌 칩으로 접는 패널 (현재 시즌 기본, 과거 시즌 아카이브) */}
        <TeamSeasonPanel seasons={seasonSlices} />

        {/* 폼 + Streak + 홈/원정 */}
        <section className="grid sm:grid-cols-3 gap-4">
          <Card title="최근 5경기 폼">
            {recentForm.results.length > 0 ? (
              <div className="space-y-2">
                <FormDots results={recentForm.results} />
                <div className="text-xs text-neutral-500 tabular-nums">
                  {recentForm.wins}승 {recentForm.draws}무 {recentForm.losses}패
                </div>
              </div>
            ) : (
              <div className="text-xs text-neutral-500">데이터 없음</div>
            )}
          </Card>
          <Card title="흐름 (Streak)">
            <StreakDisplay streak={streak} />
          </Card>
          <Card title="홈/원정 분리">
            <div className="space-y-1.5 text-sm">
              <div>
                🏠 <span className="font-semibold">{ha.home.wins}승 {ha.home.draws}무 {ha.home.losses}패</span>
                <span className="text-xs text-neutral-500 ml-2">경기당 {ha.home.ppg.toFixed(2)}점</span>
              </div>
              <div>
                ✈ <span className="font-semibold">{ha.away.wins}승 {ha.away.draws}무 {ha.away.losses}패</span>
                <span className="text-xs text-neutral-500 ml-2">경기당 {ha.away.ppg.toFixed(2)}점</span>
              </div>
            </div>
          </Card>
        </section>

        {/* 팀 시즌 통계·xG 추이 — 위 TeamSeasonPanel 로 이동 (시즌별 아카이브 열람) */}


        {/* TheSports 선수단 — 이름 클릭 → 이적시장 상세(/transfers) */}
        {squad.length > 0 && (
          <section>
            <SectionH title="선수단" subtitle={`시장가치순 · ${squad.length}명 · 클릭 시 상세`} icon={<Users className="h-5 w-5" aria-hidden />} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {squad.map((p) => (
                <Link
                  key={p.id}
                  href={`/transfers/${p.id}`}
                  className="flex items-center gap-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-2 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
                    {p.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photo} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-neutral-500">{p.name.slice(0, 1)}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate flex items-center gap-1">
                      {p.name}
                      {p.flag && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.flag} alt="" className="w-3.5 h-2.5 object-cover rounded-[1px] shrink-0" />
                      )}
                    </div>
                    <div className="text-[11px] text-neutral-500 tabular-nums">{p.number ? `#${p.number} · ` : ""}{p.pos ? `${p.pos} · ` : ""}€{p.value}M</div>
                  </div>
                </Link>
              ))}
            </div>
            <Link
              href={`/transfers?view=team&team=${team.id}`}
              className="mt-3 flex items-center justify-center gap-1 rounded-xl border border-neutral-200 dark:border-neutral-800 px-4 py-2.5 text-sm font-bold text-rose-600 dark:text-rose-400 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
            >
              스쿼드 몸값 랭킹 · 시장가치 Best XI 전체보기 →
            </Link>
          </section>
        )}

        {/* NHL 로스터 — NHL 공식 API(nhlId), 클릭 → 선수 상세(/players/{id}?league=NHL) */}
        {nhlRoster.length > 0 && (
          <section>
            <SectionH title="🏒 로스터" subtitle={`${nhlRoster.length}명 · NHL 공식 · 클릭 시 상세`} />
            {([["F", "공격수"], ["D", "수비수"], ["G", "골리"]] as const).map(([g, label]) => {
              const ps = nhlRoster.filter((p) => p.group === g);
              if (!ps.length) return null;
              return (
                <div key={g} className="mb-3">
                  <h3 className="text-xs font-bold text-neutral-400 mb-2">{label} ({ps.length})</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ps.map((p) => (
                      <Link
                        key={p.id}
                        href={`/players/${p.id}?league=NHL`}
                        className="flex items-center gap-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-2 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
                      >
                        <div className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
                          {p.headshot ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.headshot} alt={p.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs font-bold text-neutral-500">{p.name.slice(0, 1)}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate">{toKoreanPlayerName(p.name) || p.name}</div>
                          <div className="text-[11px] text-neutral-500 tabular-nums">{p.number ? `#${p.number} · ` : ""}{p.position}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* MLB 로스터 — MLB Stats API(mlbStatsId), 클릭 → 선수 상세(/players/{id}?league=MLB) */}
        {mlbRoster.length > 0 && (
          <section>
            <SectionH title="⚾ 로스터" subtitle={`${mlbRoster.length}명 · MLB 공식 · 클릭 시 상세`} />
            {([["P", "투수"], ["C", "포수"], ["IF", "내야수"], ["OF", "외야수"]] as const).map(([g, label]) => {
              const ps = mlbRoster.filter((p) => p.group === g);
              if (!ps.length) return null;
              return (
                <div key={g} className="mb-3">
                  <h3 className="text-xs font-bold text-neutral-400 mb-2">{label} ({ps.length})</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ps.map((p) => (
                      <Link
                        key={p.id}
                        href={`/players/${p.id}?league=MLB`}
                        className="flex items-center gap-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-2 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
                      >
                        <div className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`https://img.mlbstatic.com/mlb-photos/image/upload/w_120,q_auto/v1/people/${p.id}/headshot/67/current`} alt={p.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate">{toKoreanPlayerName(p.name) || p.name}</div>
                          <div className="text-[11px] text-neutral-500 tabular-nums">{p.number ? `#${p.number} · ` : ""}{p.position}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* KBO·NPB 로스터 — koreabaseball·npb scrape(build-baseball-rosters), 클릭 → /players/{pid}?league= */}
        {baseballRoster.length > 0 && (
          <section>
            <SectionH title="⚾ 로스터" subtitle={`${baseballRoster.length}명 · ${team.league} 공식 · 클릭 시 상세`} />
            {([["P", "투수"], ["B", "야수"]] as const).map(([g, label]) => {
              const ps = baseballRoster.filter((p) => p.group === g);
              if (!ps.length) return null;
              return (
                <div key={g} className="mb-3">
                  <h3 className="text-xs font-bold text-neutral-400 mb-2">{label} ({ps.length})</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ps.map((p) => {
                      // NPB 로스터는 한자·가타카나 원문 → 카나 사전으로 한글 음역 (미보유는 원문)
                      const nameKo = team.league === "NPB" ? npbPlayerKo(p.id, p.name) : p.name;
                      const photo =
                        team.league === "NPB" ? npbPlayerPhoto(p.id) : team.league === "KBO" ? kboPhotoUrl(p.id) : undefined;
                      return (
                      <Link
                        key={p.id}
                        href={`/players/${p.id}?league=${team.league}`}
                        className="flex items-center gap-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-2 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
                      >
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={photo}
                            alt={nameKo}
                            width={36}
                            height={36}
                            loading="lazy"
                            className="w-9 h-9 rounded-full object-cover bg-neutral-100 dark:bg-neutral-800 shrink-0 ring-1 ring-black/5 dark:ring-white/10"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0 flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
                            <span className="text-xs font-bold text-neutral-500">{nameKo.slice(0, 1)}</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate">{nameKo}</div>
                        </div>
                      </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* NBA 로스터 — nba-players.json(ESPN 30팀 로스터), 클릭 → 선수 상세(/players/{bdlId}?league=NBA) */}
        {nbaRoster.length > 0 && (
          <section>
            <SectionH title="🏀 로스터" subtitle={`${nbaRoster.length}명 · ESPN · 클릭 시 상세`} />
            {([["G", "가드"], ["F", "포워드"], ["C", "센터"]] as const).map(([g, label]) => {
              const ps = nbaRoster.filter((p) => nbaPosGroup(p.pos) === g);
              if (!ps.length) return null;
              return (
                <div key={g} className="mb-3">
                  <h3 className="text-xs font-bold text-neutral-400 mb-2">{label} ({ps.length})</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {ps.map((p) => {
                      const inner = (
                        <>
                          <div className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
                            {p.photo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.photo} alt={p.ko} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs font-bold text-neutral-500">{p.ko.slice(0, 1)}</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-sm truncate">{p.ko}</div>
                            <div className="text-[11px] text-neutral-500 tabular-nums">{p.number ? `#${p.number} · ` : ""}{p.pos}</div>
                          </div>
                        </>
                      );
                      const base = "flex items-center gap-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-2";
                      return p.bdlId != null ? (
                        <Link
                          key={p.espnId}
                          href={`/players/${p.bdlId}?league=NBA`}
                          className={`${base} transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-neutral-50 dark:hover:bg-white/[0.06]`}
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div key={p.espnId} className={base}>
                          {inner}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* LOL 로스터 + 팀 통계 — lolGames 집계(선수 KDA·승률)·lol-players(사진) */}
        {team.league === "LOL" && <LolTeamRoster teamId={team.id} />}

        {/* 부상·결장 명단 바로가기(정확한 통합 소스 = /injuries) + 핵심 선수 */}
        {(INJURY_LEAGUES.has(team.league) || keyPlayers.length > 0) && (
          <section className="grid md:grid-cols-2 gap-5">
            {INJURY_LEAGUES.has(team.league) && (
              <div>
                <SectionH title="부상·결장 명단" icon={<HeartPulse className="h-5 w-5" aria-hidden />} />
                <Link
                  href={`/injuries/${team.league}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 px-4 py-4 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{toKoreanTeamName(team.name, team.league)} 부상·결장 명단 보기</span>
                    <span className="block text-xs text-neutral-500 mt-0.5">실시간 통합 집계 페이지에서 팀별로 확인</span>
                  </span>
                  <span className="text-neutral-400 shrink-0">→</span>
                </Link>
              </div>
            )}
            {keyPlayers.length > 0 && (
              <div>
                <SectionH
                  title="시즌 핵심 선수"
                  subtitle="시즌 득점·도움 누적 Top"
                  icon={<Star className="h-5 w-5" aria-hidden />}
                />
                <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50 dark:bg-white/[0.03] text-xs text-neutral-500">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">선수</th>
                        <th className="px-2 py-2 font-medium"><Goal className="ml-auto h-4 w-4" aria-label="득점" /></th>
                        <th className="px-2 py-2 font-medium"><Target className="ml-auto h-4 w-4" aria-label="도움" /></th>
                        <th className="text-right px-4 py-2 font-medium">출전</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                      {keyPlayers.map((p) => (
                        <tr key={p.playerId}>
                          <td className="px-4 py-2.5 font-medium">
                            <Link
                              href={`/players/${p.playerId}?league=${team.league}`}
                              prefetch={false}
                              className="flex items-center gap-2 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              {p.photoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={p.photoUrl}
                                  alt=""
                                  loading="lazy"
                                  className="w-7 h-7 rounded-full object-cover bg-neutral-100 dark:bg-neutral-800 shrink-0"
                                />
                              ) : (
                                <span className="w-7 h-7 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0" />
                              )}
                              {koName(p.playerId, p.playerName)}
                            </Link>
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums font-bold">
                            {p.goals}
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums text-neutral-500">
                            {p.assists}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-neutral-500">
                            {p.appearances}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* 선발 라인업 — 이 팀 쪽 lineup 이 있는 가장 최근 매치 (경기 전 도착분 우선) */}
        {recentLineup && lineupPlayers.length === 11 && (
          <section>
            <SectionH
              title="선발 라인업"
              subtitle={`${recentLineup.dateLabel} vs ${recentLineup.oppKo}${recentLineup.formation ? ` · ${recentLineup.formation}` : ""}${recentLineup.finished ? "" : " · 경기 전 발표"}`}
              icon={<Shirt className="h-5 w-5" aria-hidden />}
            />
            <TeamRecentLineup formation={recentLineup.formation} players={lineupPlayers} />
          </section>
        )}

        {/* 다가오는 경기 */}
        {upcoming.length > 0 && (
          <section>
            <SectionH title="다가오는 경기" subtitle="다음 5경기" />
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {upcoming.map((m) => {
                    const isHome = m.homeTeamId === teamId;
                    const opp = isHome ? m.awayTeam : m.homeTeam;
                    const homeElo = getElo(eloTable, m.homeTeamId);
                    const awayElo = getElo(eloTable, m.awayTeamId);
                    const wp = calcWinProbability(homeElo, awayElo, m.league);
                    const myProb = isHome ? wp.home : wp.away;
                    return (
                      <tr key={m.id} className="transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                        <td className="px-4 py-3 text-xs text-neutral-500 tabular-nums w-32">
                          {m.startTime.toLocaleString("ko-KR", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Asia/Seoul",
                          })}
                        </td>
                        <td className="px-2 py-3 text-xs">
                          <span className="text-neutral-400">{isHome ? "🏠 vs" : "✈ at"}</span>
                        </td>
                        <td className="px-2 py-3 font-medium">
                          <Link
                            href={`/teams/${opp.id}`}
                            className="inline-flex items-center gap-2 hover:underline"
                          >
                            <OppLogo src={opp.logoUrl} name={opp.name} />
                            <span className="truncate">{toKoreanTeamName(opp.name, m.league)}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right text-xs whitespace-nowrap">
                          <span className="text-neutral-500">승률 추정 </span>
                          <strong>{Math.round(myProb * 100)}%</strong>
                          {/* 경기 상세(프리뷰·배당·라인업) 링크 — 최근 경기와 동일 아이콘 */}
                          <Link
                            href={matchLiveHref(m.league, m.externalId)}
                            aria-label="경기 상세 — 프리뷰·배당·라인업"
                            title="경기 상세 — 프리뷰·배당·라인업"
                            className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-md align-middle text-neutral-400 hover:bg-neutral-100 hover:text-rose-600 dark:hover:bg-white/[0.08] dark:hover:text-rose-400 transition"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
                            </svg>
                          </Link>
                          <Link
                            href={`/teams/${teamId}/vs/${opp.id}`}
                            className="ml-2 text-rose-600 dark:text-rose-400 hover:underline"
                          >
                            상대전적
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 최근 경기 */}
        {recentMatches.length > 0 && (
          <section>
            <SectionH title="최근 경기" subtitle="최근 5경기 결과" />
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {recentMatches.map((m) => {
                    const isHome = m.homeTeamId === teamId;
                    const opp = isHome ? m.awayTeam : m.homeTeam;
                    const myScore = isHome ? m.homeScore : m.awayScore;
                    const oppScore = isHome ? m.awayScore : m.homeScore;
                    const result =
                      myScore != null && oppScore != null
                        ? myScore > oppScore
                          ? "W"
                          : myScore < oppScore
                            ? "L"
                            : "D"
                        : null;
                    const resColor: Record<string, string> = {
                      W: "text-emerald-600 dark:text-emerald-400",
                      D: "text-neutral-500",
                      L: "text-rose-600 dark:text-rose-400",
                    };
                    return (
                      <tr key={m.id} className="transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                        <td className="px-4 py-3 text-xs text-neutral-500 tabular-nums w-24">
                          {m.startTime.toISOString().slice(0, 10)}
                        </td>
                        <td className="px-2 py-3 text-xs">
                          <span className="text-neutral-400">{isHome ? "🏠" : "✈"}</span>
                        </td>
                        <td className="px-2 py-3 font-medium">
                          <Link
                            href={`/teams/${opp.id}`}
                            className="inline-flex items-center gap-2 hover:underline"
                          >
                            <OppLogo src={opp.logoUrl} name={opp.name} />
                            <span className="truncate">{toKoreanTeamName(opp.name, m.league)}</span>
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold">
                          {myScore} : {oppScore}
                        </td>
                        <td
                          className={`px-3 py-3 text-right text-xs font-bold w-10 ${result ? resColor[result] : ""}`}
                        >
                          {result ?? "-"}
                        </td>
                        <td className="px-1 py-3 text-center text-xs w-9">
                          {/* 경기 상세(라이브스코어 페이지) 링크 — 2026-08-27 사용자 요청 */}
                          <Link
                            href={matchLiveHref(m.league, m.externalId)}
                            aria-label="경기 상세 — 기록·통계·리포트"
                            title="경기 상세 — 기록·통계·리포트"
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-rose-600 dark:hover:bg-white/[0.08] dark:hover:text-rose-400 transition"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
                            </svg>
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-right text-xs w-20">
                          <Link
                            href={`/teams/${teamId}/vs/${opp.id}`}
                            className="text-rose-600 dark:text-rose-400 hover:underline whitespace-nowrap"
                          >
                            상대전적
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 최근 이적 (api-football 지원 리그만, client-side fetch 1시간 캐시) */}
        <TransfersSection teamId={team.id} />

        {/* 관련 기사 */}
        {articles.length > 0 && (
          <section>
            <SectionH
              title="관련 기사"
              subtitle={`${toKoreanTeamName(team.name, team.league)}이(가) 등장한 최근 기사`}
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {articles.map((a) => (
                <ArticleCard key={a.id} article={a} variant="compact" />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ESPN NBA 포지션 약어(G/F/C/PF) → 3그룹. PF·기타는 포워드로.
function nbaPosGroup(pos: string | null): "G" | "F" | "C" {
  if (pos === "G") return "G";
  if (pos === "C") return "C";
  return "F";
}

function OppLogo({
  src,
  name,
}: {
  src?: string | null;
  name: string;
}) {
  if (!src) {
    return (
      <span
        aria-hidden
        className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-[9px] font-bold text-neutral-500"
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  if (src.includes("liquipedia.net")) {
    return (
      <Image
        src={src}
        alt=""
        width={20}
        height={20}
        className="w-5 h-5 object-contain shrink-0"
      />
    );
  }
  if (src.includes("thesports.com") || src.includes("media.api-sports.io")) {
    return <Image src={src} alt="" width={20} height={20} className="w-5 h-5 object-contain shrink-0" />;
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt=""
      className="w-5 h-5 object-contain shrink-0"
      loading="lazy"
    />
  );
}

function SectionH({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800 pb-3 mb-5">
      <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight break-keep">
        {icon && <span className="text-rose-500" aria-hidden>{icon}</span>}
        {title}
      </h2>
      {subtitle && (
        <p className="text-xs text-neutral-500 mt-0.5 break-keep">{subtitle}</p>
      )}
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
        {title}
      </div>
      {children}
    </div>
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
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
      <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-black tabular-nums">{value}</div>
      {subtle && (
        <div className="mt-0.5 text-[11px] text-neutral-500">{subtle}</div>
      )}
    </div>
  );
}

function StreakDisplay({
  streak,
}: {
  streak: {
    unbeatenRun: number;
    winningRun: number;
    losingRun: number;
    cleanSheetsLast5: number;
    failedToScoreLast5: number;
  };
}) {
  let main: { tone: "good" | "bad" | "neutral"; text: string } = {
    tone: "neutral",
    text: "특이 흐름 없음",
  };
  if (streak.winningRun >= 2) {
    main = { tone: "good", text: `${streak.winningRun}연승 중` };
  } else if (streak.unbeatenRun >= 3) {
    main = { tone: "good", text: `${streak.unbeatenRun}경기 무패` };
  } else if (streak.losingRun >= 2) {
    main = { tone: "bad", text: `${streak.losingRun}연패 중` };
  }
  const tone =
    main.tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : main.tone === "bad"
        ? "text-rose-600 dark:text-rose-400"
        : "text-neutral-500";
  return (
    <div>
      <div className={`text-base font-bold ${tone}`}>{main.text}</div>
      <div className="mt-1 text-xs text-neutral-500 space-y-0.5">
        <div>최근 5경기 클린시트 {streak.cleanSheetsLast5}</div>
        <div>최근 5경기 무득점 {streak.failedToScoreLast5}</div>
      </div>
    </div>
  );
}
