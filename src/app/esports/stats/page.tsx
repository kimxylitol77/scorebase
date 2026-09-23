// e스포츠(LoL) 선수 스탯 마스터 표 — LCK·LPL·LEC·LCS 세트 집계, 셀마다 리그 백분위. 화면은 StatsExplorer 공용.
// 계산: src/lib/sports/esports/stats-table.ts · 로더: stats-data.ts (경기 기록 lolGames 집계)
import type { Metadata } from "next";
import StatsExplorer from "@/components/stats/StatsExplorer";
import type { StatRow } from "@/lib/sports/baseball/stats-table";
import { buildLolStatRows, LOL_COLUMNS, type EsportsUnit } from "@/lib/sports/esports/stats-table";
import { getLolStatsData, LOL_LEAGUE_KO, LOL_STATS_LEAGUES } from "@/lib/sports/esports/stats-data";

export const dynamic = "force-dynamic";
type SP = Record<string, string | undefined>;

function parse(sp: SP) {
  const league = (LOL_STATS_LEAGUES as readonly string[]).includes(sp.league ?? "") ? (sp.league as string) : "LOL";
  const unit: EsportsUnit = sp.unit === "total" ? "total" : "pergame";
  return { league, unit };
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const { league } = parse(await searchParams);
  return {
    title: `${LOL_LEAGUE_KO[league]} 선수 스탯 표 — 시즌 KDA·CS·승률·리그 백분위`,
    description: `${LOL_LEAGUE_KO[league]} 선수 전원의 시즌 킬·데스·어시스트·KDA·CS·승률을 한 표에서 정렬·검색하고 셀마다 리그 백분위를 확인하는 스코어베이스 e스포츠 스탯 표.`,
    alternates: { canonical: `/esports/stats?league=${league}` },
  };
}

export default async function EsportsStatsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { league, unit } = parse(sp);
  const data = await getLolStatsData(league);
  const built = buildLolStatRows(data.rows, unit);
  const byId = new Map(data.rows.map((r) => [r.playerId, r]));
  const decorate = (r: StatRow) => { const s = byId.get(r.key); return { photo: data.photoOf[r.key] ?? null, href: `/players/${r.key}?league=LOL`, sub: `${r.team}${s?.pos ? ` · ${s.pos}` : ""}` }; };
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (v) params[k] = v;
  return (
    <StatsExplorer
      basePath="/esports/stats"
      eyebrow="Player Stats"
      title="e스포츠 선수 스탯"
      subtitle={`${LOL_LEAGUE_KO[league]} ${data.season} 시즌 전 선수(세트 기준). 셀 아래 숫자는 규정 표본 안 리그 백분위(높을수록 상위, 데스는 낮을수록 상위). 규정 = 출전 세트 최다의 40% 이상(${built.minGames}세트, ${built.qualifiedCount}명).`}
      links={[{ href: "/baseball/stats", label: "야구 스탯 표" }, { href: "/soccer/stats", label: "축구 스탯 표" }, { href: "/hockey/stats", label: "하키 스탯 표" }, { href: "/basketball/stats", label: "농구 스탯 표" }, { href: "/leagues/LOL", label: "LCK 리그" }]}
      pills={[
        { param: "league", options: LOL_STATS_LEAGUES.map((l) => ({ value: l, label: LOL_LEAGUE_KO[l] })), value: league, resets: ["team"] },
        { param: "unit", options: [{ value: "pergame", label: "세트당" }, { value: "total", label: "합계" }], value: unit },
      ]}
      params={{ ...params, league, unit }}
      cols={LOL_COLUMNS}
      rows={built.rows}
      unit={unit}
      decorate={decorate}
      defaultSort="kda"
      scatterDefault={{ x: "csPerMin", y: "kda" }}
      qualifiedCount={built.qualifiedCount}
      glossaryNote={`백분위는 규정 선수(${built.qualifiedCount}명) 안에서 나보다 못한 값의 비율. 동률은 절반만 센다.`}
      corner={`${data.season} · ${LOL_LEAGUE_KO[league]}`}
      footnote="출처: 경기 기록(세트별 선수 스탯) 집계, 올해 1/1 이후 전 대회. 세트당은 킬·데스·어시스트를 세트 수로 나눈 값이고 KDA·CS 는 그대로. 백분위는 규정 선수끼리 비교한 값이며, 규정 미달 선수는 표에 남기되 백분위를 매기지 않는다."
    />
  );
}
