// 월드컵 조별리그 순위 + 조 3위 와일드카드 레이스 — DB Match(FINISHED) 직접 계산.
// 2026 48개국 체제: 각 조 1·2위(24팀) + 12개 조 3위 중 상위 8팀이 32강 진출.
// 3위 간 순위: 승점 → 득실차 → 다득점 (FIFA 규정의 페어플레이 점수·추첨은 미반영, UI 에 명시).
import { prisma } from "@/lib/db";
import { WORLD_CUP_GROUPS } from "@/lib/predict/world-cup-elos";

export interface WcGroupTeamRow {
  team: string; // 영문 팀명
  group: string; // A~L
  played: number;
  won: number;
  draw: number;
  loss: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  /** 조 내 순위 (1~4) */
  posInGroup: number;
}

const GROUP_STAGE_END = "2026-06-28"; // 조별 3차전 종료(6/27) + 버퍼

function teamToGroup(): Map<string, string> {
  const m = new Map<string, string>();
  for (const [g, names] of Object.entries(WORLD_CUP_GROUPS)) for (const n of names) m.set(n, g);
  return m;
}

/** 조별리그 전체 순위 계산 — FINISHED 매치만, 같은 조 두 팀 간 경기만 집계. */
export async function getWcGroupStandings(): Promise<Map<string, WcGroupTeamRow[]>> {
  const grpOf = teamToGroup();
  const rows = new Map<string, WcGroupTeamRow>(); // team → row
  for (const [team, group] of grpOf) {
    rows.set(team, { team, group, played: 0, won: 0, draw: 0, loss: 0, gf: 0, ga: 0, gd: 0, pts: 0, posInGroup: 0 });
  }

  const matches = await prisma.match.findMany({
    where: {
      league: "WORLD_CUP",
      status: "FINISHED",
      startTime: { lte: new Date(`${GROUP_STAGE_END}T23:59:59+09:00`) },
    },
    select: {
      homeScore: true,
      awayScore: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  for (const m of matches) {
    const h = rows.get(m.homeTeam.name);
    const a = rows.get(m.awayTeam.name);
    // 같은 조 두 팀 간 경기만 (친선·토너먼트 오염 방지)
    if (!h || !a || h.group !== a.group) continue;
    const hs = m.homeScore ?? 0;
    const as = m.awayScore ?? 0;
    h.played++; a.played++;
    h.gf += hs; h.ga += as;
    a.gf += as; a.ga += hs;
    if (hs > as) { h.won++; a.loss++; h.pts += 3; }
    else if (hs < as) { a.won++; h.loss++; a.pts += 3; }
    else { h.draw++; a.draw++; h.pts++; a.pts++; }
  }

  const byGroup = new Map<string, WcGroupTeamRow[]>();
  for (const g of Object.keys(WORLD_CUP_GROUPS)) {
    const list = [...rows.values()].filter((r) => r.group === g);
    list.forEach((r) => { r.gd = r.gf - r.ga; });
    list.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.team.localeCompare(y.team));
    list.forEach((r, i) => { r.posInGroup = i + 1; });
    byGroup.set(g, list);
  }
  return byGroup;
}

/** 12개 조 3위 팀을 와일드카드 기준으로 정렬해 반환 (상위 8팀 32강 진출). */
export async function getWcThirdPlaceRace(): Promise<WcGroupTeamRow[]> {
  const byGroup = await getWcGroupStandings();
  const thirds: WcGroupTeamRow[] = [];
  for (const list of byGroup.values()) {
    const third = list.find((r) => r.posInGroup === 3);
    if (third) thirds.push(third);
  }
  thirds.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.team.localeCompare(y.team));
  return thirds;
}
