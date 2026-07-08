// 클럽 친선(프리시즌) 수집 잡 — TheSports diary(comp=gpxwrxlhgpryk0j) 전용.
//   왜 별도 잡인가: 축구 매치 수집은 Vercel cron(api-football)에서 도는데, af 클럽친선(667)은
//   맨유·아스널 등 빅클럽 프리시즌을 누락한다. TheSports 가 커버가 넓지만 IP 화이트리스트라
//   Vercel 에선 호출 불가 → 고정 IP 워커(Vultr)에서 이 잡을 돌려 CLUB_FRIENDLY 를 채운다.
//   프리시즌은 미래 일정이라 넓은 윈도우(기본 +45일)로 선수집. 표시 전용(예측·순위·글 없음).
//
//   실행(화이트리스트 IP 에서): npx tsx --env-file=.env.local src/jobs/collect-friendlies.ts [--future 45] [--past 3]
import "@/lib/env";
import { prisma } from "@/lib/db";
import { buildTheSportsFootballCollector } from "@/lib/sports/thesports/football-collector";
import { upsertMatch } from "@/jobs/collect";
import type { NormalizedMatch } from "@/lib/sports/types";

// 친선 팀을 도메스틱 리그 행에 연결 — thesports team id 로 기존 매핑(EPL 맨유 등)을 찾아
//   CLUB_FRIENDLY 매핑을 선등록. resolveTeamId 의 이름 가드가 "Man United"↔"Manchester United"
//   처럼 표기 다른 빅클럽을 거부해 별도 친선 행을 만드는 문제를 우회한다(ts id 는 전역 고유).
async function seedTeamMappings(matches: NormalizedMatch[]) {
  const tsIds = [
    ...new Set(matches.flatMap((m) => [m.homeTeam.externalId, m.awayTeam.externalId]).filter(Boolean)),
  ] as string[];
  if (!tsIds.length) return;
  const rows = await prisma.teamSourceId.findMany({
    where: { source: "thesports", externalId: { in: tsIds } },
    select: { externalId: true, teamId: true, league: true },
  });
  const canonical = new Map<string, number>(); // ts id → 도메스틱 canonical teamId
  for (const r of rows) {
    if (r.league === "CLUB_FRIENDLY") continue; // 친선 행 자체는 canonical 아님
    if (!canonical.has(r.externalId)) canonical.set(r.externalId, r.teamId);
  }
  for (const [externalId, teamId] of canonical) {
    await prisma.teamSourceId.upsert({
      where: { league_source_externalId: { league: "CLUB_FRIENDLY", source: "thesports", externalId } },
      create: { league: "CLUB_FRIENDLY", source: "thesports", externalId, teamId },
      update: { teamId }, // 기존에 잘못(친선 행)으로 매핑됐던 것도 도메스틱 canonical 로 교정
    });
  }
}

function todayKST(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}
function addDays(yyyymmdd: string, delta: number): string {
  const d = new Date(yyyymmdd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export async function collectFriendlies(opts?: { futureDays?: number; pastDays?: number }) {
  const futureDays = opts?.futureDays ?? 45;
  const pastDays = opts?.pastDays ?? 3;
  const collector = buildTheSportsFootballCollector("CLUB_FRIENDLY");
  const start = addDays(todayKST(), -pastDays);
  const end = addDays(todayKST(), futureDays);
  console.log(`[collect-friendlies] CLUB_FRIENDLY ${start} ~ ${end} (TheSports diary)`);

  let total = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    try {
      const matches = await collector.fetchByDate(d);
      await seedTeamMappings(matches);
      for (const m of matches) await upsertMatch(m);
      total += matches.length;
    } catch (e) {
      console.warn(`[collect-friendlies] ${d} 실패:`, (e as Error).message);
    }
    // ts diary rate limit 배려
    await new Promise((r) => setTimeout(r, 120));
  }
  console.log(`[collect-friendlies] 완료 — ${total}경기 upsert`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const num = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? parseInt(args[i + 1]) : undefined;
  };
  collectFriendlies({ futureDays: num("--future"), pastDays: num("--past") })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
