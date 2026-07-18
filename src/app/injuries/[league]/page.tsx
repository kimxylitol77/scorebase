// 리그별 부상자 명단 — 부상 부위·복귀 예상·치료/재활.
import { prisma } from "@/lib/db";
import { unstable_cache } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import LeagueBadge from "@/components/LeagueBadge";
import AmbientGlow from "@/components/AmbientGlow";
import { Clock, CheckCircle2 } from "lucide-react";
import { toKoreanTeamName } from "@/lib/team-names";
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

function classifyKboDuration(
  duration: string,
  type: "부상자 명단" | "치료·재활명단",
): "long" | "short" | "returning" {
  if (type === "치료·재활명단") return "returning";
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
] as const;
type Lg = (typeof VALID)[number];
const SOCCER: Lg[] = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS",
  "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE", "AFC_CL", "SAUDI_PL",
  "NATIONAL",
];
const ESPN_LEAGUES: Lg[] = ["NBA", "MLB", "NHL"];
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
    krFull: "국가대표",
    krShort: "국대",
    enFull: "National Teams",
    starKeywords: [
      "국가대표 부상",
      "월드컵 부상자",
      "손흥민 부상",
      "음바페 부상",
      "네이마르 부상",
      "브라질 대표팀 부상자",
      "프랑스 대표팀 부상자",
      "A매치 부상자",
    ],
  },
  EPL: {
    krFull: "프리미어리그",
    krShort: "EPL",
    enFull: "English Premier League",
    starKeywords: [
      "손흥민 부상",
      "살라 부상",
      "홀란 부상",
      "사카 부상",
      "데 브라위너 부상",
      "맨시티 부상자",
      "리버풀 부상자",
      "아스널 부상자",
      "토트넘 부상자",
    ],
  },
  LALIGA: {
    krFull: "라리가",
    krShort: "라리가",
    enFull: "La Liga",
    starKeywords: [
      "음바페 부상",
      "비니시우스 부상",
      "벨링엄 부상",
      "레반도프스키 부상",
      "야말 부상",
      "레알 마드리드 부상자",
      "바르셀로나 부상자",
      "아틀레티코 마드리드 부상자",
    ],
  },
  BUNDESLIGA: {
    krFull: "분데스리가",
    krShort: "분데스",
    enFull: "Bundesliga",
    starKeywords: [
      "케인 부상",
      "무시알라 부상",
      "비르츠 부상",
      "김민재 부상",
      "이재성 부상",
      "바이에른 뮌헨 부상자",
      "도르트문트 부상자",
      "레버쿠젠 부상자",
    ],
  },
  SERIE_A: {
    krFull: "세리에 A",
    krShort: "세리에A",
    enFull: "Serie A",
    starKeywords: [
      "라우타로 부상",
      "오스미안 부상",
      "디발라 부상",
      "레아오 부상",
      "인터 밀란 부상자",
      "유벤투스 부상자",
      "AC 밀란 부상자",
    ],
  },
  LIGUE_1: {
    krFull: "리그 1",
    krShort: "리그1",
    enFull: "Ligue 1",
    starKeywords: [
      "이강인 부상",
      "뎀벨레 부상",
      "PSG 부상자",
      "파리 생제르맹 부상자",
      "마르세유 부상자",
    ],
  },
  MLS: {
    krFull: "MLS",
    krShort: "MLS",
    enFull: "Major League Soccer",
    starKeywords: [
      "메시 부상",
      "수아레스 부상",
      "인터 마이애미 부상자",
      "LAFC 부상자",
    ],
  },
  NBA: {
    krFull: "NBA",
    krShort: "NBA",
    enFull: "National Basketball Association",
    starKeywords: [
      "NBA 부상자", "NBA 부상자 명단",
      "르브론 부상", "커리 부상", "듀란트 부상", "요키치 부상", "돈치치 부상",
      "엠비드 부상", "테이텀 부상", "웸반야마 부상",
      "레이커스 부상자", "워리어스 부상자", "셀틱스 부상자",
    ],
  },
  MLB: {
    krFull: "MLB",
    krShort: "MLB",
    enFull: "Major League Baseball",
    starKeywords: [
      "MLB 부상자", "메이저리그 부상자 명단",
      "오타니 부상", "저지 부상", "베츠 부상", "소토 부상",
      "김하성 부상", "김혜성 부상", "이정후 부상",
      "다저스 부상자", "양키스 부상자",
    ],
  },
  NHL: {
    krFull: "NHL",
    krShort: "NHL",
    enFull: "National Hockey League",
    starKeywords: [
      "NHL 부상자", "NHL 부상자 명단",
      "맥데이비드 부상", "드라이자이틀 부상", "매슈스 부상", "매키넌 부상", "크로즈비 부상",
      "오일러스 부상자", "메이플리프스 부상자",
    ],
  },
  KBO: {
    krFull: "KBO 리그",
    krShort: "KBO",
    enFull: "Korea Baseball Organization",
    starKeywords: [
      "KBO 부상자", "KBO 부상자 명단",
      "두산 부상자", "LG 부상자", "SSG 부상자", "한화 부상자",
      "KIA 부상자", "롯데 부상자", "삼성 부상자",
    ],
  },
  NPB: {
    krFull: "NPB 일본프로야구",
    krShort: "NPB",
    enFull: "Nippon Professional Baseball",
    starKeywords: [
      "NPB 부상자", "일본프로야구 부상자",
      "요미우리 부상자", "한신 부상자", "소프트뱅크 부상자",
      "히로시마 부상자", "야쿠르트 부상자",
    ],
  },
  K_LEAGUE_1: {
    krFull: "K리그 1",
    krShort: "K리그1",
    enFull: "K League 1",
    starKeywords: [
      "K리그 부상자", "K리그1 부상자",
      "울산 부상자", "전북 부상자", "FC서울 부상자", "수원 삼성 부상자",
    ],
  },
  K_LEAGUE_2: {
    krFull: "K리그 2",
    krShort: "K리그2",
    enFull: "K League 2",
    starKeywords: [
      "K리그2 부상자", "K리그 2부 부상자",
    ],
  },
  J1_LEAGUE: {
    krFull: "J1리그",
    krShort: "J1",
    enFull: "J1 League",
    starKeywords: [
      "J리그 부상자", "J1 부상자",
      "가시마 부상자", "우라와 부상자", "요코하마 마리노스 부상자",
    ],
  },
  J2_LEAGUE: {
    krFull: "J2리그",
    krShort: "J2",
    enFull: "J2 League",
    starKeywords: [
      "J2 부상자", "J리그 2부 부상자",
    ],
  },
  AFC_CL: {
    krFull: "AFC 챔피언스리그 엘리트",
    krShort: "ACL 엘리트",
    enFull: "AFC Champions League Elite",
    starKeywords: [
      "AFC 챔피언스리그 부상자", "ACL 부상자",
      "아시아 챔스 부상자",
    ],
  },
  SAUDI_PL: {
    krFull: "사우디 프로 리그",
    krShort: "SPL",
    enFull: "Saudi Pro League",
    starKeywords: [
      "사우디 프로 리그 부상자", "호날두 부상", "벤제마 부상", "네이마르 부상",
      "알 나스르 부상자", "알 힐랄 부상자", "알 이티하드 부상자",
    ],
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
  return prisma.team.findMany({ where: { league: upper }, orderBy: { name: "asc" } });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league } = await params;
  const upper = league.toUpperCase() as Lg;
  if (!VALID.includes(upper)) return { title: "부상자 명단" };
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
        maxName = toKoreanTeamName(tl.teamName, upper);
      }
    }
    if (maxCount > 0) topTeam = { name: maxName, count: maxCount };
  } catch {}

  const url = `${CANONICAL}/injuries/${upper}`;
  const seasonLabel =
    upper === "NATIONAL"
      ? "국가대표 A매치"
      : upper === "KBO" || upper === "NPB" || upper === "MLB"
        ? `${new Date().getUTCFullYear()} 시즌`
        : "2025-26 시즌";
  const sourceLabel =
    upper === "KBO"
      ? "KBO 공식 (koreabaseball.com)"
      : upper === "NPB"
        ? "NPB 공식 (npb.jp)"
        : SOCCER.includes(upper)
          ? soccerSource
          : ESPN_LEAGUES.includes(upper)
            ? "ESPN"
            : "api-football Pro";
  const title = `${lm.krFull} 부상자 명단 ${seasonLabel}${totalInjuries > 0 ? ` · 총 ${totalInjuries}명 결장` : ""}`;
  const description = totalInjuries > 0
    ? `${lm.krFull} 전 팀 부상·결장 선수 ${totalInjuries}명 현황${topTeam ? `. 가장 많은 결장자 보유: ${topTeam.name}(${topTeam.count}명)` : ""}${upper !== "NATIONAL" && fullSquadCount > 0 ? `. 풀스쿼드 팀 ${fullSquadCount}개` : ""}. 매일 업데이트 · 출처 ${sourceLabel}.`
    : `${lm.krFull} 전 팀의 현재 부상·결장 선수 한 페이지 정리. 사유·심각도·복귀 가늠 — 매일 업데이트.`;

  return {
    title,
    description,
    keywords: [
      `${lm.krFull} 부상자`,
      `${lm.krFull} 부상자 명단`,
      `${upper} 부상자`,
      `${lm.enFull} injuries`,
      SOCCER.includes(upper) ? "축구 부상자" : "야구 부상자",
      "스포츠 부상자 명단",
      `${seasonLabel} 부상자`,
      ...lm.starKeywords,
    ],
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      url,
      siteName: "스코어베이스",
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
  // 축구 부상자: TheSports lineup.injury 1순위 (cache 추적 중인 팀은 부상자 0명도 신뢰).
  let tsInjByTeam = new Map<number, TSInjuryRaw[]>();
  if (isSoccer) {
    try { tsInjByTeam = await getTheSportsInjuriesByTeam(teams.map((t) => t.id)); } catch {}
  }
  // cache 없는 팀(오프시즌 등)이 있을 때만 api-football 보강 — 전부 cover 면 호출 skip(rate-limit 절약).
  // NATIONAL 처럼 api-football 리그 id 가 없는 경우는 애초에 보강 대상 아님(라벨도 "TheSports" 로).
  const needAf = isSoccer && !!API_FOOTBALL_LEAGUE_ID[upper] && teams.some((t) => !tsInjByTeam.has(t.id));
  const hasKey = isSoccer ? tsInjByTeam.size > 0 || !!process.env.API_FOOTBALL_KEY : true;
  if (isSoccer && needAf && process.env.API_FOOTBALL_KEY && API_FOOTBALL_LEAGUE_ID[upper]) {
    try {
      const season = getApiFootballSeason(new Date(), upper);
      allInjuries = await fetchSeasonInjuriesCached(upper, season);
      // 시즌 부상 목록에서 현재 스쿼드에 없는(이적/방출) 선수 제거 — 비시즌·시즌중 이적 잔존 방지.
      allInjuries = await filterInjuriesToCurrentSquad(allInjuries);
    } catch {}
  } else if (isEspn && process.env.BALLDONTLIE_KEY) {
    try {
      allBdl = await fetchBalldontlieInjuries(upper as "NBA" | "MLB" | "NHL");
    } catch {}
    // BALLDONTLIE 실패하면 ESPN fallback
    if (allBdl.length === 0) {
      try {
        allEspn = await fetchEspnInjuries(upper as "NBA" | "MLB" | "NHL");
      } catch {}
    }
  } else if (isEspn) {
    try {
      allEspn = await fetchEspnInjuries(upper as "NBA" | "MLB" | "NHL");
    } catch {}
  } else if (upper === "KBO") {
    try {
      allKbo = await fetchKboInjuries();
    } catch (e) {
      console.warn("[injuries/KBO] fetch 실패:", (e as Error).message);
    }
  } else if (upper === "NPB") {
    try {
      const active = await fetchActiveNpbInjuriesCached(30);
      // 활성 부상자 한자 → 한글 음역 보강 (pid 별 unstable_cache 1d)
      allNpb = await enrichNpbInjuriesWithKoreanCached(active);
    } catch (e) {
      console.warn("[injuries/NPB] fetch 실패:", (e as Error).message);
    }
  }

  const seasonLabel =
    upper === "NATIONAL"
      ? "국가대표 A매치"
      : isAsianBb || upper === "MLB"
        ? `${new Date().getUTCFullYear()} 시즌`
        : "2025-26 시즌";
  const sourceLabel =
    upper === "KBO"
      ? "KBO 공식 (koreabaseball.com)"
      : upper === "NPB"
        ? "NPB 공식 (npb.jp)"
        : isSoccer
          ? tsInjByTeam.size > 0
            ? needAf
              ? "TheSports + api-football"
              : "TheSports"
            : "api-football Pro"
          : isEspn
            ? "ESPN"
            : "api-football Pro";

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
  const rawByTeam: Array<{ team: typeof teams[number]; raw: RawInjury[] }> = teams.map((t) => {
    let raw: RawInjury[] = [];
    if (isSoccer) {
      const tsRaw = tsInjByTeam.get(t.id);
      if (tsRaw) {
        raw = tsRaw; // TheSports lineup.injury (한글 사유 override 포함)
      } else {
        // cache 없는 팀 → api-football 보강
        raw = getTeamInjuries(allInjuries, t.name, undefined, 30).map((i) => ({
          playerId: i.playerId,
          playerName: i.playerName,
          reason: i.reason,
          fixtureDate: i.fixtureDate,
        }));
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
        reason: `1군 엔트리 제외 · ${i.positionKo}`,
        fixtureDate: i.date,
        overrideKo: `1군 엔트리 제외 · ${i.positionKo}`,
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
        console.error(`[Injuries] sport sanity 실패: ${(e as Error).message}`);
      }
    }
  }

  // 모든 선수 ID 모아서 Supabase batch 조회 (한 번에)
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
      const r = resolved.get(key) ?? { ko: i.playerName };
      return {
        playerId: i.playerId > 0 ? i.playerId : -(team.id * 1000 + idx),
        playerName: r.ko,
        reasonKo: i.overrideKo ?? translateReason(i.reason),
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
      return toKoreanTeamName(a.team.name, upper).localeCompare(
        toKoreanTeamName(b.team.name, upper),
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
  const fullSquadTeams = displayTeams.filter((x) => x.all.length === 0);
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
    "부상", "미상", "부상 의심", "결장", "기타",
    // 부위가 아닌 상태성 사유 — "최다 부상 부위" 1위에서 제외
    "개인 사정", "출전정지", "출전 정지", "경고 누적 출전 정지", "대표팀 차출", "감독 결정", "출전 불투명",
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
      { "@type": "ListItem", position: 1, name: "홈", item: CANONICAL },
      {
        "@type": "ListItem",
        position: 2,
        name: lm.krFull,
        item: `${CANONICAL}/leagues/${upper}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "부상자 명단",
        item: pageUrl,
      },
    ],
  };
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${lm.krFull} 부상자 명단`,
    description: `${lm.krFull} 전 팀의 부상·결장 선수 명단.`,
    itemListElement: injuredTeams.slice(0, 30).map((x, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "SportsTeam",
        name: toKoreanTeamName(x.team.name, upper),
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
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
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 부상자
            </span>
            <span className="text-[11px] font-semibold tracking-wide text-neutral-500">
              {sourceLabel} · {seasonLabel}
            </span>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <LeagueBadge league={upper} size="md" />
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
              {lm.krFull} 부상자 명단
            </h1>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 break-keep">
            {isAsianBb
              ? upper === "KBO"
                ? "팀별 현재 부상자 명단 + 치료·재활명단. KBO 공식 등록 기준이라 사유는 공개되지 않고 기간(10일/15일/30일+)으로 심각도를 분류."
                : "팀별 1군 엔트리에서 빠진 선수 (지난 30일 누적, 복귀자 자동 제외). 일본 NPB 는 KBO/MLB 같은 별도 부상자 명단 제도가 없어 '出場選手登録抹消(출장 선수 등록 말소)' = 1군 결장으로 표시. 부상·재활·강등·컨디션 난조 등 사유는 구단이 공개하지 않음."
              : "팀별 시즌 누적 부상·결장 선수. 사유는 영문 의학용어를 한글로 자동 번역, 심각도별 분류."}
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-neutral-500">
            <Clock className="h-3 w-3" aria-hidden /> 마지막 업데이트: {lastUpdatedKst} · 출처: {sourceLabel}
          </p>
        </div>
      </section>

      {/* 리그 탭 */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center gap-2">
        {VALID.map((l) => {
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
              {LEAGUE_META[l].krFull}
            </Link>
          );
        })}
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 space-y-6">
        {!hasKey && (
          <div className="rounded-xl border border-amber-300/40 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm">
            API_FOOTBALL_KEY 가 설정되지 않아 부상자 데이터를 불러오지 못했습니다.
          </div>
        )}

        {/* 요약 대시보드 — 4개 카드 */}
        {totalInjuries > 0 && (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="총 결장자"
              value={`${totalInjuries}명`}
              subtle={upper === "NATIONAL"
                ? `부상자 보유 ${injuredTeams.length}개 대표팀`
                : `${displayTeams.length}개 팀 평균 ${avgPerTeam.toFixed(1)}명`}
            />
            {topPart && (
              <StatCard
                label="최다 부상 부위"
                value={topPart.name}
                subtle={`${topPart.count}건 · ${topPart.pct}%`}
              />
            )}
            <StatCard
              label="영향 큰 팀 TOP 3"
              value={top3.length > 0 ? `${top3[0].all.length}명` : "—"}
              subtle={top3
                .map((x) => toKoreanTeamName(x.team.name, upper))
                .join(" · ")}
            />
            {upper === "NATIONAL" ? (
              <StatCard
                label="부상 대표팀"
                value={`${injuredTeams.length}팀`}
                subtle="부상자 1명 이상"
              />
            ) : (
              <StatCard
                label="풀스쿼드"
                value={`${fullSquadTeams.length}팀`}
                subtle={fullSquadTeams.length > 0 ? "부상자 0명" : "없음"}
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
                {upper === "NATIONAL" ? "" : "2025-26 시즌 "}{lm.krFull} 전체 부상·결장 선수는 총{" "}
                {totalInjuries}명
              </strong>
              으로 집계됐다. {displayTeams.length}개 {upper === "NATIONAL" ? "대표팀" : "팀"} 평균 {avgPerTeam.toFixed(1)}
              명이 결장 중이며
              {top3.length > 0 && (
                <>
                  , 가장 많은 결장자를 보유한 팀은{" "}
                  <strong>
                    {toKoreanTeamName(top3[0].team.name, upper)}({top3[0].all.length}
                    명)
                  </strong>
                </>
              )}
              {fullSquadTeams.length > 0 && (
                <>
                  , 풀스쿼드를 유지 중인 팀은{" "}
                  <strong>
                    {fullSquadTeams
                      .slice(0, 3)
                      .map((x) => toKoreanTeamName(x.team.name, upper))
                      .join(", ")}
                    {fullSquadTeams.length > 3 &&
                      ` 외 ${fullSquadTeams.length - 3}팀`}
                  </strong>
                  이다.
                </>
              )}
              {fullSquadTeams.length === 0 && "."}
            </p>
            {topPart && (
              <p>
                부상 부위별로는{" "}
                <strong>
                  {topPart.name}({topPart.count}건, {topPart.pct}%)
                </strong>
                이 가장 많이 발생했고
                {nextParts.length > 0
                  ? `, 그 다음은 ${nextParts.join("과 ")} 순이다.`
                  : "."}
              </p>
            )}
          </section>
        )}

        {/* 풀스쿼드 별도 섹션 — 상단에서 강조 */}
        {fullSquadTeams.length > 0 && severityFilter === "ALL" && !query && (
          <section>
            <h2 className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> 풀스쿼드 유지 {fullSquadTeams.length}팀
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
                    {toKoreanTeamName(x.team.name, upper)}
                  </span>
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
              ? "필터에 일치하는 결과가 없습니다."
              : "현재 부상자 데이터가 없습니다."}
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
                  flag={upper === "NATIONAL" ? fifaFlag(team.name, toKoreanTeamName(team.name, team.league)) : undefined}
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
          데이터: {sourceLabel}
          {isAsianBb
            ? upper === "KBO"
              ? " (시즌 부상자 명단 + 치료·재활명단). 사유는 KBO 가 공개하지 않으며 기간으로 심각도 분류."
              : " (지난 30일간 1군 엔트리에서 빠진 누적 명단, 재등록된 선수는 자동 제외). 일본 NPB 는 별도 부상자 명단 제도가 없어 1군 엔트리 제외 = 결장으로 간주."
            : " (시즌 누적 부상자) · 사유 한글 번역은 의학용어 매핑 기반."}
          {" "}본 명단은 참고용으로 실제 매치 라인업과 다를 수 있습니다.
        </p>

        <section className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
          <h2 className="text-base sm:text-lg font-bold tracking-tight break-keep">
            {lm.krFull} 부상자 명단 및 결장자 분석
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed break-keep">
            {lm.krFull}의 팀별 부상자·결장자 명단을 실시간으로 정리해 제공합니다. 부상 부위·사유·심각도 분류로 라인업에 미치는 영향을 한눈에 확인할 수 있습니다.
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed break-keep">
            실시간 경기 진행은{" "}
            <Link href="/scores" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              라이브스코어
            </Link>
            에서, 경기 전 매치업 분석은{" "}
            <Link href="/previews" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              프리뷰
            </Link>
            에서, 종료 후 결과는{" "}
            <Link href="/predictions" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              리뷰
            </Link>
            에서 확인할 수 있습니다.{" "}
            <Link href="/standings" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              리그별 분석
            </Link>
            도 함께 참고하세요.
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
        placeholder="🔍 선수명 검색"
        className="flex-1 min-w-[200px] px-3 py-1.5 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.04]"
      />
      <select
        name="severity"
        defaultValue={severity}
        className="px-3 py-1.5 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.04]"
      >
        <option value="ALL">심각도 전체</option>
        <option value="long">🔴 장기 결장</option>
        <option value="short">🟡 단기 결장</option>
        <option value="returning">🟢 회복 임박</option>
        <option value="non_injury">⚠️ 부상 외</option>
        <option value="unknown">❓ 사유 미공개</option>
      </select>
      <select
        name="sort"
        defaultValue={sort}
        className="px-3 py-1.5 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-white/[0.04]"
      >
        <option value="count_desc">부상자 많은 순</option>
        <option value="count_asc">부상자 적은 순</option>
        <option value="alpha">팀 이름 순</option>
        <option value="rank">리그 순위 순</option>
      </select>
      <button
        type="submit"
        className="px-4 py-1.5 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-semibold shadow-[0_8px_24px_-10px_rgba(0,0,0,0.5)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5"
      >
        적용
      </button>
      {(query || severity !== "ALL" || sort !== "count_desc") && (
        <Link
          href={`/injuries/${league}`}
          className="text-xs text-neutral-500 hover:underline"
        >
          초기화
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
              {flag ? `${flag} ` : ""}{toKoreanTeamName(teamName, league)}
            </Link>
            {rank && (
              <span className="text-[11px] text-neutral-500">
                리그 {rank}위
              </span>
            )}
          </div>
          <div className="text-[11px] text-neutral-500 truncate">
            {teamName}
            {nextMatch && (
              <>
                {" · "}
                <span title={nextMatch.startTime.toISOString()}>
                  다음 경기 {nextMatch.isHome ? "vs" : "@"}{" "}
                  {toKoreanTeamName(nextMatch.oppName, league)},{" "}
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
              핵심 결장:{" "}
              <strong className="text-neutral-700 dark:text-neutral-200">
                {keyOne.playerName}
              </strong>{" "}
              ({keyOne.reasonKo})
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {all.length}명
            {filterActive && shown.length !== all.length && (
              <span className="ml-1 text-neutral-500">
                ({shown.length} 표시)
              </span>
            )}
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 group-open:opacity-0 transition">
            부상자 보기
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
                    · 복귀 {new Date(p.returnDate).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
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
