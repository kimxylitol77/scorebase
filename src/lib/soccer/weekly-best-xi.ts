// 리그 주간 베스트 XI·MVP — 지난 7일 완료 경기의 ts 선수 평점으로 산출.
// 선정·배치 로직은 월드컵 '오늘의 베스트 XI'(team-of-day) 엔진을 리그 창으로 재사용한다.
// 집계 창을 라운드가 아니라 날짜로 잡는 이유 — 라리가 개막처럼 한 라운드가 목~월에 걸쳐
// 흐르고 다음 라운드와 겹치면 라운드 경계로는 매주 집계가 무너진다(2026-08 실측).
import { prisma } from "@/lib/db";
import { getTeamOfDay, type TodPlayer } from "@/lib/sports/thesports/team-of-day";
import { toKoreanTeamName } from "@/lib/team-names";

/** 주간 베스트 XI 대상 리그 — 빅5. */
export const WEEKLY_XI_LEAGUES = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"] as const;

/** 이 주에 완료 경기가 이보다 적으면 베스트 XI 표본으로 못 쓴다(개막 주·A매치 브레이크 방어). */
export const MIN_WEEK_MATCHES = 3;

export interface WeeklyBestXi {
  league: string;
  from: string; // KST YYYY-MM-DD (포함)
  to: string; // KST YYYY-MM-DD (포함)
  matchCount: number;
  matches: { home: string; away: string; homeKo: string; awayKo: string; homeScore: number | null; awayScore: number | null }[];
  xi: TodPlayer[];
  bench: TodPlayer[];
  mvp: TodPlayer | null;
  /** 영문 팀명 → 엠블럼. 클럽은 국기가 없어 이걸로 표시한다. */
  logoByTeam: Record<string, string | null>;
  complete: boolean;
}

const kstDay = (d: Date) => new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 10);

/** KST 날짜 문자열의 00:00 에 해당하는 UTC 시각. */
const kstMidnightUtc = (dateKst: string) => new Date(Date.parse(`${dateKst}T00:00:00Z`) - 9 * 3600000);

/**
 * @param endKst 집계 마지막 날(KST, 포함). 미지정 시 오늘.
 * 창은 [endKst-6, endKst] 7일.
 */
export async function getWeeklyBestXi(league: string, endKst?: string): Promise<WeeklyBestXi | null> {
  const to = endKst ?? kstDay(new Date());
  const lt = new Date(kstMidnightUtc(to).getTime() + 86400000);
  const gte = new Date(lt.getTime() - 7 * 86400000);
  const from = kstDay(gte);

  const tod = await getTeamOfDay(undefined, undefined, { league, gte, lt, label: to });
  if (!tod) return null;

  // 팀 엠블럼 — 이름 정확 일치만. 못 찾으면 로고 없이(장식이라 렌더를 죽이지 않는다).
  const teams = await prisma.team.findMany({ where: { league }, select: { name: true, logoUrl: true } });
  const logoByTeam: Record<string, string | null> = {};
  const byName = new Map(teams.map((t) => [t.name, t.logoUrl]));
  for (const p of [...tod.xi, ...tod.bench]) logoByTeam[p.country] = byName.get(p.country) ?? null;
  for (const m of tod.matches) {
    logoByTeam[m.home] = byName.get(m.home) ?? null;
    logoByTeam[m.away] = byName.get(m.away) ?? null;
  }

  // MVP — 베스트 XI 중 최고 평점. 동점이면 골 → 도움 순.
  const mvp = [...tod.xi].sort((a, b) => b.rating - a.rating || b.goals - a.goals || b.assists - a.assists)[0] ?? null;

  return {
    league,
    from,
    to,
    matchCount: tod.matchCount,
    matches: tod.matches,
    xi: tod.xi,
    bench: tod.bench,
    mvp,
    logoByTeam,
    complete: tod.complete,
  };
}

/** 프롬프트·본문에 넣을 결정론적 사실 브리핑. 여기 없는 수치는 글에 쓰지 않는다. */
export function weeklyXiBrief(w: WeeklyBestXi, leagueKo: string): string {
  const line = (p: TodPlayer) =>
    `${p.name}(${p.countryKo}, ${p.pos}) 평점 ${p.rating}` +
    (p.goals ? ` 골 ${p.goals}` : "") +
    (p.assists ? ` 도움 ${p.assists}` : "") +
    (p.captain ? " 주장" : "");
  return [
    `리그: ${leagueKo} / 집계 기간: ${w.from} ~ ${w.to} (KST) / 완료 경기 ${w.matchCount}경기`,
    `경기 결과: ${w.matches.map((m) => `${m.homeKo} ${m.homeScore ?? "-"}-${m.awayScore ?? "-"} ${m.awayKo}`).join(" / ")}`,
    `MVP: ${w.mvp ? line(w.mvp) : "없음"}`,
    `베스트 XI:`,
    ...w.xi.map((p) => `  - ${line(p)}`),
    w.bench.length ? `아쉽게 빠진 선수: ${w.bench.map((p) => `${p.name} 평점 ${p.rating}`).join(", ")}` : "",
  ].filter(Boolean).join("\n");
}
