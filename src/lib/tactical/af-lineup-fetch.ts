// af(api-football) 라인업 런타임 수집 — 기간 내 종료 경기의 formation·coach·XI·grid 를
// 우리 Match 와 팀 쌍 매핑으로 연결해 반환. 월간 이달의 감독 잡이 새 시즌에 사용
// (백필 파일은 25/26 결산 전용 — Vercel 런타임은 data/ 에 쓸 수 없어 in-memory 로 간다).
// 키는 Vultr 수집기와 공유 — 2초 페이싱 + rateLimit 65초 백오프 필수.
import { prisma } from "@/lib/db";
import { normTeam, type BackfilledLineup, type BackfilledSide } from "./manager-aggregate";

const AF = "https://v3.football.api-sports.io";
export const AF_LEAGUE_ID: Record<string, number> = {
  EPL: 39, LALIGA: 140, BUNDESLIGA: 78, SERIE_A: 135, LIGUE_1: 61, CHAMPIONSHIP: 40,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function afGet<T = unknown>(path: string, attempt = 0): Promise<T[]> {
  const res = await fetch(`${AF}${path}`, {
    headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY ?? "" },
  });
  const j = await res.json();
  if (j.errors && Object.keys(j.errors).length) {
    if (j.errors.rateLimit && attempt < 5) {
      await sleep(65_000);
      return afGet<T>(path, attempt + 1);
    }
    throw new Error(`af 에러 ${path}: ${JSON.stringify(j.errors)}`);
  }
  return j.response ?? [];
}

interface AfSideRaw {
  team: { id: number; name: string };
  formation: string | null;
  coach: { id: number; name: string } | null;
  startXI: { player: { id: number; name: string; number: number; pos: string; grid: string | null } }[];
}

function toSide(s: AfSideRaw): BackfilledSide {
  return {
    team: s.team.name,
    formation: s.formation,
    coach: s.coach?.name ?? null,
    startXI: (s.startXI ?? []).map((p) => p.player),
  };
}

/** af 시즌 표기 — 유럽 리그는 시즌 시작 연도 (2026-09 경기 → season 2026). */
function afSeason(d: Date): number {
  return d.getUTCMonth() + 1 >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

/** 기간 내 종료 경기의 af 라인업 수집 (우리 matchId 매핑 포함). 매핑 실패 경기는 로그 후 제외. */
export async function fetchAfLineupsForRange(league: string, from: Date, to: Date): Promise<BackfilledLineup[]> {
  const afLeague = AF_LEAGUE_ID[league];
  if (!afLeague) throw new Error(`af 리그 id 미등록: ${league}`);

  const ours = await prisma.match.findMany({
    where: { league, status: "FINISHED", startTime: { gte: from, lte: to } },
    select: { id: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
  });
  const byPair = new Map(ours.map((m) => [`${normTeam(m.homeTeam.name)}|${normTeam(m.awayTeam.name)}`, m.id]));

  const done = new Set(["FT", "AET", "PEN"]);
  const seasons = [...new Set([afSeason(from), afSeason(to)])];
  const targets: { afId: number; matchId: number; date: string }[] = [];
  for (const season of seasons) {
    interface AfFixtureItem {
      fixture: { id: number; date: string; status?: { short?: string } };
      teams: { home: { name: string }; away: { name: string } };
    }
    const fixtures = await afGet<AfFixtureItem>(`/fixtures?league=${afLeague}&season=${season}`);
    for (const f of fixtures) {
      const d = new Date(f.fixture.date);
      if (d < from || d > to || !done.has(f.fixture?.status?.short ?? "")) continue;
      const matchId = byPair.get(`${normTeam(f.teams.home.name)}|${normTeam(f.teams.away.name)}`);
      if (!matchId) {
        console.warn(`[af-lineup] 팀 쌍 미매칭 — 제외: ${f.teams.home.name} vs ${f.teams.away.name}`);
        continue;
      }
      targets.push({ afId: f.fixture.id, matchId, date: f.fixture.date });
    }
  }

  const out: BackfilledLineup[] = [];
  for (const t of targets) {
    const sides: AfSideRaw[] = await afGet(`/fixtures/lineups?fixture=${t.afId}`);
    if (sides.length >= 2) {
      out.push({ matchId: t.matchId, afFixtureId: t.afId, date: t.date, home: toSide(sides[0]), away: toSide(sides[1]) });
    }
    await sleep(2000);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
