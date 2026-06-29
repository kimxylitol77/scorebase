// 리그 허브 페이지 공통 — BreadcrumbList JSON-LD 주입.
//  page.tsx 가 view(일정·결과·순위·통계·역사)·종목별로 return 분기가 많아 layout 에서 감싼다.
//  /leagues 인덱스가 없어 breadcrumb 는 2단계(홈 → 리그명). 허브라 Dataset 은 생략.
import type { ReactNode } from "react";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { breadcrumbLd, jsonLdScript } from "@/lib/seo/jsonld";

export default async function LeagueHubLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ league: string }>;
}) {
  const { league } = await params;
  const upper = league.toUpperCase();
  const name = LEAGUE_DISPLAY[upper];
  if (!name) return <>{children}</>;

  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      breadcrumbLd([
        { name: "홈", path: "/" },
        { name: name, path: `/leagues/${upper}` },
      ]),
    ],
  };

  return (
    <>
      {children}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />
    </>
  );
}
