// /en/predictions — 시즌 예측 허브 (영어판). scripts/en-mirror 로 자동 생성.
import type { Metadata } from "next";
import {
  safeFetchTop3,
  fetchSoccerCountryGroups,
  fetchSportGroups,
} from "@/lib/sports/standings-overview";
import PredictionsView from "./_view";
import AmbientGlow from "@/components/AmbientGlow";
import { SITE_URL } from "@/lib/site-url";
import { LEAGUES, type TopThreeEntry } from "./_data";
import {
  FIFA_RANKINGS,
  fifaCountryKo,
  fifaFlag,
  FIFA_RANKING_DATE,
} from "@/lib/sports/fifa-rankings";
import rawClubRankings from "../../../../data/club-rankings.json";
import { jsonLdScript } from "@/lib/seo/jsonld";

// 세계 클럽 랭킹 top5 — 대시보드 FIFA 랭킹 옆 카드용 (정적 JSON)
const CLUB_RANKINGS = rawClubRankings as { rank: number; name: string; logo: string | null }[];

export const revalidate = 600; // ISR — force-dynamic 제거(2026-07-02, searchParams 없음)

export const metadata: Metadata = {
  title: "Season Predictions — Title, Play-off and Leaderboards",
  description:
    "Title, play-off and relegation probabilities plus scoring, home run, batting average and ERA leaderboards, from 5,000 Monte Carlo runs on Elo ratings. Premier League, LaLiga, K League, KBO, MLB, NPB, NBA, NHL and LCK.",
  alternates: {
    canonical: "/en/predictions",
    // 영어판(/en/predictions) hreflang 상호 연결
    languages: {
      ko: "https://www.scorebase.kr/predictions",
      en: "https://www.scorebase.kr/en/predictions",
      "x-default": "https://www.scorebase.kr/predictions",
    },
  },
  keywords: [
    "Season predictions", "Title probability", "Relegation probability", "Play-off probability",
    "Monte Carlo simulation", "Elo ratings",
    "League tables", "League leaderboards", "top scorer", "top assists", "scoring charts", "assist charts",
    "Premier League table", "LaLiga table", "LaLiga top scorer",
    "home run leaders", "batting average leaders", "ERA leaders", "wins", "strikeouts", "KBO home run leader", "MLB home runs",
    "NBA scoring leaders", "NBA rebounds",
    "FIFA rankings", "national team rankings",
  ],
};

// top3 fetch 는 lib(standings-overview)으로 이동 — /standings 허브와 공유.
// (리그 단위 실패는 빈 배열 격리 — 2026-05-27 /predictions 500 사고 가드 유지)

async function fetchTop3Map(): Promise<Record<string, TopThreeEntry[]>> {
  const allCodes = new Set<string>();
  for (const lg of LEAGUES) {
    if (lg.codes) for (const c of lg.codes) allCodes.add(c.code);
    else allCodes.add(lg.code);
  }
  const results = await Promise.all(
    Array.from(allCodes).map(async (league) => {
      const top3 = await safeFetchTop3(league, "en");
      return [league, top3] as const;
    }),
  );
  return Object.fromEntries(results);
}

// /predictions/{league} 상세가 존재하는 리그만 — 카드 링크 404 방지 (CPBL 등 standings 만 있는 리그 제외)
const PREDICTION_PAGE_CODES = new Set(
  LEAGUES.flatMap((lg) => (lg.codes ? lg.codes.map((c) => c.code) : [lg.code])),
);

// 예측 인덱스의 순위는 "핵심 요약"만 — 야구 + 한국·빅5 축구. 전체는 /standings 허브가 정본.
const PREDICTIONS_SUMMARY_COUNTRIES = new Set([
  "South Korea", "England", "Spain", "Germany", "Italy", "France",
]);

// 구조화 데이터 — Dataset + BreadcrumbList + ItemList(리그별 시즌 예측). 리그 상세 색인 촉진.
const LEAGUE_LD_ITEMS = LEAGUES.flatMap((lg) => {
  const subs = lg.codes ?? [{ code: lg.code, label: lg.name }];
  return subs.map((s) => ({ code: s.code, label: lg.codes ? s.label : lg.name }));
});
const PREDICTIONS_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Dataset",
      name: "Scorebase season title probability",
      description:
        "Season simulation across 19 leagues — title, play-off and relegation probabilities from 5,000 Monte Carlo runs on Elo ratings.",
      url: `${SITE_URL}/predictions`,
      keywords: ["Season title probability", "Monte Carlo simulation", "Elo-based projection"],
      creator: { "@type": "Organization", name: "Scorebase", url: SITE_URL },
      isAccessibleForFree: true,
      measurementTechnique: "Monte Carlo simulation (5,000 runs) plus Elo ratings",
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Season predictions", item: `${SITE_URL}/predictions` },
      ],
    },
    {
      "@type": "ItemList",
      name: "Season predictions by league",
      description: "Title, play-off and relegation probabilities, tables and season leaderboards for each league.",
      numberOfItems: LEAGUE_LD_ITEMS.length,
      itemListElement: LEAGUE_LD_ITEMS.map((l, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: `${l.label} season prediction`,
        url: `${SITE_URL}/predictions/${l.code}`,
      })),
    },
  ],
};

// FIFA 국가 랭킹 표시용 — 정적 JSON(fifa-rankings) → 한글명 + 국기 부여. 영문 canonical
// 매핑 없으면 toKoreanTeamName(국가대표 RAW)으로 2차 보강, 그래도 없으면 영문 그대로.
function buildFifaRanking(): { rank: number; name: string; flag: string }[] {
  return FIFA_RANKINGS.map((r) => ({
    rank: r.rank,
    name: r.name,
    flag: fifaFlag(r.name),
  }));
}

// 세계 클럽 랭킹 top5 — 한글 클럽명 + 로고
function buildClubRanking(): { rank: number; name: string; logo: string | null }[] {
  return CLUB_RANKINGS.slice(0, 5).map((c) => ({ rank: c.rank, name: c.name, logo: c.logo }));
}

export default async function PredictionsRoot() {
  const [top3, soccerGroupsAll, sportGroups] = await Promise.all([
    fetchTop3Map(),
    fetchSoccerCountryGroups("en"),
    fetchSportGroups(PREDICTION_PAGE_CODES, "en"),
  ]);
  // 야구 종목 그룹 앞 + 축구는 핵심 국가만 (전체 순위는 /standings — view 에 진입 링크)
  const soccerGroups = soccerGroupsAll
    .filter((g) => PREDICTIONS_SUMMARY_COUNTRIES.has(g.country))
    .map((g) => ({
      ...g,
      leagues: g.leagues.filter((l) => PREDICTION_PAGE_CODES.has(l.league)),
    }))
    .filter((g) => g.leagues.length > 0);
  const countryGroups = [...sportGroups, ...soccerGroups];
  const fifaRanking = buildFifaRanking();
  const clubRanking = buildClubRanking();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(PREDICTIONS_JSONLD) }}
      />
      <AmbientGlow />
      <PredictionsView
        top3={top3}
        countryGroups={countryGroups}
        fifaRanking={fifaRanking}
        fifaDate={FIFA_RANKING_DATE}
        clubRanking={clubRanking}
      />
    </>
  );
}
