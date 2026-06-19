// KBO·NPB 팀 로스터를 scrape 해 data/baseball-rosters.json 으로 저장.
// 주 1회 갱신(weekly-static-refresh). 팀페이지는 이 정적 JSON 만 읽음 (런타임 scrape 금지).
// 키 = DB Team.id, 값 = [{ id(선수 pid), name, group(P=투수/B=야수) }].
import { prisma } from "../src/lib/db";
import {
  fetchKboPitcherIndex,
  fetchKboHitterIndex,
} from "../src/lib/sports/kbo-official";
import { fetchNpbRoster } from "../src/lib/sports/npb-official";
import { writeFileSync } from "fs";
import { join } from "path";

interface RosterPlayer {
  id: string;
  name: string;
  group: "P" | "B"; // 투수 / 야수
}

async function main() {
  const dbTeams = await prisma.team.findMany({
    where: { league: { in: ["KBO", "NPB"] } },
    select: { id: true, league: true, name: true },
  });
  const kboTeams = dbTeams.filter((t) => t.league === "KBO");
  const npbTeams = dbTeams.filter((t) => t.league === "NPB");
  const out: Record<string, RosterPlayer[]> = {};

  // ===== KBO — 투수 + 타자 (각 10팀 순회, 직렬: KBO 서버 부담 회피) =====
  // scrape 팀명(약칭 "삼성"·"SSG") → DB name 접두/포함 매칭.
  const matchKbo = (scrapeTeam: string | undefined): number | null => {
    if (!scrapeTeam) return null;
    return (
      kboTeams.find(
        (d) => d.name.startsWith(scrapeTeam) || d.name.includes(scrapeTeam),
      )?.id ?? null
    );
  };
  const pitchers = await fetchKboPitcherIndex();
  const hitters = await fetchKboHitterIndex();
  const seenKbo = new Set<string>();
  const addKbo = (
    e: { kboId: string; name: string; team?: string },
    g: "P" | "B",
  ) => {
    const tid = matchKbo(e.team);
    if (!tid || seenKbo.has(e.kboId)) return;
    seenKbo.add(e.kboId);
    (out[tid] ??= []).push({ id: e.kboId, name: e.name, group: g });
  };
  pitchers.forEach((p) => addKbo(p, "P"));
  hitters.forEach((p) => addKbo(p, "B"));

  // ===== NPB — 12팀 로스터 (teamKor === DB name 정확 일치) =====
  const roster = await fetchNpbRoster();
  const seenNpb = new Set<string>();
  for (const p of roster) {
    const t = npbTeams.find((d) => d.name === p.teamKor);
    if (!t || seenNpb.has(p.pid)) continue;
    seenNpb.add(p.pid);
    const name = p.fullName.replace(/　/g, " ").trim(); // 전각 공백 → 반각
    (out[t.id] ??= []).push({ id: p.pid, name, group: p.group });
  }

  const path = join(process.cwd(), "data", "baseball-rosters.json");
  writeFileSync(path, JSON.stringify(out));
  const total = Object.values(out).reduce((s, a) => s + a.length, 0);
  console.log(`로스터 저장: ${Object.keys(out).length}팀 ${total}명 → ${path}`);
  for (const t of [...kboTeams, ...npbTeams]) {
    const r = out[t.id];
    if (r) {
      const p = r.filter((x) => x.group === "P").length;
      console.log(`  [${t.league}] ${t.name}: 투수${p} 야수${r.length - p}`);
    } else {
      console.warn(`  [${t.league}] ${t.name}: 로스터 0 (매칭 실패?)`);
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
