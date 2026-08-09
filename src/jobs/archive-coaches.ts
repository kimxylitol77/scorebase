// 감독 재임 이력 아카이브 잡 — data/team-coaches.json(현 감독 스냅샷)을 매일 diff 해
// CoachTenureArchive 에 부임·이임을 축적한다. 교체 감지 = 같은 팀의 현직 행과 이름 불일치.
// 위키형 데이터 축적 (감독 축): 스냅샷은 덮어써져도 재임 이력은 영구히 남는다.
import "@/lib/env";
import { prisma } from "@/lib/db";
import rawCoaches from "../../data/team-coaches.json";
import rawTeamIdMapping from "@/lib/sports/thesports/team-id-mapping.json";

interface CoachEntry {
  id?: string;
  name: string;
  nameKo: string | null;
  joined: number | null; // epoch sec — ts 가 주는 실제 부임일
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "");

export async function runArchiveCoaches() {
  const out = { seeded: 0, changed: 0, unchanged: 0, filled: 0, unmapped: 0 };
  const entries = Object.entries(rawCoaches as Record<string, CoachEntry>);

  // ts team id → 우리 Team (JSON 키 = ts team external id).
  // 1차 TeamSourceId, 2차 team-id-mapping.json 폴백 — 국대(ASEAN 등)는 소스행이 없다 (기존 브리지 패턴).
  const src = await prisma.teamSourceId.findMany({
    where: { source: "thesports", externalId: { in: entries.map(([k]) => k) } },
    select: { externalId: true, teamId: true, team: { select: { league: true } } },
  });
  const byExt = new Map<string, { teamId: number; team: { league: string } }>(
    src.map((s) => [s.externalId, s]),
  );
  const mappingRows = rawTeamIdMapping as Array<{ ourId: number; tsId: string; ourLeague: string }>;
  for (const m of mappingRows) {
    if (!byExt.has(m.tsId)) byExt.set(m.tsId, { teamId: m.ourId, team: { league: m.ourLeague } });
  }

  // 현직 행 일괄 로드 (endedAt null)
  const active = await prisma.coachTenureArchive.findMany({ where: { endedAt: null } });
  const activeByTeam = new Map(active.map((a) => [a.teamId, a]));

  for (const [tsTeamId, c] of entries) {
    const hit = byExt.get(tsTeamId);
    if (!hit || !c?.name) {
      out.unmapped++;
      continue;
    }
    const cur = activeByTeam.get(hit.teamId);
    const joinedAt = c.joined ? new Date(c.joined * 1000) : null;
    if (!cur) {
      await prisma.coachTenureArchive.create({
        data: {
          teamId: hit.teamId,
          league: hit.team.league,
          coachId: c.id ?? null,
          name: c.name,
          nameKo: c.nameKo,
          joinedAt,
        },
      });
      out.seeded++;
    } else if (norm(cur.name) !== norm(c.name)) {
      // 감독 교체 관측 — 이전 감독 재임 종료 + 새 감독 현직 행
      await prisma.$transaction([
        prisma.coachTenureArchive.update({
          where: { id: cur.id },
          data: { endedAt: new Date(), updatedAt: new Date() },
        }),
        prisma.coachTenureArchive.create({
          data: {
            teamId: hit.teamId,
            league: hit.team.league,
            coachId: c.id ?? null,
            name: c.name,
            nameKo: c.nameKo,
            joinedAt,
          },
        }),
      ]);
      out.changed++;
    } else {
      // 동일 감독 — 비어 있던 한글명·부임일만 보강
      if ((!cur.nameKo && c.nameKo) || (!cur.joinedAt && joinedAt)) {
        await prisma.coachTenureArchive.update({
          where: { id: cur.id },
          data: {
            nameKo: cur.nameKo ?? c.nameKo,
            joinedAt: cur.joinedAt ?? joinedAt,
            updatedAt: new Date(),
          },
        });
        out.filled++;
      } else {
        out.unchanged++;
      }
    }
  }
  return out;
}

// 직접 실행 (npx tsx --env-file=.env.local src/jobs/archive-coaches.ts)
if (import.meta.url === `file://${process.argv[1]}`) {
  runArchiveCoaches()
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
