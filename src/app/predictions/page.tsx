// /predictions 인덱스 — 리그 카드 grid + 국가별 standings.
// 데이터 fetch 는 server, UI/motion 은 _view.tsx (client).
import type { Metadata } from "next";
import {
  safeFetchTop3,
  fetchSoccerCountryGroups,
  fetchSportGroups,
} from "@/lib/sports/standings-overview";
import { toKoreanTeamName } from "@/lib/team-names";
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
import rawClubRankings from "../../../data/club-rankings.json";

// 세계 클럽 랭킹 top5 — 대시보드 FIFA 랭킹 옆 카드용 (정적 JSON)
const CLUB_RANKINGS = rawClubRankings as { rank: number; name: string; logo: string | null }[];

export const revalidate = 600; // ISR — force-dynamic 제거(2026-07-02, searchParams 없음)

export const metadata: Metadata = {
  title: "시즌 예측 — 우승 확률·플레이오프·리더보드",
  description:
    "시즌 우승·플레이오프·강등 확률과 득점·홈런·타율·ERA 리더보드를 Monte Carlo 5,000회 + Elo 레이팅으로 분석합니다. EPL·라리가·K리그·KBO·MLB·NPB·NBA·NHL·LCK — 전체 리그 순위는 순위 허브에서.",
  alternates: { canonical: "/predictions" },
  keywords: [
    "시즌 예측", "우승 확률", "강등 확률", "플레이오프 확률",
    "Monte Carlo 시뮬레이션", "Elo 레이팅",
    "리그 순위", "리그 리더보드", "득점왕", "도움왕", "득점 순위", "어시스트 순위",
    "EPL 순위", "라리가 순위", "라리가 득점왕",
    "홈런 순위", "타율 순위", "ERA 순위", "다승", "탈삼진", "KBO 홈런왕", "MLB 홈런",
    "NBA 득점 순위", "NBA 리바운드",
    "FIFA 랭킹", "축구 국가대표 순위",
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
      const top3 = await safeFetchTop3(league);
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
  "대한민국", "잉글랜드", "스페인", "독일", "이탈리아", "프랑스",
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
      name: "스코어베이스 시즌 우승 확률 예측",
      description:
        "19개 리그 시즌 시뮬레이션 — Monte Carlo 5,000회 + Elo 레이팅 기반 우승·플레이오프·강등 확률.",
      url: `${SITE_URL}/predictions`,
      keywords: ["시즌 우승 확률", "Monte Carlo 시뮬레이션", "Elo 레이팅 예측"],
      creator: { "@type": "Organization", name: "스코어베이스", url: SITE_URL },
      isAccessibleForFree: true,
      measurementTechnique: "Monte Carlo 시뮬레이션(5,000회) + Elo 레이팅",
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "시즌 예측", item: `${SITE_URL}/predictions` },
      ],
    },
    {
      "@type": "ItemList",
      name: "리그별 시즌 예측",
      description: "리그별 우승·플레이오프·강등 확률, 순위표, 시즌 리더보드 페이지.",
      numberOfItems: LEAGUE_LD_ITEMS.length,
      itemListElement: LEAGUE_LD_ITEMS.map((l, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: `${l.label} 시즌 예측`,
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
    name: fifaCountryKo(r.name) ?? toKoreanTeamName(r.name, "INTL_FRIENDLY"),
    flag: fifaFlag(r.name),
  }));
}

// 세계 클럽 랭킹 top5 — 한글 클럽명 + 로고
function buildClubRanking(): { rank: number; name: string; logo: string | null }[] {
  return CLUB_RANKINGS.slice(0, 5).map((c) => ({ rank: c.rank, name: toKoreanTeamName(c.name) || c.name, logo: c.logo }));
}

export default async function PredictionsRoot() {
  const [top3, soccerGroupsAll, sportGroups] = await Promise.all([
    fetchTop3Map(),
    fetchSoccerCountryGroups(),
    fetchSportGroups(PREDICTION_PAGE_CODES),
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(PREDICTIONS_JSONLD) }}
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
