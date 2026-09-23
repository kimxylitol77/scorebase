// 축구 선수 스탯 마스터 표 — 15개 리그 ts 시즌 아카이브. 데이터·열·규정만 정하고 화면은 StatsExplorer 공용.
// 계산: src/lib/sports/soccer/stats-table.ts · 로더: stats-data.ts
import type { Metadata } from "next";
import StatsExplorer from "@/components/stats/StatsExplorer";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import type { StatRow } from "@/lib/sports/baseball/stats-table";
import { buildSoccerStatRows, columnsForPos, type SoccerPos, type SoccerUnit } from "@/lib/sports/soccer/stats-table";
import { getSoccerStatsData, SOCCER_STATS_LEAGUES, type SoccerStatsLeague } from "@/lib/sports/soccer/stats-data";

export const dynamic = "force-dynamic";

const POS_KO: Record<SoccerPos, string> = { ALL: "필드 전체", G: "GK", D: "DF", M: "MF", F: "FW" };
type SP = Record<string, string | undefined>;

function parse(sp: SP) {
  const league: SoccerStatsLeague = (SOCCER_STATS_LEAGUES as readonly string[]).includes(sp.league ?? "") ? (sp.league as SoccerStatsLeague) : "EPL";
  const pos: SoccerPos = (["G", "D", "M", "F"] as string[]).includes(sp.pos ?? "") ? (sp.pos as SoccerPos) : "ALL";
  const unit: SoccerUnit = sp.unit === "per90" ? "per90" : "total";
  return { league, pos, unit };
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const { league, pos, unit } = parse(await searchParams);
  const lg = LEAGUE_DISPLAY[league] ?? league;
  return {
    title: `${lg} ${POS_KO[pos]} 선수 스탯 표 — 시즌 기록·리그 백분위${unit === "per90" ? " (90분당)" : ""}`,
    description: `${lg} 선수 전원의 시즌 골·도움·슈팅·키패스·태클·평점을 한 표에서 정렬·검색하고 셀마다 리그 백분위를 확인하는 스코어베이스 축구 스탯 표.`,
    alternates: { canonical: `/soccer/stats?league=${league}${pos !== "ALL" ? `&pos=${pos}` : ""}` },
  };
}

export default async function SoccerStatsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { league, pos, unit } = parse(sp);
  const data = await getSoccerStatsData(league);
  const cols = columnsForPos(pos);
  const built = buildSoccerStatRows(data.rows, pos, unit);
  const byId = new Map(data.rows.map((r) => [r.playerId, r]));
  const decorate = (r: StatRow) => { const s = byId.get(r.key); return { photo: s?.photo ?? null, href: `/transfers/${r.key}`, sub: `${r.team}${s?.pos ? ` · ${s.pos}` : ""}` }; };
  const lgName = LEAGUE_DISPLAY[league] ?? league;
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (v) params[k] = v;
  return (
    <StatsExplorer
      basePath="/soccer/stats"
      eyebrow="Player Stats"
      title="축구 선수 스탯"
      subtitle={`${data.season} 시즌 ${lgName} ${POS_KO[pos]}. 셀 아래 숫자는 규정 표본 안 리그 백분위(높을수록 상위, 실점·경고는 낮을수록 상위). 규정 = 리그 최다 출전 분의 40% 이상(${built.minMinutes}분, ${built.qualifiedCount}명).${data.ratingCoverage === 0 ? " 이 리그는 경기 로그 평점이 없어 평점 열이 비어 있다." : ""}`}
      links={[{ href: "/baseball/stats", label: "야구 스탯 표" }, { href: "/hockey/stats", label: "하키 스탯 표" }, { href: "/transfers?view=power", label: "선수 랭킹" }, { href: "/soccer", label: "축구 허브" }]}
      pills={[
        { param: "league", style: "chips", options: SOCCER_STATS_LEAGUES.map((l) => ({ value: l, label: LEAGUE_DISPLAY[l] ?? l })), value: league, resets: ["team"] },
        { param: "pos", options: (["ALL", "F", "M", "D", "G"] as SoccerPos[]).map((x) => ({ value: x, label: POS_KO[x] })), value: pos },
        { param: "unit", options: [{ value: "total", label: "합계" }, { value: "per90", label: "90분당" }], value: unit },
      ]}
      params={{ ...params, league, pos, unit }}
      cols={cols}
      rows={built.rows}
      unit={unit === "per90" ? "pergame" : "total"}
      decorate={decorate}
      defaultSort={pos === "G" ? "saves" : "goals"}
      scatterDefault={pos === "G" ? { x: "saves", y: "conceded" } : { x: "shots", y: "goals" }}
      qualifiedCount={built.qualifiedCount}
      glossaryNote={`백분위는 같은 리그·같은 포지션 그룹의 규정 선수(${built.qualifiedCount}명) 안에서 나보다 못한 값의 비율. 동률은 절반만 센다.`}
      corner={`${data.season} · ${lgName}`}
      footnote="출처: TheSports 시즌 기록(하루 단위 갱신)·경기 로그 평점(시즌 시작 7/1 이후 전 대회, 10분 이상 출전 분 가중). 백분위는 같은 리그·같은 포지션 그룹의 규정 선수끼리 비교한 값이며, 규정 미달 선수는 표에 남기되 백분위를 매기지 않는다. 90분당은 합계 계열만 출전 분으로 환산한 값이다. xG 는 리그별 소스가 달라 열에서 뺐다."
    />
  );
}
