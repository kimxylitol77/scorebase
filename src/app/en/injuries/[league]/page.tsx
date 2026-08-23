// /en/injuries/[league] — 리그별 부상자 명단 (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import { prisma } from "@/lib/db";
import { unstable_cache } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import LeagueBadge from "@/components/en/LeagueBadge";
import AmbientGlow from "@/components/AmbientGlow";
import { Clock, CheckCircle2 } from "lucide-react";
import { toEnglishTeamName, enLeagueName } from "@/lib/i18n/en";
import { EN_INJURY_LEAGUE_SET, koEnLanguages } from "@/lib/i18n/en";
import { resolvePlayerNames } from "@/lib/players/resolvePlayerName";
import { assertSportConsistency } from "@/lib/players/sanityCheck";
import { calcStandings } from "@/lib/predict/standings";
import type { PredictMatch } from "@/lib/predict/types";
import {
  fetchSeasonInjuries,
  filterInjuriesToCurrentSquad,
  getApiFootballSeason,
  getTeamInjuries,
  API_FOOTBALL_LEAGUE_ID,
  type InjuryEntry,
} from "@/lib/sports/api-football-pro";
import {
  fetchEspnInjuries,
  getTeamEspnInjuries,
} from "@/lib/sports/espn-injuries";
import { fetchBalldontlieInjuries } from "@/lib/sports/balldontlie";
import {
  fetchKboInjuries,
  getTeamKboInjuries,
  type KboInjury,
} from "@/lib/sports/kbo-injuries";
import {
  getTeamNpbInjuries,
  type NpbInjuryEntry,
} from "@/lib/sports/npb-injuries";
import {
  fetchActiveNpbInjuriesCached,
  enrichNpbInjuriesWithKoreanCached,
} from "@/lib/sports/npb-cache";
import { jpPitcherToKorean } from "@/lib/sports/npb-starters";
import { getTheSportsInjuriesByTeam, type TSInjuryRaw } from "@/lib/sports/thesports/injuries";
import { NATIONAL_TEAM_LEAGUES, fifaFlag } from "@/lib/sports/fifa-rankings";
import { translateReason, classifySeverity, SEVERITY_META, type Severity } from "@/lib/sports/injury-format";
import { jsonLdScript } from "@/lib/seo/jsonld";

function classifyKboDuration(
  duration: string,
  type: string, // 영어판 — KBO 소스 타입(한글 리터럴)을 그대로 받도록 넓힌다
): "long" | "short" | "returning" {
  if (type === "Treatment & rehab list") return "returning";
  const m = duration.match(/(\d+)/);
  if (!m) return "short";
  const days = Number(m[1]);
  if (days >= 30) return "long";
  return "short";
}

function npbInjuryDisplayName(jpFullName: string): string {
  const tokens = jpFullName.split(/[\s　]+/).filter(Boolean);
  if (tokens.length === 0) return jpFullName;
  const ko = jpPitcherToKorean(tokens[0]);
  if (ko === tokens[0]) return jpFullName;
  return tokens.length > 1 ? `${ko} ${tokens.slice(1).join(" ")}` : ko;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

// af /injuries 호출을 전 인스턴스 공유 캐시로 — 페이지가 force-dynamic 이라 렌더마다
// (metadata+본문 2회) af 를 부르던 것을 15분 1회로 제한. af 일 한도 소진 지혈의 일부.
const fetchSeasonInjuriesCached = unstable_cache(
  fetchSeasonInjuries,
  ["injuries-page-af-season"],
  { revalidate: 900 },
);

// UCL 은 소속 리그(EPL/라리가/...)와 중복이라 제외
const VALID = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS",
  "NBA", "MLB", "NHL", "KBO", "NPB",
  // 2026-05-21 추가 — api-football 부상자 endpoint cover
  "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE", "AFC_CL", "SAUDI_PL",
  // 국가대표 통합 — NATIONAL_TEAM_LEAGUES(월드컵·예선·네이션스리그·친선 등) 팀 부상자 집계
  "NATIONAL",
  // 2026-08 추가 — ts lineup.injury 가 이미 들어오는데 페이지가 없어 못 보던 리그.
  //  최근 60일 부상 기록 실측: 프랑스2부 121 · 독일2부 66 · 네덜란드 55 · 스코틀랜드 78.
  //  챔피언십·포르투갈·터키는 시즌 초라 표본이 작지만 경기가 쌓이면 채워진다.
  "CHAMPIONSHIP", "LIGUE_2", "BUNDESLIGA_2", "EREDIVISIE", "SPL", "PRIMEIRA_LIGA", "SUPER_LIG",
  // 야구·농구·하키는 ts lineup.injury 가 전혀 안 와서 전용 소스가 있어야 한다. 전수 확인 결과
  //  추가 가능한 건 WNBA 뿐 — ESPN 이 13팀·44명을 준다. 대만 CPBL·멕시코 LMB·호주 AIHL·
  //  뉴질랜드 NZIHL·WKBL 은 ESPN 경로가 없고(400) 다른 소스도 없다.
  "WNBA",
] as const;
type Lg = (typeof VALID)[number];
const SOCCER: Lg[] = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS",
  "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE", "AFC_CL", "SAUDI_PL",
  "NATIONAL",
  "CHAMPIONSHIP", "LIGUE_2", "BUNDESLIGA_2", "EREDIVISIE", "SPL", "PRIMEIRA_LIGA", "SUPER_LIG",
];
// 리그 탭 그룹 — 종목 먼저, 그 안에서 규모·관심도 순. 축구는 빅5 → 유럽 2·중견 → 아시아 → 국대.
const SPORT_GROUPS: { label: string; leagues: Lg[] }[] = [
  {
    label: "Football",
    leagues: [
      "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1",
      "CHAMPIONSHIP", "BUNDESLIGA_2", "LIGUE_2", "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "SPL",
      "MLS", "SAUDI_PL", "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE", "AFC_CL",
      "NATIONAL",
    ],
  },
  { label: "Baseball", leagues: ["MLB", "KBO", "NPB"] },
  { label: "Basketball", leagues: ["NBA", "WNBA"] },
  { label: "Hockey", leagues: ["NHL"] },
];

const ESPN_LEAGUES: Lg[] = ["NBA", "MLB", "NHL", "WNBA"];
const ASIAN_BB: Lg[] = ["KBO", "NPB"];

const CANONICAL = "https://www.scorebase.kr";

interface LeagueMeta {
  krFull: string;
  krShort: string;
  enFull: string;
  /** 리그별 SEO 키워드 + 스타 선수 키워드 (부상 검색 패턴) */
  starKeywords: string[];
}

const LEAGUE_META: Record<Lg, LeagueMeta> = {
  NATIONAL: {
    krFull: "National Teams",
    krShort: "National Teams",
    enFull: "National Teams",
    starKeywords: ["National Teams injuries", "National Teams injury list", "National Teams injury report"],
  },
  EPL: {
    krFull: "English Premier League",
    krShort: "English Premier League",
    enFull: "English Premier League",
    starKeywords: ["English Premier League injuries", "English Premier League injury list", "English Premier League injury report"],
  },
  LALIGA: {
    krFull: "La Liga",
    krShort: "La Liga",
    enFull: "La Liga",
    starKeywords: ["La Liga injuries", "La Liga injury list", "La Liga injury report"],
  },
  BUNDESLIGA: {
    krFull: "Bundesliga",
    krShort: "Bundesliga",
    enFull: "Bundesliga",
    starKeywords: ["Bundesliga injuries", "Bundesliga injury list", "Bundesliga injury report"],
  },
  SERIE_A: {
    krFull: "Serie A",
    krShort: "Serie A",
    enFull: "Serie A",
    starKeywords: ["Serie A injuries", "Serie A injury list", "Serie A injury report"],
  },
  LIGUE_1: {
    krFull: "Ligue 1",
    krShort: "Ligue 1",
    enFull: "Ligue 1",
    starKeywords: ["Ligue 1 injuries", "Ligue 1 injury list", "Ligue 1 injury report"],
  },
  MLS: {
    krFull: "Major League Soccer",
    krShort: "Major League Soccer",
    enFull: "Major League Soccer",
    starKeywords: ["Major League Soccer injuries", "Major League Soccer injury list", "Major League Soccer injury report"],
  },
  NBA: {
    krFull: "National Basketball Association",
    krShort: "National Basketball Association",
    enFull: "National Basketball Association",
    starKeywords: ["National Basketball Association injuries", "National Basketball Association injury list", "National Basketball Association injury report"],
  },
  MLB: {
    krFull: "Major League Baseball",
    krShort: "Major League Baseball",
    enFull: "Major League Baseball",
    starKeywords: ["Major League Baseball injuries", "Major League Baseball injury list", "Major League Baseball injury report"],
  },
  NHL: {
    krFull: "National Hockey League",
    krShort: "National Hockey League",
    enFull: "National Hockey League",
    starKeywords: ["National Hockey League injuries", "National Hockey League injury list", "National Hockey League injury report"],
  },
  KBO: {
    krFull: "Korea Baseball Organization",
    krShort: "Korea Baseball Organization",
    enFull: "Korea Baseball Organization",
    starKeywords: ["Korea Baseball Organization injuries", "Korea Baseball Organization injury list", "Korea Baseball Organization injury report"],
  },
  NPB: {
    krFull: "Nippon Professional Baseball",
    krShort: "Nippon Professional Baseball",
    enFull: "Nippon Professional Baseball",
    starKeywords: ["Nippon Professional Baseball injuries", "Nippon Professional Baseball injury list", "Nippon Professional Baseball injury report"],
  },
  K_LEAGUE_1: {
    krFull: "K League 1",
    krShort: "K League 1",
    enFull: "K League 1",
    starKeywords: ["K League 1 injuries", "K League 1 injury list", "K League 1 injury report"],
  },
  K_LEAGUE_2: {
    krFull: "K League 2",
    krShort: "K League 2",
    enFull: "K League 2",
    starKeywords: ["K League 2 injuries", "K League 2 injury list", "K League 2 injury report"],
  },
  J1_LEAGUE: {
    krFull: "J1 League",
    krShort: "J1 League",
    enFull: "J1 League",
    starKeywords: ["J1 League injuries", "J1 League injury list", "J1 League injury report"],
  },
  J2_LEAGUE: {
    krFull: "J2 League",
    krShort: "J2 League",
    enFull: "J2 League",
    starKeywords: ["J2 League injuries", "J2 League injury list", "J2 League injury report"],
  },
  AFC_CL: {
    krFull: "AFC Champions League Elite",
    krShort: "AFC Champions League Elite",
    enFull: "AFC Champions League Elite",
    starKeywords: ["AFC Champions League Elite injuries", "AFC Champions League Elite injury list", "AFC Champions League Elite injury report"],
  },
  SAUDI_PL: {
    krFull: "Saudi Pro League",
    // "SPL" 은 스코틀랜드 리그 코드와 겹친다 — 탭에 SPL 이 둘 보여 헷갈린다.
    krShort: "Saudi Pro League",
    enFull: "Saudi Pro League",
    starKeywords: ["Saudi Pro League injuries", "Saudi Pro League injury list", "Saudi Pro League injury report"],
  },
  // 2026-08 추가분. 한국 선수 키워드는 짐작이 아니라 korea-abroad.json 실측 소속이다.
  CHAMPIONSHIP: {
    krFull: "EFL Championship",
    krShort: "EFL Championship",
    enFull: "EFL Championship",
    starKeywords: ["EFL Championship injuries", "EFL Championship injury list", "EFL Championship injury report"],
  },
  LIGUE_2: {
    krFull: "French Ligue 2",
    krShort: "French Ligue 2",
    enFull: "French Ligue 2",
    starKeywords: ["French Ligue 2 injuries", "French Ligue 2 injury list", "French Ligue 2 injury report"],
  },
  BUNDESLIGA_2: {
    krFull: "German 2. Bundesliga",
    krShort: "German 2. Bundesliga",
    enFull: "German 2. Bundesliga",
    starKeywords: ["German 2. Bundesliga injuries", "German 2. Bundesliga injury list", "German 2. Bundesliga injury report"],
  },
  EREDIVISIE: {
    krFull: "Dutch Eredivisie",
    krShort: "Dutch Eredivisie",
    enFull: "Dutch Eredivisie",
    starKeywords: ["Dutch Eredivisie injuries", "Dutch Eredivisie injury list", "Dutch Eredivisie injury report"],
  },
  SPL: {
    krFull: "Scottish Premiership",
    krShort: "Scottish Premiership",
    enFull: "Scottish Premiership",
    starKeywords: ["Scottish Premiership injuries", "Scottish Premiership injury list", "Scottish Premiership injury report"],
  },
  PRIMEIRA_LIGA: {
    krFull: "Portuguese Primeira Liga",
    krShort: "Portuguese Primeira Liga",
    enFull: "Portuguese Primeira Liga",
    starKeywords: ["Portuguese Primeira Liga injuries", "Portuguese Primeira Liga injury list", "Portuguese Primeira Liga injury report"],
  },
  WNBA: {
    krFull: "Women's National Basketball Association",
    krShort: "Women's National Basketball Association",
    enFull: "Women's National Basketball Association",
    starKeywords: ["Women's National Basketball Association injuries", "Women's National Basketball Association injury list", "Women's National Basketball Association injury report"],
  },
  SUPER_LIG: {
    krFull: "Turkish Süper Lig",
    krShort: "Turkish Süper Lig",
    enFull: "Turkish Süper Lig",
    starKeywords: ["Turkish Süper Lig injuries", "Turkish Süper Lig injury list", "Turkish Süper Lig injury report"],
  },
};


interface EnrichedInjury {
  playerId: number;
  playerName: string;
  reasonKo: string;
  reasonRaw: string;
  severity: Severity;
  /** BALLDONTLIE NBA — 부상 상세 설명 */
  description?: string;
  /** BALLDONTLIE NBA — 예상 복귀일 */
  returnDate?: string;
}

interface Props {
  params: Promise<{ league: string }>;
  searchParams: Promise<{ q?: string; severity?: string; sort?: string }>;
}

// 유스 연령별 대표팀(U17·U20·U23·올림픽 등) 판별 — 국가대표(성인) 부상자에서 제외.
const YOUTH_NT = /\bU-?\d{2}\b|olympic|올림픽/i;

// 리그별 팀 조회 — NATIONAL 은 국가대표 대회(NATIONAL_TEAM_LEAGUES) 팀을 모아
// 유스 연령별팀 제외 + 이름 기준 dedup.
async function getInjuryTeams(upper: Lg) {
  if (upper === "NATIONAL") {
    const rows = await prisma.team.findMany({
      where: { league: { in: [...NATIONAL_TEAM_LEAGUES] } },
      orderBy: { name: "asc" },
    });
    const seen = new Set<string>();
    return rows.filter((t) => {
      if (YOUTH_NT.test(t.name)) return false;
      const k = t.name.trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  // Team.league 라벨은 승격·강등을 늦게 따라온다 — 그대로 쓰면 강등팀 부상자가 이 리그
  //  명단에 남는다 (2026-08 실측: EPL 23팀 중 울버햄프턴·번리·웨스트햄이 다음 시즌
  //  챔피언십, 분데스 23팀 중 8팀 잔존, J2 40팀 중 20팀은 J3). 라벨 대신 이번 시즌
  //  일정에 실제로 편성된 팀을 쓴다 — 승격팀도 라벨이 아직 안 붙었어도 자동으로 잡힌다.
  const upcoming = await prisma.match.findMany({
    where: { league: upper, startTime: { gte: new Date() } },
    select: { homeTeamId: true, awayTeamId: true },
    take: 600,
  });
  const scheduled = new Set<number>();
  for (const m of upcoming) {
    if (m.homeTeamId != null) scheduled.add(m.homeTeamId);
    if (m.awayTeamId != null) scheduled.add(m.awayTeamId);
  }
  // 일정이 아직 안 들어온 대회(컵·비시즌)는 판단 근거가 없으니 라벨로 폴백한다.
  if (scheduled.size >= 8) {
    return prisma.team.findMany({ where: { id: { in: [...scheduled] } }, orderBy: { name: "asc" } });
  }

  // 라벨 폴백 경로 — 올스타·프리시즌 상대·플레이스홀더가 섞여 있다.
  //  2026-08 실측: MLB 32팀에 "American/National All-Stars", NBA 39팀에 Team Stars·
  //  Team Stripes·World(라이징스타)·TBD 2개·광저우·하포엘·멜버른 2개.
  //  이름 목록으로 거르면 새 이벤트가 생길 때마다 놓치므로 정규 경기 수로 판정한다 —
  //  정규팀은 그 리그에서 수십~수백 경기, 이벤트 팀은 1~2경기다.
  const rows = await prisma.team.findMany({ where: { league: upper }, orderBy: { name: "asc" } });
  if (rows.length < 8) return rows;
  const counts = await prisma.match.groupBy({
    by: ["homeTeamId"],
    where: { league: upper, homeTeamId: { in: rows.map((t) => t.id) } },
    _count: true,
  });
  const away = await prisma.match.groupBy({
    by: ["awayTeamId"],
    where: { league: upper, awayTeamId: { in: rows.map((t) => t.id) } },
    _count: true,
  });
  const played = new Map<number, number>();
  for (const c of counts) played.set(c.homeTeamId, (played.get(c.homeTeamId) ?? 0) + c._count);
  for (const c of away) played.set(c.awayTeamId, (played.get(c.awayTeamId) ?? 0) + c._count);
  const sorted = [...rows.map((t) => played.get(t.id) ?? 0)].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  if (median < 10) return rows; // 표본이 얕은 리그는 판정하지 않는다
  return rows.filter((t) => (played.get(t.id) ?? 0) >= median * 0.1);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league } = await params;
  const upper = league.toUpperCase() as Lg;
  if (!VALID.includes(upper)) return { title: "Injury list" };
  const lm = LEAGUE_META[upper];

  // 빠른 통계 fetch (description 에 수치 포함)
  let totalInjuries = 0;
  let topTeam: { name: string; count: number } | null = null;
  let fullSquadCount = 0;
  let soccerSource = "api-football Pro";
  try {
    const teams = await getInjuryTeams(upper);
    const isEspn = ESPN_LEAGUES.includes(upper);
    const isSoccer = SOCCER.includes(upper);
    let teamLists: Array<{ teamName: string; count: number }> = [];

    if (isSoccer) {
      // 본문과 동일 — TheSports 1순위 + cache 없는 팀만 api-football 보강
      const tsInj = await getTheSportsInjuriesByTeam(teams.map((t) => t.id));
      const needAf = !!API_FOOTBALL_LEAGUE_ID[upper] && teams.some((t) => !tsInj.has(t.id));
      let all = needAf && process.env.API_FOOTBALL_KEY && API_FOOTBALL_LEAGUE_ID[upper] && teams.length > 0
        ? await fetchSeasonInjuriesCached(upper, getApiFootballSeason(new Date(), upper))
        : [];
      // 본문과 동일 — 현재 스쿼드에 없는 이적/방출 선수 제거 (제목·설명 수치 일치)
      if (all.length > 0) all = await filterInjuriesToCurrentSquad(all);
      teamLists = teams.map((t) => {
        const ts = tsInj.get(t.id);
        return { teamName: t.name, count: ts ? ts.length : getTeamInjuries(all, t.name, undefined, 30).length };
      });
      soccerSource = tsInj.size > 0 ? (needAf ? "TheSports + api-football" : "TheSports") : "api-football Pro";
    } else if (isEspn) {
      const all = await fetchEspnInjuries(upper as "NBA" | "MLB" | "NHL");
      teamLists = teams.map((t) => ({
        teamName: t.name,
        count: getTeamEspnInjuries(all, t.name, undefined, 30).length,
      }));
    } else if (upper === "KBO") {
      const all = await fetchKboInjuries();
      teamLists = teams.map((t) => ({
        teamName: t.name,
        count: getTeamKboInjuries(all, t.name).length,
      }));
    } else if (upper === "NPB") {
      const active = await fetchActiveNpbInjuriesCached(30);
      teamLists = teams.map((t) => ({
        teamName: t.name,
        count: getTeamNpbInjuries(active, t.name).length,
      }));
    }

    let maxCount = 0;
    let maxName = "";
    for (const tl of teamLists) {
      totalInjuries += tl.count;
      if (tl.count === 0) fullSquadCount++;
      if (tl.count > maxCount) {
        maxCount = tl.count;
        maxName = toEnglishTeamName(tl.teamName);
      }
    }
    if (maxCount > 0) topTeam = { name: maxName, count: maxCount };
  } catch {}

  const url = `${CANONICAL}/en/injuries/${upper}`;
  const seasonLabel =
    upper === "NATIONAL"
      ? "International fixtures"
      : upper === "KBO" || upper === "NPB" || upper === "MLB"
        ? `${new Date().getUTCFullYear()} season`
        : "2025-26 season";
  const sourceLabel =
    upper === "KBO"
      ? "KBO official (koreabaseball.com)"
      : upper === "NPB"
        ? "NPB official (npb.jp)"
        : SOCCER.includes(upper)
          ? soccerSource
          : ESPN_LEAGUES.includes(upper)
            ? "ESPN"
            : "api-football Pro";
  const title = `${lm.krFull} injury list ${seasonLabel}${totalInjuries > 0 ? ` · ${totalInjuries} out` : ""}`;
  const description = totalInjuries > 0
    ? `${lm.krFull} — injuries and absences across every club, ${totalInjuries} players${topTeam ? `. Most affected: ${topTeam.name}(${topTeam.count})` : ""}${upper !== "NATIONAL" && fullSquadCount > 0 ? `. Clubs at full strength: ${fullSquadCount}` : ""}. Updated daily · source ${sourceLabel}.`
    : `${lm.krFull} — every club's current injuries and absences on one page, with reason, severity and likely return. Updated daily.`;

  return {
    title,
    description,
    keywords: [
      `${lm.enFull} injuries`,
      `${lm.enFull} injury list`,
      `${upper} injuries`,
      SOCCER.includes(upper) ? "football injuries" : "baseball injuries",
      "sports injury list",
      `${seasonLabel} injuries`,
      ...lm.starKeywords,
    ],
    alternates: {
      canonical: url,
      // 영어판(/en/injuries) 지원 리그만 hreflang 상호 연결
      ...(EN_INJURY_LEAGUE_SET.has(upper)
        ? { languages: koEnLanguages(`/injuries/${upper}`, `/en/injuries/${upper}`) }
        : {}),
    },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      url,
      siteName: "Scorebase",
      title,
      description,
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.png"],
    },
  };
}

export default async function InjuriesByLeague({
  params,
  searchParams,
}: Props) {
  const { league } = await params;
  const sp = await searchParams;
  const upper = league.toUpperCase() as Lg;
  if (!VALID.includes(upper)) notFound();
  const lm = LEAGUE_META[upper];

  const teams = await getInjuryTeams(upper);

  // 리그 매치 데이터 (순위 + 다음 경기 계산용)
  // NATIONAL 은 실제 매치 league 가 "NATIONAL" 이 아니라 대회별(WORLD_CUP 등)이므로
  // 아래 순위/다음경기는 자연히 빈값 → 국가대표는 순위·일정 미표시(대회 혼재라 무의미).
  const dbMatches = await prisma.match.findMany({
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
  const standings = calcStandings(
    dbMatches.map((m) => ({ ...m })) as PredictMatch[],
  );

  // 팀별 다음 경기 (가장 가까운 SCHEDULED)
  const now = new Date();
  const upcomingMatches = await prisma.match.findMany({
    where: {
      league: upper,
      status: "SCHEDULED",
      startTime: { gte: now },
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "asc" },
  });
  const nextMatchByTeam = new Map<
    number,
    { startTime: Date; oppId: number; oppName: string; isHome: boolean }
  >();
  for (const m of upcomingMatches) {
    if (!nextMatchByTeam.has(m.homeTeamId)) {
      nextMatchByTeam.set(m.homeTeamId, {
        startTime: m.startTime,
        oppId: m.awayTeam.id,
        oppName: m.awayTeam.name,
        isHome: true,
      });
    }
    if (!nextMatchByTeam.has(m.awayTeamId)) {
      nextMatchByTeam.set(m.awayTeamId, {
        startTime: m.startTime,
        oppId: m.homeTeam.id,
        oppName: m.homeTeam.name,
        isHome: false,
      });
    }
  }

  const isEspn = ESPN_LEAGUES.includes(upper);
  const isSoccer = SOCCER.includes(upper);
  const isAsianBb = ASIAN_BB.includes(upper);
  const sportName: "soccer" | "basketball" | "baseball" | "hockey" =
    upper === "NBA" ? "basketball" : (upper === "MLB" || isAsianBb) ? "baseball" : upper === "NHL" ? "hockey" : "soccer";

  let allInjuries: InjuryEntry[] = [];
  let allEspn: Awaited<ReturnType<typeof fetchEspnInjuries>> = [];
  let allBdl: Awaited<ReturnType<typeof fetchBalldontlieInjuries>> = [];
  let allKbo: KboInjury[] = [];
  let allNpb: NpbInjuryEntry[] = [];
  // 조회 실패를 삼키면 빈 명단이 "부상자 없음" 으로 그려진다. 사용자에겐 사이트가 고장난
  //  것으로 보이는데 새로고침하면 정상이라 로그에도 안 남는다 (2026-08 /injuries/EPL 실측:
  //  16팀이 1팀으로 보였다가 재요청에 복구). 이 페이지는 force-dynamic 이라 렌더마다 DB 를
  //  치므로 커넥션 지연 한 번이 그대로 화면이 된다 — 한 번 더 시도해 흡수하고, 그래도
  //  실패하면 빈 명단을 사실인 양 그리지 않고 화면에 밝힌다.
  const loadFailures: string[] = [];
  const loadOrReport = async <T,>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await fn();
      } catch (e) {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        console.warn(`[injuries/${upper}] ${label} failed:`, (e as Error).message);
        loadFailures.push(label);
      }
    }
    return fallback;
  };

  // 축구 부상자: TheSports lineup.injury 1순위 (cache 추적 중인 팀은 부상자 0명도 신뢰).
  let tsInjByTeam = new Map<number, TSInjuryRaw[]>();
  if (isSoccer) {
    tsInjByTeam = await loadOrReport(
      "TheSports injuries",
      () => getTheSportsInjuriesByTeam(teams.map((t) => t.id)),
      new Map<number, TSInjuryRaw[]>(),
    );
  }
  // cache 없는 팀(오프시즌 등)이 있을 때만 api-football 보강 — 전부 cover 면 호출 skip(rate-limit 절약).
  // NATIONAL 처럼 api-football 리그 id 가 없는 경우는 애초에 보강 대상 아님(라벨도 "TheSports" 로).
  const needAf = isSoccer && !!API_FOOTBALL_LEAGUE_ID[upper] && teams.some((t) => !tsInjByTeam.has(t.id));
  const hasKey = isSoccer ? tsInjByTeam.size > 0 || !!process.env.API_FOOTBALL_KEY : true;
  if (isSoccer && needAf && process.env.API_FOOTBALL_KEY && API_FOOTBALL_LEAGUE_ID[upper]) {
    allInjuries = await loadOrReport(
      "api-football injuries",
      async () => {
        const season = getApiFootballSeason(new Date(), upper);
        const rows = await fetchSeasonInjuriesCached(upper, season);
        // 시즌 부상 목록에서 현재 스쿼드에 없는(이적/방출) 선수 제거 — 비시즌·시즌중 이적 잔존 방지.
        return filterInjuriesToCurrentSquad(rows);
      },
      [],
    );
  } else if (isEspn && upper !== "WNBA" && process.env.BALLDONTLIE_KEY) {
    allBdl = await loadOrReport("BALLDONTLIE injuries", () => fetchBalldontlieInjuries(upper as "NBA" | "MLB" | "NHL"), []);
    // BALLDONTLIE 실패하면 ESPN fallback — 폴백이 성공하면 앞선 실패는 화면에 알리지 않는다.
    if (allBdl.length === 0) {
      allEspn = await loadOrReport("ESPN injuries", () => fetchEspnInjuries(upper as "NBA" | "MLB" | "NHL"), []);
      if (allEspn.length > 0) loadFailures.length = 0;
    }
  } else if (isEspn) {
    allEspn = await loadOrReport("ESPN injuries", () => fetchEspnInjuries(upper as "NBA" | "MLB" | "NHL"), []);
  } else if (upper === "KBO") {
    allKbo = await loadOrReport("KBO injuries", () => fetchKboInjuries(), []);
  } else if (upper === "NPB") {
    allNpb = await loadOrReport(
      "NPB injuries",
      async () => {
        const active = await fetchActiveNpbInjuriesCached(30);
        // 활성 부상자 한자 → 한글 음역 보강 (pid 별 unstable_cache 1d)
        return enrichNpbInjuriesWithKoreanCached(active);
      },
      [],
    );
  }

  const seasonLabel =
    upper === "NATIONAL"
      ? "International fixtures"
      : isAsianBb || upper === "MLB"
        ? `${new Date().getUTCFullYear()} season`
        : "2025-26 season";
  // 검색·필터·정렬 파라미터
  const query = (sp.q ?? "").trim().toLowerCase();
  const severityFilter = (sp.severity ?? "ALL") as
    | "ALL"
    | Severity;
  const sort = sp.sort ?? "count_desc";

  // 팀별 raw 부상자 + 빈 이름 가드 (소스에 따라 fetch 분기).
  // overrideKo / overrideSev 가 있으면 translate/classify 우회 (KBO/NPB 한글 데이터).
  type RawInjury = {
    playerId: number;
    playerName: string;
    reason: string;
    fixtureDate?: string;
    description?: string;
    returnDate?: string;
    overrideKo?: string;
    overrideSev?: Severity;
  };
  // 축구 부상자 소스 규칙 (2026-08 확정 — 그때그때 다르게 판단하지 말 것).
  //  ① TheSports 가 정본. 경기 출전명단에 딸린 부상자 목록이라 사유·시작일·결장 경기수가
  //     확정값이다. api-football 은 경기별 결장 플래그를 묶은 추정이라 정확도가 낮다.
  //  ② 판정은 팀 단위. 그 팀의 최근 경기 명단을 읽었으면 ts 결과를 쓴다 — 부상자 0명도
  //     "이 팀은 결장자가 없다" 는 확정 정보다.
  //  ③ 명단을 못 읽은 팀만 api-football 로 보강한다.
  //  ④ 둘 다 없으면 0명이 아니라 "확인 불가" 다. af 는 리그·시즌별로 coverage.injuries 가
  //     꺼져 있으면 통째로 0건을 준다(2026-08 실측: 빅5·K리그·J리그 2026 = off, MLS = on).
  //     이걸 "부상자 없음" 으로 그리면 사용자는 사이트가 고장난 줄 안다.
  const teamSource = new Map<number, "ts" | "af" | "unknown">();
  const rawByTeam: Array<{ team: typeof teams[number]; raw: RawInjury[] }> = teams.map((t) => {
    let raw: RawInjury[] = [];
    if (isSoccer) {
      // 영어판 — TheSports 캐시는 선수명·사유가 한글이라 쓰지 않고 api-football(영문)만 쓴다.
      const tsRaw = null as (typeof tsInjByTeam extends Map<number, infer V> ? V : never) | null;
      if (tsRaw) {
        raw = tsRaw;
        teamSource.set(t.id, "ts");
      } else {
        // 명단을 못 읽은 팀 → api-football 보강. af 응답 자체가 비었으면 보강이 아니라 결손이다.
        raw = getTeamInjuries(allInjuries, t.name, undefined, 30).map((i) => ({
          playerId: i.playerId,
          playerName: i.playerName,
          reason: i.reason,
          fixtureDate: i.fixtureDate,
        }));
        teamSource.set(t.id, allInjuries.length > 0 ? "af" : "unknown");
      }
    } else if (isEspn && allBdl.length > 0) {
      raw = getTeamEspnInjuries(allBdl, t.name, undefined, 30).map((i) => ({
        playerId: i.playerId,
        playerName: i.playerName,
        reason: i.reason,
        fixtureDate: i.fixtureDate,
        description: i.description,
        returnDate: i.returnDate,
      }));
    } else if (isEspn) {
      raw = getTeamEspnInjuries(allEspn, t.name, undefined, 30).map((i) => ({
        playerId: i.playerId,
        playerName: i.playerName,
        reason: i.reason,
        fixtureDate: i.fixtureDate,
      }));
    } else if (upper === "KBO") {
      const list = getTeamKboInjuries(allKbo, t.name);
      raw = list.map((i, idx) => ({
        playerId: -(t.id * 1000 + idx), // KBO API 가 player id 미노출
        playerName: i.position ? `${i.playerName}(${i.position})` : i.playerName,
        reason: `${i.type} · ${i.duration}`,
        fixtureDate: i.date,
        overrideKo: `${i.type} · ${i.duration}`,
        overrideSev: classifyKboDuration(i.duration, i.type),
      }));
    } else if (upper === "NPB") {
      const list = getTeamNpbInjuries(allNpb, t.name);
      raw = list.map((i, idx) => ({
        playerId: i.pid ? Number(i.pid) : -(t.id * 1000 + idx),
        playerName: npbInjuryDisplayName(i.playerName),
        reason: `Removed from top-team roster · ${i.positionKo}`,
        fixtureDate: i.date,
        overrideKo: `Removed from top-team roster · ${i.positionKo}`,
        overrideSev: "short",
      }));
    }
    raw = raw.filter((i) => {
      const ok = i.playerName && i.playerName.trim().length > 0;
      if (!ok) {
        console.warn(
          `[Injuries] Skipped player with empty name: ${t.name}/${i.reason}`,
        );
      }
      return ok;
    });
    return { team: t, raw };
  });

  // sport sanity 점검 (다른 종목 선수 ID 혼입 차단) — 축구만 (Supabase 매핑 보유)
  if (isSoccer) {
    const allIds = rawByTeam
      .flatMap((x) => x.raw.map((i) => i.playerId))
      .filter((id) => typeof id === "number" && id > 0);
    if (allIds.length > 0) {
      try {
        await assertSportConsistency(allIds, "soccer", upper);
      } catch (e) {
        console.error(`[Injuries] sport sanity failed: ${(e as Error).message}`);
      }
    }
  }

  // 모든 선수 ID 모아서 Supabase batch 조회 (한 번에)
  // 출처 라벨 — 실제로 무엇이 화면을 채웠는지로 적는다. 옛 라벨은 "af 를 호출했나" 로
  //  판단해 af 응답이 0건이어도 "TheSports + api-football" 이라고 적었다.
  const tsTeams = [...teamSource.values()].filter((s) => s === "ts").length;
  const afTeams = [...teamSource.values()].filter((s) => s === "af").length;
  const unknownTeams = teams.filter((t) => teamSource.get(t.id) === "unknown");
  const sourceLabel =
    upper === "KBO"
      ? "KBO official (koreabaseball.com)"
      : upper === "NPB"
        ? "NPB official (npb.jp)"
        : isSoccer
          ? tsTeams > 0 && afTeams > 0
            ? "TheSports + api-football"
            : tsTeams > 0
              ? "TheSports"
              : afTeams > 0
                ? "api-football Pro"
                : "No source"
          : isEspn
            ? "ESPN"
            : "api-football Pro";

  const allPlayers = rawByTeam.flatMap((x) =>
    x.raw.map((i) => ({
      apiFootballId: i.playerId,
      nameEn: i.playerName,
    })),
  );
  const resolved = await resolvePlayerNames(allPlayers, sportName, upper);

  const byTeam = rawByTeam.map(({ team, raw }) => {
    const enriched: EnrichedInjury[] = raw.map((i, idx) => {
      const key = i.playerId > 0 ? i.playerId : i.playerName;
      // 영어판 — resolvePlayerNames 는 한글명을 만든다. 원본(영문)을 그대로 쓴다.
      const r = { ko: i.playerName };
      return {
        playerId: i.playerId > 0 ? i.playerId : -(team.id * 1000 + idx),
        playerName: r.ko,
        // 영어판 — 사유는 영문 원본을 그대로 쓴다 (translateReason 은 한글 매핑)
        reasonKo: i.reason || "Undisclosed",
        reasonRaw: i.reason,
        severity: i.overrideSev ?? classifySeverity(i.reason),
        description: i.description,
        returnDate: i.returnDate,
      };
    });

    // 필터 적용 (선수 검색 / 심각도)
    let filtered = enriched;
    if (query) {
      filtered = filtered.filter((p) =>
        p.playerName.toLowerCase().includes(query),
      );
    }
    if (severityFilter !== "ALL") {
      filtered = filtered.filter((p) => p.severity === severityFilter);
    }
    return { team, all: enriched, filtered };
  });

  // 정렬
  byTeam.sort((a, b) => {
    if (sort === "alpha") {
      return toEnglishTeamName(a.team.name).localeCompare(
        toEnglishTeamName(b.team.name),
        "ko",
      );
    }
    if (sort === "rank") {
      const ra = standings.byTeam.get(a.team.id)?.position ?? 999;
      const rb = standings.byTeam.get(b.team.id)?.position ?? 999;
      return ra - rb;
    }
    if (sort === "count_asc") return a.all.length - b.all.length;
    // count_desc 기본
    if (a.all.length > 0 && b.all.length === 0) return -1;
    if (a.all.length === 0 && b.all.length > 0) return 1;
    return b.all.length - a.all.length;
  });

  // 국가대표는 대회·소속팀이 수백개(유스 제외해도) → 부상자 있는 팀만 노출.
  // "누가 부상인가" 에 집중 + 빈 풀스쿼드 수백팀 노이즈 제거. (클럽 리그는 전 팀 유지)
  const displayTeams = upper === "NATIONAL" ? byTeam.filter((x) => x.all.length > 0) : byTeam;

  // 풀스쿼드 vs 부상자 있는 팀
  // "풀스쿼드" 는 확인된 사실일 때만. 어느 소스도 그 팀 명단을 못 준 경우(unknown)는
  //  부상자가 없는 게 아니라 알 수 없는 것이라 따로 뺀다.
  const unknownTeamIds = new Set(unknownTeams.map((t) => t.id));
  const fullSquadTeams = displayTeams.filter((x) => x.all.length === 0 && !unknownTeamIds.has(x.team.id));
  const unconfirmedTeams = displayTeams.filter((x) => x.all.length === 0 && unknownTeamIds.has(x.team.id));
  const injuredTeams = displayTeams.filter((x) => x.all.length > 0);

  const totalInjuries = displayTeams.reduce((s, x) => s + x.all.length, 0);
  const avgPerTeam = displayTeams.length > 0 ? totalInjuries / displayTeams.length : 0;

  // 상위 3팀
  const top3 = [...byTeam]
    .sort((a, b) => b.all.length - a.all.length)
    .slice(0, 3)
    .filter((x) => x.all.length > 0);

  // 부위 집계
  const partCount = new Map<string, number>();
  for (const { all } of byTeam) {
    for (const i of all) {
      partCount.set(i.reasonKo, (partCount.get(i.reasonKo) ?? 0) + 1);
    }
  }
  // generic("부상"/"미상"/"부상 의심" 등 부위 불명)은 부위가 아니므로 1위에서 제외 —
  // "최다 부상 부위: 부상" 같은 무의미 표기 방지. 구체 부위 우선, 전부 미분류면 null.
  const GENERIC_REASON = new Set([
    "Injury", "Unknown", "Doubtful", "Out", "Other",
    // 부위가 아닌 상태성 사유 — "최다 부상 부위" 1위에서 제외
    "Personal", "Suspended", "Suspension", "Suspended (card accumulation)", "International duty", "Coach's decision", "Doubtful",
  ]);
  const sortedParts = Array.from(partCount.entries()).sort(
    (a, b) => b[1] - a[1],
  );
  const topEntry =
    sortedParts.find(([name]) => !GENERIC_REASON.has(name)) ?? null;
  const topPart = topEntry
    ? {
        name: topEntry[0],
        count: topEntry[1],
        pct:
          totalInjuries > 0
            ? Math.round((topEntry[1] / totalInjuries) * 100)
            : 0,
      }
    : null;
  // "그 다음은 …" — generic·1위 부위 제외한 구체 부위 상위 2개 (서술 중복 방지)
  const nextParts = sortedParts
    .filter(([name]) => !GENERIC_REASON.has(name) && name !== topPart?.name)
    .slice(0, 2)
    .map((p) => p[0]);

  const lastUpdatedKst = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const pageUrl = `${CANONICAL}/injuries/${upper}`;

  // 리그 탭 전환 시 뷰 설정(심각도·정렬)을 유지 (빠뜨리면 리그 바꿀 때마다 초기화됨).
  // 검색어(q)는 선수·팀명이라 리그마다 무의미 → 일부러 리그 전환 시 리셋.
  const tabQs = new URLSearchParams();
  if (severityFilter !== "ALL") tabQs.set("severity", severityFilter);
  if (sort !== "count_desc") tabQs.set("sort", sort);
  const tabSuffix = tabQs.toString() ? `?${tabQs}` : "";

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: CANONICAL },
      {
        "@type": "ListItem",
        position: 2,
        name: lm.krFull,
        item: `${CANONICAL}/leagues/${upper}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Injury list",
        item: pageUrl,
      },
    ],
  };
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${lm.krFull} Injury List`,
    description: `${lm.krFull} — injuries and absences across every club.`,
    itemListElement: injuredTeams.slice(0, 30).map((x, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "SportsTeam",
        name: toEnglishTeamName(x.team.name),
        alternateName: x.team.name,
        url: `${CANONICAL}/teams/${x.team.id}`,
      },
    })),
  };

  return (
    <div className="relative">
      <AmbientGlow />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(itemListJsonLd) }}
      />

      {/* 헤더 */}
      <section className="relative overflow-hidden border-b border-neutral-200 dark:border-neutral-800">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-60 dark:opacity-30"
          style={{
            background:
              "radial-gradient(60% 80% at 20% 0%, rgba(244,63,94,0.15), transparent 60%), radial-gradient(50% 70% at 90% 30%, rgba(59,130,246,0.12), transparent 60%)",
          }}
        />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> injuries
            </span>
            <span className="text-[11px] font-semibold tracking-wide text-neutral-500">
              {sourceLabel} · {seasonLabel}
            </span>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <LeagueBadge league={upper} size="md" />
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
              {lm.krFull} Injury list
            </h1>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 break-keep">
            {isAsianBb
              ? upper === "KBO"
                ? "Current injured list plus treatment and rehab lists by club. Reasons are not published, so severity follows the stint length (10, 15 or 30+ days)."
                : "Players removed from the top-team roster by club (last 30 days; returnees drop off automatically). NPB has no separate injured list, so a roster removal is shown as an absence. Clubs do not disclose whether it is injury, rehab, demotion or form."
              : "Season-long injuries and absences by club, classified by severity."}
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-neutral-500">
            <Clock className="h-3 w-3" aria-hidden /> Last updated: {lastUpdatedKst} · source: {sourceLabel}
          </p>
        </div>
      </section>

      {/* 리그 탭 — 종목으로 먼저 묶는다. 리그가 25개라 한 줄로 늘어놓으면 찾을 수가 없다. */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-2.5">
        {SPORT_GROUPS.map((g) => {
          const inGroup = g.leagues.filter((l) => VALID.includes(l));
          if (!inGroup.length) return null;
          const groupActive = inGroup.includes(upper);
          return (
            <div key={g.label} className="flex flex-wrap items-center gap-2">
              <span
                className={`w-12 shrink-0 text-[11px] font-bold ${
                  groupActive ? "text-neutral-900 dark:text-white" : "text-neutral-400 dark:text-neutral-500"
                }`}
              >
                {g.label}
              </span>
              {inGroup.map((l) => {
                const active = l === upper;
                return (
                  <Link
                    key={l}
                    href={`/injuries/${l}${tabSuffix}`}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      active
                        ? "bg-neutral-900 text-white ring-neutral-900 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.5)] dark:bg-white dark:text-neutral-900 dark:ring-white"
                        : "bg-white/60 text-neutral-600 ring-black/10 hover:-translate-y-0.5 hover:bg-white dark:bg-white/5 dark:text-neutral-300 dark:ring-white/15 dark:hover:bg-white/10"
                    }`}
                  >
                    {LEAGUE_META[l].krShort}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 space-y-6">
        {!hasKey && (
          <div className="rounded-xl border border-amber-300/40 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm">
            Injury data could not be loaded because API_FOOTBALL_KEY is not configured.
          </div>
        )}

        {/* 조회 실패를 침묵하지 않는다 — 빈 명단을 "부상자 없음" 으로 보여주면 오해가 된다. */}
        {loadFailures.length > 0 && (
          <div className="rounded-xl border border-red-400/40 bg-red-50 p-4 text-sm dark:bg-red-900/20">
            <p className="font-semibold text-red-700 dark:text-red-300">Could not load injury data</p>
            <p className="mt-1 text-neutral-600 dark:text-neutral-300">
              {loadFailures.join(" · ")} The lookup failed, so the list below may be out of date. Please refresh shortly.
            </p>
          </div>
        )}

        {/* 요약 대시보드 — 4개 카드 */}
        {totalInjuries > 0 && (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="Total out"
              value={`${totalInjuries}`}
              subtle={upper === "NATIONAL"
                ? `Clubs with injuries ${injuredTeams.length} national teams`
                : `${displayTeams.length} · average ${avgPerTeam.toFixed(1)}`}
            />
            {topPart && (
              <StatCard
                label="Most common injury"
                value={topPart.name}
                subtle={`${topPart.count} cases · ${topPart.pct}%`}
              />
            )}
            <StatCard
              label="Most affected clubs"
              value={top3.length > 0 ? `${top3[0].all.length}` : "—"}
              subtle={top3
                .map((x) => toEnglishTeamName(x.team.name))
                .join(" · ")}
            />
            {upper === "NATIONAL" ? (
              <StatCard
                label="Injured national team"
                value={`${injuredTeams.length}Team`}
                subtle="One or more out"
              />
            ) : (
              <StatCard
                label="Full squad"
                value={`${fullSquadTeams.length}Team`}
                subtle={fullSquadTeams.length > 0 ? "No injuries" : "None"}
                positive={fullSquadTeams.length > 0}
              />
            )}
          </section>
        )}

        {/* SEO 분석 문단 */}
        {totalInjuries > 0 && (
          <section className="rounded-2xl border border-neutral-200 bg-neutral-50/50 p-5 space-y-2 text-sm leading-relaxed text-neutral-700 break-keep dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-300">
            <p>
              <strong>
                {upper === "NATIONAL" ? "" : "2025-26 season "}{lm.krFull} A total of{" "}
                {totalInjuries}
              </strong>
              . {displayTeams.length} {upper === "NATIONAL" ? "national team" : "Team"} average {avgPerTeam.toFixed(1)}
              players are out;
              {top3.length > 0 && (
                <>
                  the club with the most absentees is{" "}
                  <strong>
                    {toEnglishTeamName(top3[0].team.name)}({top3[0].all.length}
                    )
                  </strong>
                </>
              )}
              {fullSquadTeams.length > 0 && (
                <>
                  , and the clubs at full strength are{" "}
                  <strong>
                    {fullSquadTeams
                      .slice(0, 3)
                      .map((x) => toEnglishTeamName(x.team.name))
                      .join(", ")}
                    {fullSquadTeams.length > 3 &&
                      ` and ${fullSquadTeams.length - 3}Team`}
                  </strong>
                  .
                </>
              )}
              {fullSquadTeams.length === 0 && "."}
            </p>
            {topPart && (
              <p>
                By body part,{" "}
                <strong>
                  {topPart.name}({topPart.count}cases, {topPart.pct}%)
                </strong>
                is the most common,
                {nextParts.length > 0
                  ? `, then ${nextParts.join(" and ")}.`
                  : "."}
              </p>
            )}
          </section>
        )}

        {/* 풀스쿼드 별도 섹션 — 상단에서 강조.
            조회가 실패했으면 "부상자 없음" 은 사실이 아니라 조회 결과가 빈 것뿐이라 숨긴다. */}
        {fullSquadTeams.length > 0 && loadFailures.length === 0 && severityFilter === "ALL" && !query && (
          <section>
            <h2 className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Full squad available {fullSquadTeams.length}Team
            </h2>
            <div className="flex flex-wrap gap-2">
              {fullSquadTeams.map((x) => (
                <Link
                  key={x.team.id}
                  href={`/teams/${x.team.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-50 px-3 py-1.5 text-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-emerald-500/60 dark:bg-emerald-500/10"
                >
                  {x.team.logoUrl &&
                    (x.team.logoUrl.includes("liquipedia.net") ? (
                      <Image
                        src={x.team.logoUrl}
                        alt=""
                        width={16}
                        height={16}
                        className="w-4 h-4 object-contain"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={x.team.logoUrl}
                        alt=""
                        className="w-4 h-4 object-contain"
                        loading="lazy"
                      />
                    ))}
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                    {toEnglishTeamName(x.team.name)}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 확인 불가 — 어느 소스도 이 팀들의 부상 명단을 주지 않았다. 0명이 아니라 모르는 것이다. */}
        {unconfirmedTeams.length > 0 && loadFailures.length === 0 && severityFilter === "ALL" && !query && (
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-neutral-500">
              No injury data provided {unconfirmedTeams.length}Team
            </h2>
            <p className="mb-2 text-xs text-neutral-500">
              Our data provider does not supply absentee lists for these clubs. It does not mean there are no injuries.
            </p>
            <div className="flex flex-wrap gap-2">
              {unconfirmedTeams.map((x) => (
                <Link
                  key={x.team.id}
                  href={`/teams/${x.team.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-neutral-400/30 bg-neutral-100 px-3 py-1.5 text-sm text-neutral-600 transition-all duration-300 hover:-translate-y-0.5 hover:border-neutral-400/60 dark:bg-white/[0.06] dark:text-neutral-300"
                >
                  {toEnglishTeamName(x.team.name)}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 컨트롤 바 — 검색 + 필터 + 정렬 (URL query 기반, 서버 컴포넌트) */}
        <ControlsBar
          league={upper}
          query={query}
          severity={severityFilter}
          sort={sort}
        />

        {/* 부상자 있는 팀 카드 그리드 */}
        {injuredTeams.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-neutral-500 text-sm break-keep">
            {query || severityFilter !== "ALL"
              ? "No results match the filters."
              : "No injury data at the moment."}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {injuredTeams.map(({ team, all, filtered }) => {
              if (query || severityFilter !== "ALL") {
                if (filtered.length === 0) return null;
              }
              const list = query || severityFilter !== "ALL" ? filtered : all;
              return (
                <TeamInjuryCard
                  key={team.id}
                  teamId={team.id}
                  teamName={team.name}
                  logoUrl={team.logoUrl}
                  league={upper === "NATIONAL" ? team.league : upper}
                  flag={upper === "NATIONAL" ? fifaFlag(team.name, toEnglishTeamName(team.name)) : undefined}
                  rank={standings.byTeam.get(team.id)?.position}
                  nextMatch={nextMatchByTeam.get(team.id)}
                  all={all}
                  shown={list}
                  filterActive={!!query || severityFilter !== "ALL"}
                />
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-neutral-500 leading-relaxed">
          Data: {sourceLabel}
          {isAsianBb
            ? upper === "KBO"
              ? " (season injured list plus treatment and rehab lists). The KBO does not publish reasons, so severity is inferred from the length of the stint."
              : " (players removed from the top-team roster in the last 30 days; re-registered players drop off automatically). NPB has no separate injured list, so removal from the top-team roster is treated as an absence."
            : isSoccer
              ? " — TheSports lists absentees from each club's most recent squad; api-football gives season-long absence records."
              : " (season-long injuries)."}
          {" "}This list is for reference and may differ from the actual match-day squad.
        </p>

        <section className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
          <h2 className="text-base sm:text-lg font-bold tracking-tight break-keep">
            {lm.krFull} Injury list and absence analysis
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed break-keep">
            {lm.krFull} injuries and absences by club, kept current. Body part, reason and severity show at a glance how the line-up is affected.
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed break-keep">
            Live match progress is on{" "}
            <Link href="/scores" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              Live scores
            </Link>
            , pre-match analysis on{" "}
            <Link href="/previews" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              Previews
            </Link>
            , and results on{" "}
            <Link href="/predictions" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              Reports
            </Link>
            .{" "}
            <Link href="/standings" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              League analysis
            </Link>
             are also worth a look.
          </p>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtle,
  positive = false,
}: {
  label: string;
  value: string;
  subtle?: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:bg-white/[0.06]">
      <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-black tabular-nums ${
          positive ? "text-emerald-600 dark:text-emerald-400" : ""
        }`}
      >
        {value}
      </div>
      {subtle && (
        <div className="mt-0.5 text-[11px] text-neutral-500 truncate">
          {subtle}
        </div>
      )}
    </div>
  );
}

function ControlsBar({
  league,
  query,
  severity,
  sort,
}: {
  league: Lg;
  query: string;
  severity: "ALL" | Severity;
  sort: string;
}) {
  // 서버 컴포넌트 — form GET 으로 URL query 반영
  return (
    <form
      action={`/injuries/${league}`}
      method="get"
      className="rounded-2xl bg-white p-3 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] flex flex-wrap gap-2 items-center text-sm dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none"
    >
      <input
        type="search"
        name="q"
        defaultValue={query}
        placeholder="🔍 Search player"
        className="flex-1 min-w-[200px] px-3 py-1.5 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.04]"
      />
      <select
        name="severity"
        defaultValue={severity}
        className="px-3 py-1.5 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.04]"
      >
        <option value="ALL">All severities</option>
        <option value="long">🔴 Long-term</option>
        <option value="short">🟡 Short-term</option>
        <option value="returning">🟢 Close to return</option>
        <option value="non_injury">⚠️ Non-injury</option>
        <option value="unknown">❓ Reason undisclosed</option>
      </select>
      <select
        name="sort"
        defaultValue={sort}
        className="px-3 py-1.5 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.04]"
      >
        <option value="count_desc">Most injuries</option>
        <option value="count_asc">Fewest injuries</option>
        <option value="alpha">By club name</option>
        <option value="rank">By league position</option>
      </select>
      <button
        type="submit"
        className="px-4 py-1.5 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-semibold shadow-[0_8px_24px_-10px_rgba(0,0,0,0.5)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5"
      >
        Apply
      </button>
      {(query || severity !== "ALL" || sort !== "count_desc") && (
        <Link
          href={`/injuries/${league}`}
          className="text-xs text-neutral-500 hover:underline"
        >
          Reset
        </Link>
      )}
    </form>
  );
}

function TeamInjuryCard({
  teamId,
  teamName,
  logoUrl,
  league,
  flag,
  rank,
  nextMatch,
  all,
  shown,
  filterActive,
}: {
  teamId: number;
  teamName: string;
  logoUrl: string | null;
  league: string;
  flag?: string;
  rank?: number;
  nextMatch?: {
    startTime: Date;
    oppId: number;
    oppName: string;
    isHome: boolean;
  };
  all: EnrichedInjury[];
  shown: EnrichedInjury[];
  filterActive: boolean;
}) {
  // 심각도별 카운트 (all 기준 — 필터와 무관하게 전체 표시)
  const counts: Record<Severity, number> = {
    long: 0,
    short: 0,
    returning: 0,
    non_injury: 0,
    unknown: 0,
  };
  for (const i of all) counts[i.severity]++;

  // 핵심 결장자 — 장기 결장 > 단기 결장 > ... 순서 첫 1명 (한글 매핑 우선)
  const keyOne =
    all.find((i) => i.severity === "long" && /[가-힣]/.test(i.playerName)) ??
    all.find((i) => i.severity === "short" && /[가-힣]/.test(i.playerName)) ??
    all.find((i) => /[가-힣]/.test(i.playerName)) ??
    all[0] ??
    null;

  return (
    <details className="injury-card group overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:bg-white/[0.06]">
      <summary className="list-none cursor-pointer flex items-start gap-3 px-4 py-3 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.03] select-none">
        {logoUrl ? (
          logoUrl.includes("liquipedia.net") ? (
            <Image
              src={logoUrl}
              alt=""
              width={36}
              height={36}
              className="w-9 h-9 object-contain shrink-0 mt-0.5"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="w-9 h-9 object-contain shrink-0 mt-0.5"
              loading="lazy"
            />
          )
        ) : (
          <span className="inline-flex w-9 h-9 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-sm font-bold text-neutral-500 shrink-0">
            {teamName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/teams/${teamId}`}
              className="font-bold truncate hover:underline"
            >
              {flag ? `${flag} ` : ""}{toEnglishTeamName(teamName)}
            </Link>
            {rank && (
              <span className="text-[11px] text-neutral-500">
                League {rank}
              </span>
            )}
          </div>
          <div className="text-[11px] text-neutral-500 truncate">
            {teamName}
            {nextMatch && (
              <>
                {" · "}
                <span title={nextMatch.startTime.toISOString()}>
                  Next match {nextMatch.isHome ? "vs" : "@"}{" "}
                  {toEnglishTeamName(nextMatch.oppName)},{" "}
                  {nextMatch.startTime.toLocaleDateString("ko-KR", {
                    month: "2-digit",
                    day: "2-digit",
                    timeZone: "Asia/Seoul",
                  })}
                </span>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px]">
            {counts.long > 0 && (
              <SevBadge sev="long" count={counts.long} />
            )}
            {counts.short > 0 && (
              <SevBadge sev="short" count={counts.short} />
            )}
            {counts.returning > 0 && (
              <SevBadge sev="returning" count={counts.returning} />
            )}
            {counts.non_injury > 0 && (
              <SevBadge sev="non_injury" count={counts.non_injury} />
            )}
            {counts.unknown > 0 && (
              <SevBadge sev="unknown" count={counts.unknown} />
            )}
          </div>
          {keyOne && counts.long + counts.short > 0 && (
            <div className="text-[11px] text-neutral-500 mt-1 truncate">
              Key absentees:{" "}
              <strong className="text-neutral-700 dark:text-neutral-200">
                {keyOne.playerName}
              </strong>{" "}
              ({keyOne.reasonKo})
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {all.length}
            {filterActive && shown.length !== all.length && (
              <span className="ml-1 text-neutral-500">
                ({shown.length} )
              </span>
            )}
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 group-open:opacity-0 transition">
            View injuries
          </span>
        </div>
      </summary>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800 text-sm border-t border-neutral-100 dark:border-neutral-800">
        {shown.map((p) => (
          <li
            key={p.playerId}
            className="px-4 py-2"
            title={p.reasonRaw}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span
                  className="inline-flex items-center justify-center w-5 h-5 text-[11px] shrink-0"
                  title={SEVERITY_META[p.severity].label}
                >
                  {SEVERITY_META[p.severity].icon}
                </span>
                <span className="font-medium truncate">{p.playerName}</span>
              </div>
              <span className="text-xs text-neutral-500 shrink-0">
                {p.reasonKo}
                {p.returnDate && (
                  <span className="ml-2 text-neutral-400">
                    · return {new Date(p.returnDate).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                  </span>
                )}
              </span>
            </div>
            {p.description && (
              <p className="mt-1 ml-7 text-[11px] text-neutral-500 leading-snug line-clamp-2">
                {p.description}
              </p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function SevBadge({ sev, count }: { sev: Severity; count: number }) {
  const m = SEVERITY_META[sev];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold ${m.bgClass}`}
      title={m.label}
    >
      <span>{m.icon}</span>
      <span className="tabular-nums">{count}</span>
    </span>
  );
}
