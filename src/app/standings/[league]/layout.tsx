// 리그 순위 페이지 공통 — BreadcrumbList + Dataset JSON-LD 주입.
//  page.tsx 가 종목별(WORLD_CUP·배구·NHL·LOL·축구·야구)로 early-return 분기가 많아,
//  layout 에서 감싸면 어느 분기로 렌더되든 구조화 데이터가 항상 붙는다. 리그명만 있으면 됨.
import type { ReactNode } from "react";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { breadcrumbLd, datasetLd, jsonLdScript } from "@/lib/seo/jsonld";

export default async function StandingsLeagueLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ league: string }>;
}) {
  const { league } = await params;
  const upper = league.toUpperCase();
  const name = LEAGUE_DISPLAY[upper];
  // 표시명 없는 코드(미지원/오타)는 page 가 notFound 처리 → JSON-LD 생략.
  if (!name) return <>{children}</>;

  const path = `/standings/${upper}`;
  // 야구(KBO/NPB)는 표가 승률·게임차 기준 — Dataset 서술도 실제 표와 일치시킴 (축구식 승점·득실 아님).
  const isBaseball = upper === "KBO" || upper === "NPB";
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbLd([
        { name: "홈", path: "/" },
        { name: "순위", path: "/standings" },
        { name: `${name} 순위`, path },
      ]),
      datasetLd({
        name: `${name} 순위표`,
        description: isBaseball
          ? `${name} 시즌 팀 순위표 — 순위·승·무·패·승률·게임차를 매일 자동 갱신.`
          : `${name} 시즌 순위표 — 순위·승점·승무패·득점·실점·득실차를 매일 자동 갱신.`,
        path,
        variableMeasured: isBaseball
          ? ["순위", "승", "무", "패", "승률", "게임차"]
          : ["순위", "승점", "승", "무", "패", "득점", "실점", "득실차"],
      }),
    ],
  };

  return (
    <>
      {children}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />
    </>
  );
}
