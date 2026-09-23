// 농구(KBL) 선수 스탯 마스터 표 — 시즌 평균 전 선수, 셀마다 리그 백분위. 화면은 StatsExplorer 공용.
// 계산: src/lib/sports/basketball/stats-table.ts · 로더: stats-data.ts (KBL 공식 통계 API)
import type { Metadata } from "next";
import { breadcrumbLd, datasetLd } from "@/lib/seo/jsonld";
import StatsExplorer from "@/components/stats/StatsExplorer";
import type { StatRow } from "@/lib/sports/baseball/stats-table";
import { buildBasketballStatRows, KBL_COLUMNS, type BasketballUnit } from "@/lib/sports/basketball/stats-table";
import { getKblStatsData } from "@/lib/sports/basketball/stats-data";
import { kblPlayerPhotoUrl } from "@/lib/sports/kbl-api";
import { kblPosKo } from "@/lib/sports/kbl-players";

export const dynamic = "force-dynamic";
type SP = Record<string, string | undefined>;

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const unit: BasketballUnit = sp.unit === "total" ? "total" : "pergame";
  return {
    title: `KBL 선수 스탯 표 — 시즌 ${unit === "total" ? "합계" : "평균"}·리그 백분위`,
    description: "KBL 선수 전원의 시즌 득점·리바운드·어시스트·3점·야투율·스틸·블록을 한 표에서 정렬·검색하고 셀마다 리그 백분위를 확인하는 스코어베이스 농구 스탯 표.",
    alternates: { canonical: "/basketball/stats" },
    keywords: ["KBL 선수 스탯", "KBL 선수 기록", "KBL 득점 리바운드 순위", "농구 선수 스탯 표", "리그 백분위"],
    openGraph: { title: "KBL 선수 스탯 표", description: "KBL 선수 전원의 시즌 기록과 리그 백분위를 한 표에서." },
  };
}

export default async function BasketballStatsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const unit: BasketballUnit = sp.unit === "total" ? "total" : "pergame";
  const data = await getKblStatsData();
  const built = buildBasketballStatRows(data.rows, unit);
  const byId = new Map(data.rows.map((r) => [r.playerId, r]));
  const decorate = (r: StatRow) => { const s = byId.get(r.key); return { photo: kblPlayerPhotoUrl(r.key), href: `/players/${r.key}?league=KBL`, sub: `${r.team}${s?.pos ? ` · ${kblPosKo(s.pos)}` : ""}` }; };
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (v) params[k] = v;
  return (
    <StatsExplorer
      basePath="/basketball/stats"
      jsonLd={[
        breadcrumbLd([{ name: "홈", path: "/" }, { name: "농구", path: "/basketball" }, { name: "KBL 선수 스탯 표", path: "/basketball/stats" }]),
        datasetLd({ name: `KBL ${data.season} 시즌 선수 스탯 표`, description: `KBL 선수 ${data.rows.length}명의 ${data.season} 시즌 득점·리바운드·어시스트·3점·야투율·스틸·블록과 리그 백분위(규정 ${built.qualifiedCount}명).`, path: "/basketball/stats", variableMeasured: KBL_COLUMNS.map((c) => c.label), temporalCoverage: String(data.season) }),
      ]}
      eyebrow="Player Stats"
      title="농구 선수 스탯"
      subtitle={`KBL ${data.season} 시즌 전 선수. 셀 아래 숫자는 규정 표본 안 리그 백분위(높을수록 상위). 규정 = 출전 최다의 40% 이상(${built.minGp}경기, ${built.qualifiedCount}명).`}
      links={[{ href: "/baseball/stats", label: "야구 스탯 표" }, { href: "/soccer/stats", label: "축구 스탯 표" }, { href: "/hockey/stats", label: "하키 스탯 표" }, { href: "/leagues/KBL", label: "KBL 리그" }, { href: "/basketball", label: "농구 허브" }]}
      pills={[{ param: "unit", options: [{ value: "pergame", label: "경기당" }, { value: "total", label: "합계" }], value: unit }]}
      params={{ ...params, unit }}
      cols={KBL_COLUMNS}
      rows={built.rows}
      unit={unit === "total" ? "total" : "pergame"}
      decorate={decorate}
      defaultSort="pts"
      scatterDefault={{ x: "min", y: "pts" }}
      qualifiedCount={built.qualifiedCount}
      glossaryNote={`백분위는 규정 선수(${built.qualifiedCount}명) 안에서 나보다 못한 값의 비율. 동률은 절반만 센다.`}
      corner={`${data.season} · KBL`}
      footnote="출처: KBL 공식 통계 API(6시간 캐시). 값은 경기당 평균이 원본이며 합계는 평균 × 출전 경기로 환산한 값이다. 백분위는 규정 선수끼리 비교한 값이며, 규정 미달 선수는 표에 남기되 백분위를 매기지 않는다. 비시즌에는 직전 시즌 최종 기록이 보인다. WKBL·NBA 는 전 선수 시즌 통계 소스가 없어 아직 없다."
    />
  );
}
