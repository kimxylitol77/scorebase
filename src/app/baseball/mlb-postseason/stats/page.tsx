// MLB 포스트시즌 선수 통계 — 가을야구 기록만 모은 스탯 표(타자·투수). 화면은 StatsExplorer 공용, 규정만 포스트시즌용.
// 데이터: statsapi gameType=P — lib/sports/baseball/mlb-postseason-stats.ts (10분 캐시). 시즌은 ?season= 으로 따로 —
//   새 포스트시즌이 시작돼도 지난 시즌 표는 그대로 남는다. 기본은 기록이 있는 가장 최근 시즌.
import type { Metadata } from "next";
import { breadcrumbLd, datasetLd } from "@/lib/seo/jsonld";
import StatsExplorer from "@/components/stats/StatsExplorer";
import type { BbRole } from "@/lib/sports/baseball/player-rankings";
import { buildStatRows, columnsFor, type StatRow, type StatUnit } from "@/lib/sports/baseball/stats-table";
import { getMlbPostseasonStats } from "@/lib/sports/baseball/mlb-postseason-stats";
import { currentMlbSeason } from "@/lib/sports/mlb-postseason";

export const dynamic = "force-dynamic";

const PATH = "/baseball/mlb-postseason/stats";
const ROLE_KO: Record<BbRole, string> = { bat: "타자", pit: "투수" };
/** 시즌 버튼 개수 — 기록이 있는 가장 최근 시즌부터 */
const SEASON_COUNT = 5;
type SP = Record<string, string | undefined>;

function parse(sp: SP) {
  const role: BbRole = sp.role === "pit" ? "pit" : "bat";
  const unit: StatUnit = sp.unit === "pergame" ? "pergame" : "total";
  return { role, unit };
}

/** 올해 포스트시즌 기록이 생기기 전엔 지난 시즌이 최신. 요청 시즌이 목록 밖이면 최신. */
async function resolveSeason(sp: SP) {
  const current = currentMlbSeason();
  const currentData = await getMlbPostseasonStats(current);
  const latest = currentData ? current : current - 1;
  const seasons = Array.from({ length: SEASON_COUNT }, (_, i) => latest - i);
  const asked = Number(sp.season);
  const season = seasons.includes(asked) ? asked : latest;
  const data = season === current ? currentData : await getMlbPostseasonStats(season);
  return { current, latest, seasons, season, data };
}

/** 최신 시즌은 파라미터 없는 주소, 지난 시즌은 ?season= 주소가 정본 */
const canonicalOf = (season: number, latest: number, role: BbRole) => (season === latest ? `${PATH}?role=${role}` : `${PATH}?season=${season}&role=${role}`);

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const { role } = parse(sp);
  const { season, latest } = await resolveSeason(sp);
  const head = role === "bat" ? "타율·홈런·OPS" : "평균자책점·탈삼진";
  return {
    title: `${season} MLB 포스트시즌 ${ROLE_KO[role]} 기록 — 가을야구 ${head} 순위`,
    description: `${season} MLB 포스트시즌(와일드카드~월드시리즈) ${ROLE_KO[role]} 전원의 가을야구 기록만 모은 표. ${head}를 정렬·검색하고 셀마다 포스트시즌 백분위를 확인하세요.`,
    alternates: { canonical: canonicalOf(season, latest, role) },
    keywords: [`MLB 포스트시즌 ${ROLE_KO[role]} 기록`, "MLB 포스트시즌 기록", "포스트시즌 타율", "포스트시즌 홈런", "가을야구 기록", "월드시리즈 기록", "MLB 플레이오프 선수 기록"],
    openGraph: { title: `${season} MLB 포스트시즌 ${ROLE_KO[role]} 기록`, description: `와일드카드부터 월드시리즈까지 ${ROLE_KO[role]} 가을야구 기록과 백분위를 한 표에서.` },
  };
}

export default async function MlbPostseasonStatsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { role, unit } = parse(sp);
  const { current, latest, seasons, season, data } = await resolveSeason(sp);
  const path = canonicalOf(season, latest, role);
  const cols = columnsFor(role, "MLB");
  const built = data
    ? buildStatRows(role === "bat" ? data.bat : data.pit, role, unit, cols, data.adv, data.minIp)
    : { rows: [], qualifiedCount: 0, minGames: 0 };
  const decorate = (r: StatRow) => ({
    photo: r.externalId ? `https://midfield.mlbstatic.com/v1/people/${r.externalId}/spots/120` : null,
    href: r.externalId ? `/players/${r.externalId}` : null,
    sub: r.team,
  });
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (v) params[k] = v;
  const rule = role === "bat" ? `최다 출장의 절반인 ${built.minGames}경기 이상` : `최다 이닝의 4분의 1인 ${data?.minIp ?? 1}이닝 이상`;
  const lead = !data
    ? "MLB 공식 기록을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요."
    : latest !== current && season === latest
      ? `${current} 포스트시즌은 아직 경기 전이라 ${season} 포스트시즌 기록입니다. 첫 경기가 끝나면 ${current} 시즌 버튼이 생기고, ${season} 기록은 시즌 버튼으로 계속 볼 수 있습니다.`
      : `${season} 포스트시즌(와일드카드~월드시리즈) 기록입니다.`;
  return (
    <StatsExplorer
      basePath={PATH}
      jsonLd={[
        breadcrumbLd([{ name: "홈", path: "/" }, { name: "야구", path: "/baseball" }, { name: "MLB 포스트시즌 대진표", path: "/baseball/mlb-postseason" }, { name: `${season} 포스트시즌 ${ROLE_KO[role]} 기록`, path }]),
        datasetLd({ name: `${season} MLB 포스트시즌 ${ROLE_KO[role]} 기록`, description: `${season} MLB 포스트시즌 ${ROLE_KO[role]} ${built.rows.length}명의 기록과 포스트시즌 백분위(규정 ${built.qualifiedCount}명).`, path, variableMeasured: cols.map((c) => c.label), temporalCoverage: String(season) }),
      ]}
      eyebrow={`MLB Postseason ${season}`}
      title={`${season} MLB 포스트시즌 선수 통계`}
      subtitle={`${lead} 셀 아래 숫자는 포스트시즌 규정 선수 안 백분위(높을수록 상위, ERA·WHIP·패 등은 낮을수록 상위). 규정 = ${rule} (${built.qualifiedCount}명).`}
      links={[{ href: "/baseball/mlb-postseason", label: "포스트시즌 대진표" }, { href: "/baseball/stats?league=MLB", label: "정규시즌 스탯 표" }, { href: "/baseball", label: "야구 허브" }]}
      pills={[
        { param: "season", options: seasons.map((y) => ({ value: String(y), label: String(y) })), value: String(season), resets: ["team", "cmp"] },
        { param: "role", options: [{ value: "bat", label: "타자" }, { value: "pit", label: "투수" }], value: role },
        { param: "unit", options: [{ value: "total", label: "합계" }, { value: "pergame", label: "경기당" }], value: unit },
      ]}
      params={{ ...params, season: String(season), role, unit }}
      cols={cols}
      rows={built.rows}
      unit={unit}
      decorate={decorate}
      defaultSort={role === "bat" ? "ops" : "era"}
      scatterDefault={role === "bat" ? { x: "avg", y: "ops" } : { x: "era", y: "whip" }}
      qualifiedCount={built.qualifiedCount}
      glossaryNote={`백분위는 같은 포스트시즌 같은 역할의 규정 선수(${built.qualifiedCount}명) 안에서 나보다 못한 값의 비율. 동률은 절반만 센다. 포스트시즌은 표본이 짧아 한두 경기로 크게 흔들린다.`}
      corner={`${season} · MLB PS`}
      footnote={`출처: MLB Stats API 포스트시즌 기록(10분마다 갱신). 와일드카드·디비전·챔피언십·월드시리즈 합산이며 정규시즌 기록은 들어가지 않는다. 규정은 정규시즌(30이닝)이 가을야구에 맞지 않아 타자는 최다 출장의 50%, 투수는 최다 이닝의 25%로 따로 잡았고, 미달 선수는 표에 남기되 백분위를 매기지 않는다. 확장 열 wOBA(FanGraphs 선형가중치)·ISO·BB%·K% / FIP(상수 3.15 고정)·K%·BB%·HR/9 는 같은 포스트시즌 성분에서 계산.`}
    />
  );
}
