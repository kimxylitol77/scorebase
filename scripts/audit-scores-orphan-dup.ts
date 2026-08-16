// /scores 카드 중복 감사 — af 날짜조회 orphan 이 DB 매치와 같은 경기인데 따로 뜨는지 점검.
//   npx tsx --env-file=.env.local scripts/audit-scores-orphan-dup.ts [YYYY-MM-DD ...]
//
// 판정은 /scores 와 **같은 함수**(lib/sports/orphan-dedup)를 쓴다 — 사본을 두면 규칙이
// 갈라져 재발을 놓친다. 프리시즌 클럽 친선처럼 소스별 팀 표기가 크게 갈리는 리그를
// 추가하거나 팀명 사전을 손본 뒤 이 스크립트로 그날 카드를 확인한다.
//
// 출력 3종.
//   [중복제거] 규칙이 잡아낸 것 — 짝지어진 DB 매치가 정말 같은 경기인지 눈으로 확인.
//   [잔여의심] 규칙은 통과했지만 같은 리그·2시간 내에 한쪽 팀이 겹치는 것 — 새 유형 후보.
//   나머지는 DB 에 없는 정상 orphan 이라 출력하지 않는다.
import "@/lib/env";
import { prisma } from "@/lib/db";
import { fetchSoccerByDate } from "@/lib/sports/live-scores";
import {
  buildOrphanDedup,
  normalizeTeamName,
  romanizeTeamName,
} from "@/lib/sports/orphan-dedup";

function todayKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

async function auditDate(date: string) {
  const dated = await fetchSoccerByDate(date);
  const matches = await prisma.match.findMany({
    where: {
      startTime: {
        gte: new Date(`${date}T00:00:00+09:00`),
        lt: new Date(`${date}T24:00:00+09:00`),
      },
    },
    include: { homeTeam: true, awayTeam: true },
  });

  const afTeamExtIds = [
    ...new Set(
      dated.flatMap((d) => [d.homeTeamExtId, d.awayTeamExtId]).filter(Boolean) as string[],
    ),
  ];
  const afTeamIdMap = new Map<string, Set<number>>();
  if (afTeamExtIds.length) {
    const rows = await prisma.teamSourceId.findMany({
      where: { source: "api-football", externalId: { in: afTeamExtIds } },
      select: { externalId: true, teamId: true },
    });
    for (const r of rows) {
      const s = afTeamIdMap.get(r.externalId) ?? new Set<number>();
      s.add(r.teamId);
      afTeamIdMap.set(r.externalId, s);
    }
  }

  const dbMatches = matches.map((m) => ({
    id: m.id,
    league: m.league,
    startTime: m.startTime,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeName: m.homeTeam.name,
    awayName: m.awayTeam.name,
    apiFixtureId: m.apiFixtureId,
    externalId: m.externalId,
  }));
  const dedup = buildOrphanDedup(dbMatches, dated, afTeamIdMap);

  const covered: string[] = [];
  const suspects: string[] = [];
  // 잔여 의심 — 규칙은 통과했지만 사람이 볼 만한 후보(같은 리그·±2h·한쪽 팀 이름 겹침).
  const loose = (dbName: string, dmName: string) => {
    const a = normalizeTeamName(dbName);
    const b = normalizeTeamName(dmName);
    const ra = romanizeTeamName(dbName);
    const rb = romanizeTeamName(dmName);
    const ov = (x: string, y: string) =>
      x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x));
    return ov(a, b) || ov(ra, rb);
  };

  for (const dm of dated) {
    const reason = dedup.reasonOf(dm);
    if (reason) {
      const p = dedup.pairedDbMatch(dm);
      covered.push(
        `  [${reason}] af: ${dm.league} | ${dm.homeName} vs ${dm.awayName} (${dm.startTime})\n` +
          (p
            ? `           DB: ${p.homeName} vs ${p.awayName} (${p.startTime.toISOString()})`
            : `           DB: (짝 특정 실패)`),
      );
      continue;
    }
    const dmMs = new Date(dm.startTime).getTime();
    const near = dbMatches.filter(
      (m) =>
        m.league === dm.league &&
        Math.abs(m.startTime.getTime() - dmMs) <= 120 * 60 * 1000 &&
        (loose(m.homeName, dm.homeName) ||
          loose(m.awayName, dm.awayName) ||
          loose(m.homeName, dm.awayName) ||
          loose(m.awayName, dm.homeName)),
    );
    for (const m of near) {
      suspects.push(
        `  af: ${dm.league} | ${dm.homeName} vs ${dm.awayName} (${dm.startTime})\n` +
          `      DB: ${m.homeName} vs ${m.awayName} (${m.startTime.toISOString()}) ${m.externalId}`,
      );
    }
  }

  // 사각지대 — [잔여의심] 은 "한쪽 팀이라도 이름이 겹칠 때"만 뜬다. 양팀 다 다른 이름으로
  // 실리면(af 가 구 팀명을 유지하는 CHINA_3, 로마자가 갈리는 RPL) 레이더 밖이라 0건으로
  // 통과한다(2026-08-16 실측: 중국 2건·러시아 1건이 이렇게 새어 화면에 카드 두 장).
  // 리그 단위 수량으로 잡는다 — af 경기가 DB 경기보다 많지 않은데 orphan 이 남으면, 그 리그의
  // af 경기는 원래 전부 DB 에 있어야 하므로 이름 규칙이 놓친 것이다.
  const perLeague = new Map<string, { af: number; db: number; orphan: number }>();
  for (const dm of dated) {
    const e = perLeague.get(dm.league) ?? { af: 0, db: 0, orphan: 0 };
    e.af++;
    if (!dedup.reasonOf(dm)) e.orphan++;
    perLeague.set(dm.league, e);
  }
  for (const m of dbMatches) {
    const e = perLeague.get(m.league) ?? { af: 0, db: 0, orphan: 0 };
    e.db++;
    perLeague.set(m.league, e);
  }
  const blind = [...perLeague.entries()]
    .filter(([, v]) => v.af > 0 && v.db > 0 && v.orphan > 0 && v.af <= v.db)
    .sort((a, b) => b[1].orphan - a[1].orphan);

  console.log(`\n===== ${date} | af ${dated.length}건 · DB ${matches.length}건 =====`);
  console.log(`[중복제거] ${covered.length}건`);
  for (const l of covered) console.log(l);
  console.log(`[잔여의심] ${suspects.length}건 — 같은 경기면 규칙 보강 대상`);
  for (const l of suspects) console.log(l);
  console.log(
    `[사각지대] ${blind.length}개 리그 — af 경기가 DB 보다 많지 않은데 orphan 이 남음(양팀 이름이 모두 어긋나는 유형)`,
  );
  for (const [lg, v] of blind) {
    console.log(`  ${lg} | af ${v.af}건 · DB ${v.db}건 · 살아남은 orphan ${v.orphan}건`);
    for (const dm of dated.filter((d) => d.league === lg && !dedup.reasonOf(d))) {
      console.log(`      af: ${dm.homeName} vs ${dm.awayName} (${dm.startTime})`);
    }
  }
}

(async () => {
  const dates = process.argv.slice(2);
  for (const d of dates.length ? dates : [todayKst()]) await auditDate(d);
  await prisma.$disconnect();
})();
