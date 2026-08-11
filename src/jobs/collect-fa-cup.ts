// FA컵 수집 잡 — TheSports diary(comp=9vjxm8gh8gr6odg) 전용. collect-friendlies 패턴.
//   왜 별도 잡인가: FA컵 예선(8~10월)은 비리그 팀 수백 개가 유입되는데, 워커 diary push 경로
//   (/api/internal/thesports-matches)는 팀을 생성하지 않아 전량 skippedNoTeam 으로 빠진다.
//   이 잡은 upsertMatch(resolveTeamId) 경로라 미등록 팀을 자동 생성한다. EPL~5부 상위 클럽은
//   seedTeamMappings 가 도메스틱 리그 행으로 선연결해 중복 팀 행 양산을 막는다.
//   TheSports 는 IP 화이트리스트지만 client 가 THESPORTS_PROXY_URL 로 우회하므로 어디서든 실행 가능.
//
//   실행: npx tsx --env-file=.env.local src/jobs/collect-fa-cup.ts [--future 14] [--past 3]
import "@/lib/env";
import { prisma } from "@/lib/db";
import { buildTheSportsFootballCollector } from "@/lib/sports/thesports/football-collector";
import { upsertMatch } from "@/jobs/collect";
import type { NormalizedMatch } from "@/lib/sports/types";

// 상위 클럽(EPL~내셔널리그)을 도메스틱 리그 행에 연결 — ts team id 로 기존 매핑을 찾아
//   FA_CUP 매핑을 선등록. 없으면 resolveTeamId 가 FA_CUP 네임스페이스에 새 행을 만든다(비리그 팀).
async function seedTeamMappings(matches: NormalizedMatch[]) {
  const tsIds = [
    ...new Set(matches.flatMap((m) => [m.homeTeam.externalId, m.awayTeam.externalId]).filter(Boolean)),
  ] as string[];
  if (!tsIds.length) return;
  const rows = await prisma.teamSourceId.findMany({
    where: { source: "thesports", externalId: { in: tsIds } },
    select: { externalId: true, teamId: true, league: true },
  });
  const canonical = new Map<string, number>();
  for (const r of rows) {
    // 컵 행 자체와 친선 행은 canonical 아님 — 도메스틱 리그 행 우선
    if (r.league === "FA_CUP" || r.league === "CLUB_FRIENDLY") continue;
    if (!canonical.has(r.externalId)) canonical.set(r.externalId, r.teamId);
  }
  for (const [externalId, teamId] of canonical) {
    await prisma.teamSourceId.upsert({
      where: { league_source_externalId: { league: "FA_CUP", source: "thesports", externalId } },
      create: { league: "FA_CUP", source: "thesports", externalId, teamId },
      update: {},
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

export async function collectFaCup(opts?: { futureDays?: number; pastDays?: number }) {
  const futureDays = opts?.futureDays ?? 14;
  const pastDays = opts?.pastDays ?? 3;
  const collector = buildTheSportsFootballCollector("FA_CUP");
  const start = addDays(todayKST(), -pastDays);
  const end = addDays(todayKST(), futureDays);
  console.log(`[collect-fa-cup] FA_CUP ${start} ~ ${end} (TheSports diary)`);

  let total = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    try {
      const matches = await collector.fetchByDate(d);
      await seedTeamMappings(matches);
      // 워커 push 경로와 소스 일치 — 팀은 thesports source 로 해석해야 같은 행을 재사용한다.
      for (const m of matches) await upsertMatch(m, { source: "thesports" });
      total += matches.length;
    } catch (e) {
      console.warn(`[collect-fa-cup] ${d} 실패:`, (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  console.log(`[collect-fa-cup] 완료 — ${total}경기 upsert`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const num = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? parseInt(args[i + 1]) : undefined;
  };
  collectFaCup({ futureDays: num("--future"), pastDays: num("--past") })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
