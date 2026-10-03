// V-리그 남녀 정규리그 시즌 전체 일정을 KOVO 공식 API 로 Match 에 적재하는 잡.
//
// ts diary 는 약 30일 앞까지만, 워커 sweep 은 +5일까지만 보여 개막 전 리그 페이지 일정 탭이 비었다(2026-10-03).
// KOVO user-api /stat/game-schedule 은 시즌 전체(남녀 각 126경기)를 준다. externalId = "kovo-{시즌코드}-{gnum}".
//
// ts 와의 관계 — ts 수집 라우트(thesports-matches)는 같은 리그·팀쌍·±90분 안에 "ts-" 아닌 행이 있으면 새 행을 만들지 않고
//  그 행에 ts 캐시를 붙여 상태·세트 스코어만 동기화한다. 그래서 KOVO 행이 먼저 있으면 그대로 정본이 되고 라이브는 ts 가 채운다.
//  반대로 ts 행이 이미 있는 경기는 여기서 만들지 않는다(중복 금지).
// 기존 KOVO 행 갱신 — 시작 전 경기의 킥오프 변경(KOVO 가 일정 정본), KOVO 에 결과가 있는데 아직 FINISHED 가 아닌 경기의 종료 처리.
//
//   실행: npx tsx --env-file=.env.local src/jobs/collect-kovo-schedule.ts [--season 023] [--write]
//   기본은 dry-run(쓰기 없음).
import "@/lib/env";
import { prisma } from "@/lib/db";
import { KOVO_TEAMS, kovoGet, fetchKovoCurrentSeason } from "@/lib/sports/kovo-api";

const LEAGUE_REGULAR = "201";
/** ts 라우트 dedup 창과 같은 값(배구 = 90분) */
const DEDUP_MS = 90 * 60 * 1000;

interface KovoScheduleGame {
  seasonCode: string; leagueCode: string; round: number; gender: string; gnum: number;
  hcode: string; acode: string; hsname: string; asname: string;
  gdate: string; gstime: string; hspoint: number; aspoint: number; place: string; result: string;
}

/** "2026-10-31" + "14:00" (KST) → Date */
const kstStart = (g: KovoScheduleGame) => new Date(`${g.gdate}T${g.gstime || "00:00"}:00+09:00`);

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const seasonArg = args[args.indexOf("--season") + 1];
  const seasonCode = args.includes("--season") ? seasonArg : await fetchKovoCurrentSeason();
  if (!seasonCode) throw new Error("KOVO 현재 시즌 코드를 못 받았다");
  console.log(`[kovo-schedule] season=${seasonCode} ${write ? "WRITE" : "DRY-RUN"}`);

  for (const gender of ["1", "2"] as const) {
    const league = gender === "1" ? "V_LEAGUE" : "V_LEAGUE_W";
    const p = await kovoGet<{ content?: KovoScheduleGame[] }>(
      `/stat/game-schedule?seasonCode=${seasonCode}&gender=${gender}&leagueCode=${LEAGUE_REGULAR}&page=0&size=500`,
      0,
    );
    const games = p?.content ?? [];
    if (!games.length) {
      console.log(`  ${league}: KOVO 일정 0건 — 건너뜀`);
      continue;
    }
    const existing = await prisma.match.findMany({
      where: { league },
      select: { id: true, externalId: true, homeTeamId: true, awayTeamId: true, startTime: true, status: true },
    });
    const byExt = new Map(existing.map((m) => [m.externalId, m]));

    const creates: { league: string; externalId: string; homeTeamId: number; awayTeamId: number; startTime: Date; status: string; homeScore: number | null; awayScore: number | null; raw: string }[] = [];
    const updates: { id: number; label: string; data: Record<string, unknown> }[] = [];
    const skipped: string[] = [];
    for (const g of games) {
      const home = KOVO_TEAMS[g.hcode];
      const away = KOVO_TEAMS[g.acode];
      const label = `${g.gdate} ${g.gstime} ${g.hsname}-${g.asname} (#${g.gnum})`;
      if (!home || !away || home.league !== league || away.league !== league) {
        skipped.push(`팀 매핑 없음 ${label} (${g.hcode}/${g.acode})`);
        continue;
      }
      const start = kstStart(g);
      const finished = !!g.result;
      const externalId = `kovo-${g.seasonCode}-${g.gnum}`;
      const cur = byExt.get(externalId);
      if (cur) {
        const data: Record<string, unknown> = {};
        if (cur.status === "SCHEDULED" && cur.startTime.getTime() !== start.getTime()) data.startTime = start;
        if (finished && cur.status !== "FINISHED") Object.assign(data, { status: "FINISHED", homeScore: g.hspoint, awayScore: g.aspoint });
        if (Object.keys(data).length) updates.push({ id: cur.id, label, data });
        continue;
      }
      // 다른 소스(ts)가 이미 만든 같은 경기 — 같은 팀쌍(양방향) ±90분
      const twin = existing.find(
        (m) =>
          !m.externalId.startsWith("kovo-") &&
          Math.abs(m.startTime.getTime() - start.getTime()) <= DEDUP_MS &&
          ((m.homeTeamId === home.teamId && m.awayTeamId === away.teamId) ||
            (m.homeTeamId === away.teamId && m.awayTeamId === home.teamId)),
      );
      if (twin) {
        skipped.push(`이미 있음 ${label} → ${twin.externalId}`);
        continue;
      }
      creates.push({
        league,
        externalId,
        homeTeamId: home.teamId,
        awayTeamId: away.teamId,
        startTime: start,
        status: finished ? "FINISHED" : "SCHEDULED",
        homeScore: finished ? g.hspoint : null,
        awayScore: finished ? g.aspoint : null,
        raw: JSON.stringify({ kovo: { seasonCode: g.seasonCode, gnum: g.gnum, round: g.round, place: g.place } }),
      });
    }

    const first = games[0];
    const last = games[games.length - 1];
    console.log(
      `  ${league}: KOVO ${games.length}경기 (${first.gdate} ~ ${last.gdate}) · 신규 ${creates.length} · 갱신 ${updates.length} · 건너뜀 ${skipped.length}`,
    );
    for (const c of creates.slice(0, 3)) {
      console.log(`    + ${c.externalId} ${c.startTime.toISOString()} ${c.homeTeamId} vs ${c.awayTeamId} ${c.status}`);
    }
    for (const u of updates.slice(0, 10)) console.log(`    ~ ${u.label} ${JSON.stringify(u.data)}`);
    for (const s of skipped.slice(0, 10)) console.log(`    - ${s}`);

    if (!write) continue;
    if (creates.length) {
      const r = await prisma.match.createMany({ data: creates, skipDuplicates: true });
      console.log(`    적재 ${r.count}건`);
    }
    for (const u of updates) await prisma.match.update({ where: { id: u.id }, data: u.data });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
