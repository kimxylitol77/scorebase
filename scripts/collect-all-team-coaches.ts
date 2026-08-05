// 전 리그 팀 감독 수집 — TheSports coach/list 전량 → TeamSourceId(thesports) 매칭 → Team.coach.
//   npx tsx --env-file=.env.local scripts/collect-all-team-coaches.ts [--dry]
//
// 왜 새로 만드나. 기존 build-team-coaches.ts 는 같은 coach/list 를 받아 **8리그만** 필터해
//   data/team-coaches.json 으로 떨군다(193팀). 라인업 화면에서 매칭률을 재보니 최근 60경기
//   coach_id 115건 중 8건(7%)뿐이었다 — 하위 리그가 통째로 빠진다.
//   이 잡은 리그 필터 없이 우리 Team 전체에 이름을 채운다.
//
// 한글 이름은 여기서 만들지 않는다. 표시 시점에 data/team-coaches.json 의 nameKo 를 우선
//   쓰고 없으면 원문을 그대로 보여준다 — 수천 명을 LLM 으로 번역하는 비용을 지금 치를 이유가
//   없고, 원문이라도 "감독 없음" 보다 낫다.
import { prisma } from "@/lib/db";

const DRY = process.argv.includes("--dry");
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;

interface CoachRow {
  id: string;
  team_id?: string;
  name?: string;
  /** 1 = 현직으로 관측됨. ts 가 과거 감독도 같이 내려주므로 최신 갱신분을 우선한다 */
  type?: number;
  updated_at?: number;
}

async function fetchAllCoaches(): Promise<CoachRow[]> {
  const all: CoachRow[] = [];
  for (let page = 1; page <= 400; page++) {
    const r = await fetch(
      `https://api.thesports.com/v1/football/coach/list?user=${TS_USER}&secret=${TS_SECRET}&page=${page}`,
      { signal: AbortSignal.timeout(25_000) },
    );
    const d = (await r.json()) as { code?: number; results?: CoachRow[] };
    const rows = d.results ?? [];
    all.push(...rows);
    if (page % 20 === 0) console.log(`  page ${page} — 누적 ${all.length}`);
    if (rows.length < 1000) break;
    await new Promise((res) => setTimeout(res, 500));
  }
  return all;
}

async function main() {
  if (!TS_USER || !TS_SECRET) throw new Error("THESPORTS_USER/SECRET 미설정");

  console.log("coach/list 전량 수집…");
  const coaches = await fetchAllCoaches();
  console.log(`감독 ${coaches.length}명`);

  // team_id 별 최신 1명 — ts 가 전임 감독도 함께 내려주므로 updated_at 이 최신인 것을 남긴다
  const latestByTeam = new Map<string, CoachRow>();
  for (const c of coaches) {
    if (!c.team_id || !c.name) continue;
    const prev = latestByTeam.get(c.team_id);
    if (!prev || (c.updated_at ?? 0) > (prev.updated_at ?? 0)) latestByTeam.set(c.team_id, c);
  }
  console.log(`team_id 보유 ${latestByTeam.size}팀`);

  // ts team id → 우리 Team.id
  const links = await prisma.teamSourceId.findMany({
    where: { source: "thesports", externalId: { in: [...latestByTeam.keys()] } },
    select: { externalId: true, teamId: true },
  });
  console.log(`우리 Team 과 연결된 ${links.length}건`);

  let updated = 0;
  let same = 0;
  for (const link of links) {
    const c = latestByTeam.get(link.externalId);
    if (!c?.name) continue;
    const team = await prisma.team.findUnique({ where: { id: link.teamId }, select: { coach: true } });
    if (!team) continue;
    if (team.coach === c.name) {
      same++;
      continue;
    }
    if (!DRY) await prisma.team.update({ where: { id: link.teamId }, data: { coach: c.name } });
    updated++;
  }

  const filled = await prisma.team.count({ where: { coach: { not: null } } });
  const total = await prisma.team.count();
  console.log(
    `\n갱신 ${updated} · 동일 ${same}${DRY ? " (DRY — 반영 안 함)" : ""} / Team.coach 보유 ${filled}/${total}`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
