// 하키(NHL) 선수 스탯 마스터 표 — 스케이터/골리, 셀마다 리그 백분위, 합계·경기당. 화면은 StatsExplorer 공용.
// 계산: src/lib/sports/hockey/stats-table.ts · 로더: stats-data.ts (NHL 공식 stats API)
import type { Metadata } from "next";
import StatsExplorer from "@/components/stats/StatsExplorer";
import type { StatRow } from "@/lib/sports/baseball/stats-table";
import { buildHockeyStatRows, columnsForRole, type HockeyRole, type HockeyUnit } from "@/lib/sports/hockey/stats-table";
import { getNhlStatsData } from "@/lib/sports/hockey/stats-data";

export const dynamic = "force-dynamic";
const ROLE_KO: Record<HockeyRole, string> = { skater: "스케이터", goalie: "골리" };
type SP = Record<string, string | undefined>;

function parse(sp: SP) {
  const role: HockeyRole = sp.role === "goalie" ? "goalie" : "skater";
  const unit: HockeyUnit = sp.unit === "pergame" ? "pergame" : "total";
  return { role, unit };
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const { role, unit } = parse(await searchParams);
  return {
    title: `NHL ${ROLE_KO[role]} 스탯 표 — 시즌 기록·리그 백분위${unit === "pergame" ? " (경기당)" : ""}`,
    description: `NHL ${ROLE_KO[role]} 전원의 시즌 골·어시스트·포인트·+/-·히트·블록 (골리 GAA·세이브율)을 한 표에서 정렬·검색하고 셀마다 리그 백분위를 확인하는 스코어베이스 하키 스탯 표.`,
    alternates: { canonical: `/hockey/stats?role=${role}` },
  };
}

export default async function HockeyStatsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { role, unit } = parse(sp);
  const data = await getNhlStatsData();
  const cols = columnsForRole(role);
  const built = buildHockeyStatRows(data.rows, role, unit);
  const byId = new Map(data.rows.map((r) => [String(r.playerId), r]));
  const teamAbbr = new Map<string, string>();
  for (const r of data.rows) teamAbbr.set(String(r.playerId), r.team);
  const decorate = (r: StatRow) => {
    const s = byId.get(r.key);
    return { photo: null, href: `/players/${r.key}?league=NHL`, sub: `${r.team}${s?.pos ? ` · ${s.pos}` : ""}` };
  };
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (v) params[k] = v;
  return (
    <StatsExplorer
      basePath="/hockey/stats"
      eyebrow="Player Stats"
      title="하키 선수 스탯"
      subtitle={`NHL ${data.seasonLabel} 시즌${data.final ? "(최종, 새 시즌 개막 전)" : ""} ${ROLE_KO[role]} 전원. 셀 아래 숫자는 규정 표본 안 리그 백분위(높을수록 상위, PIM·패·GAA 는 낮을수록 상위). 규정 = ${role === "goalie" ? "선발" : "출전"} 최다의 40% 이상(${built.minGp}경기, ${built.qualifiedCount}명).`}
      links={[{ href: "/baseball/stats", label: "야구 스탯 표" }, { href: "/soccer/stats", label: "축구 스탯 표" }, { href: "/standings/NHL", label: "NHL 순위표" }, { href: "/hockey", label: "하키 허브" }]}
      pills={[
        { param: "role", options: [{ value: "skater", label: "스케이터" }, { value: "goalie", label: "골리" }], value: role },
        { param: "unit", options: [{ value: "total", label: "합계" }, { value: "pergame", label: "경기당" }], value: unit },
      ]}
      params={{ ...params, role, unit }}
      cols={cols}
      rows={built.rows}
      unit={unit}
      decorate={decorate}
      defaultSort={role === "goalie" ? "savePct" : "points"}
      scatterDefault={role === "goalie" ? { x: "gaa", y: "savePct" } : { x: "shots", y: "goals" }}
      qualifiedCount={built.qualifiedCount}
      glossaryNote={`백분위는 같은 역할의 규정 선수(${built.qualifiedCount}명) 안에서 나보다 못한 값의 비율. 동률은 절반만 센다.`}
      corner={`${data.seasonLabel} · NHL`}
      footnote="출처: NHL 공식 통계 API(정규시즌, 6시간 캐시). 히트·블록은 리얼타임 리포트, 나머지는 요약 리포트. 백분위는 같은 역할(스케이터/골리)의 규정 선수끼리 비교한 값이며, 규정 미달 선수는 표에 남기되 백분위를 매기지 않는다. 경기당은 합계 계열만 출전 경기로 나눈 값이다. KHL 등 다른 리그는 시즌 선수 통계 API 가 없어 아직 없다."
    />
  );
}
