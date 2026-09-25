// 야구 선수 스탯 마스터 표 — KBO·MLB·NPB. 데이터·열·규정만 여기서 정하고 화면은 StatsExplorer 공용.
// 계산: src/lib/sports/baseball/stats-table.ts · 데이터: player-rankings.getBbLeagueData (매일 갱신)
import type { Metadata } from "next";
import { breadcrumbLd, datasetLd } from "@/lib/seo/jsonld";
import StatsExplorer from "@/components/stats/StatsExplorer";
import { BB_LEAGUES, getBbLeagueData, type BbLeague, type BbRole } from "@/lib/sports/baseball/player-rankings";
import { buildStatRows, columnsFor, type StatRow, type StatUnit } from "@/lib/sports/baseball/stats-table";
import { fetchMlbSeasonAdvancedCached } from "@/lib/sports/mlb-cache";
import { kboPhotoUrl } from "@/lib/sports/kbo-official";
import { npbPlayerPhoto } from "@/lib/sports/npb-player-ko";

export const dynamic = "force-dynamic";

const ROLE_KO: Record<BbRole, string> = { bat: "타자", pit: "투수" };
type SP = Record<string, string | undefined>;

function parse(sp: SP) {
  const league: BbLeague = (BB_LEAGUES as string[]).includes(sp.league ?? "") ? (sp.league as BbLeague) : "KBO";
  const role: BbRole = sp.role === "pit" ? "pit" : "bat";
  const unit: StatUnit = sp.unit === "pergame" ? "pergame" : "total";
  return { league, role, unit };
}

// 구글 검색어(한국, 2026-09 Keyword Tool) — 사람들은 "스탯 표"가 아니라 "타율 순위"로 찾는다.
// 프로야구 타율 순위 880·2026 프로야구 타율 순위 480·KBO 타율 순위 320·MLB 타율 순위 1,300·
// 메이저리그 타율 순위 1,300·프로야구 타격 순위 3,600. 투수는 평균자책점(방어율) 순위.
const LG_KO: Record<BbLeague, string> = { KBO: "프로야구", MLB: "MLB", NPB: "일본프로야구" };
const LG_SUB: Record<BbLeague, string> = { KBO: "KBO", MLB: "메이저리그", NPB: "NPB" };

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const { league, role, unit } = parse(await searchParams);
  // 시즌은 데이터에서 — 달력으로 추정하면 개막 전 두 달간 틀린 연도가 나간다.
  const season = (await getBbLeagueData(league).catch(() => null))?.season ?? "";
  const yr = season ? `${season} ` : "";
  const head = role === "bat" ? "타율 순위·홈런·OPS" : "평균자책점 순위·탈삼진";
  return {
    title: `${yr}${LG_KO[league]} ${head} — ${LG_SUB[league]} ${ROLE_KO[role]} 기록${unit === "pergame" ? " (경기당)" : ""}`,
    description:
      role === "bat"
        ? `${yr}${LG_KO[league]} 타율 순위·홈런 순위·타격 순위를 한 표에서. ${LG_SUB[league]} 타자 전원의 시즌 기록을 정렬·검색하고 셀마다 리그 백분위를 확인하세요.`
        : `${yr}${LG_KO[league]} 평균자책점(방어율) 순위·탈삼진·다승을 한 표에서. ${LG_SUB[league]} 투수 전원의 시즌 기록을 정렬·검색하고 셀마다 리그 백분위를 확인하세요.`,
    alternates: { canonical: `/baseball/stats?league=${league}&role=${role}` },
    keywords:
      role === "bat"
        ? [`${yr}${LG_KO[league]} 타율 순위`, `${league} 타율 순위`, `${LG_SUB[league]} 타율 순위`, `${LG_KO[league]} 홈런 순위`, `${LG_KO[league]} 타격 순위`, `${league} 타자 기록`]
        : [`${yr}${LG_KO[league]} 방어율 순위`, `${league} 평균자책점 순위`, `${LG_KO[league]} 탈삼진 순위`, `${league} 투수 기록`],
    openGraph: { title: `${yr}${LG_KO[league]} ${head}`, description: `${LG_SUB[league]} ${ROLE_KO[role]} 전원의 시즌 기록과 리그 백분위를 한 표에서.` },
  };
}

export default async function BaseballStatsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { league, role, unit } = parse(sp);
  const data = await getBbLeagueData(league);
  const cols = columnsFor(role, league);
  // MLB 만 statsapi 성분으로 확장 열(wOBA·ISO·BB%·K% / FIP·K%·BB%·HR/9). 실패하면 열은 남고 값은 "—".
  const adv = league === "MLB" ? await fetchMlbSeasonAdvancedCached(Number(data.season)).catch(() => undefined) : undefined;
  const built = buildStatRows(data.rows, role, unit, cols, adv);
  const decorate = (r: StatRow) => ({
    photo: league === "KBO" && r.externalId ? kboPhotoUrl(r.externalId) : league === "MLB" && r.externalId ? `https://midfield.mlbstatic.com/v1/people/${r.externalId}/spots/120` : league === "NPB" && r.logId ? npbPlayerPhoto(r.logId) ?? null : null,
    href: league === "KBO" && r.externalId ? `/players/${r.externalId}?league=KBO` : league === "MLB" && r.externalId ? `/players/${r.externalId}` : league === "NPB" && r.logId ? `/players/${r.logId}?league=NPB` : null,
    sub: r.team,
  });
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (v) params[k] = v;
  return (
    <StatsExplorer
      basePath="/baseball/stats"
      jsonLd={[
        breadcrumbLd([{ name: "홈", path: "/" }, { name: "야구", path: "/baseball" }, { name: "선수 스탯 표", path: "/baseball/stats" }, { name: `${league} ${ROLE_KO[role]}`, path: `/baseball/stats?league=${league}&role=${role}` }]),
        datasetLd({ name: `${league} ${data.season} 시즌 ${ROLE_KO[role]} 스탯 표`, description: `${league} ${ROLE_KO[role]} ${data.rows.length}명의 ${data.season} 시즌 기록과 리그 백분위(규정 ${built.qualifiedCount}명).`, path: `/baseball/stats?league=${league}&role=${role}`, variableMeasured: cols.map((c) => c.label), temporalCoverage: String(data.season) }),
      ]}
      eyebrow="Player Stats"
      title="야구 선수 스탯"
      subtitle={`${data.season} 시즌 ${league} ${ROLE_KO[role]} 전원. 셀 아래 숫자는 규정 표본 안 리그 백분위(높을수록 상위, ERA·WHIP·패는 낮을수록 상위). 규정 = ${role === "bat" ? `${built.minGames}경기 이상 출장` : "30이닝 이상"} (${built.qualifiedCount}명).`}
      links={[{ href: "/baseball/rankings", label: "선수 랭킹" }, { href: "/baseball", label: "야구 허브" }, { href: "/soccer/stats", label: "축구 스탯 표" }, { href: "/hockey/stats", label: "하키 스탯 표" }]}
      pills={[
        { param: "league", options: BB_LEAGUES.map((l) => ({ value: l, label: l })), value: league, resets: ["team"] },
        { param: "role", options: [{ value: "bat", label: "타자" }, { value: "pit", label: "투수" }], value: role },
        { param: "unit", options: [{ value: "total", label: "합계" }, { value: "pergame", label: "경기당" }], value: unit },
      ]}
      params={{ ...params, league, role, unit }}
      cols={cols}
      rows={built.rows}
      unit={unit}
      decorate={decorate}
      defaultSort={role === "bat" ? "ops" : "era"}
      scatterDefault={role === "bat" ? { x: "avg", y: "ops" } : { x: "era", y: "whip" }}
      qualifiedCount={built.qualifiedCount}
      glossaryNote={`백분위는 같은 리그·같은 역할의 규정 선수(${built.qualifiedCount}명) 안에서 나보다 못한 값의 비율. 동률은 절반만 센다.`}
      corner={`${data.season} · ${league}`}
      footnote={`출처: KBO·NPB 공식, MLB Stats API (매일 갱신). 백분위는 같은 리그·같은 역할의 규정 선수끼리 비교한 값이며, 규정 미달 선수는 표에 남기되 백분위를 매기지 않는다. 경기당은 합계 계열(안타·홈런·타점·이닝·탈삼진·승·패·세이브)만 출장 경기로 나눈 값이다.${league === "MLB" ? " MLB 확장 열 wOBA(FanGraphs 선형가중치)·ISO·BB%·K% / FIP(상수 3.15 고정)·K%·BB%·HR/9 는 MLB Stats API 시즌 성분에서 계산." : ""}`}
    />
  );
}
