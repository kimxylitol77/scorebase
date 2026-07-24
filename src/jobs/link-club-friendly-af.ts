// 클럽 친선 매치를 api-football fixture 에 연결하는 잡 — Match.apiFixtureId + af 팀 매핑 적재.
//
//   왜: CLUB_FRIENDLY 는 TheSports 로 수집(ext="ts-…")하고 af 는 quota 이유로 보강에서
//   제외돼 있어 apiFixtureId 가 0/165 였다. 그래서 /scores 가 af 날짜조회 orphan 카드와
//   DB 매치를 합칠 때 기댈 것이 팀명뿐이라, 표기가 갈리면 같은 경기가 카드 두 장으로 떴다.
//   (2026-07-24 오볼론·클뤼프 NXT 중복 — lib/sports/orphan-dedup 참고.)
//
//   두 가지를 함께 적재한다. 매치가 확정되면 두 팀의 대응도 함께 확정되기 때문이다.
//     ① Match.apiFixtureId — 그 경기를 이름 규칙 없이 확정 판정
//     ② TeamSourceId(source="api-football") — 그 **팀의 앞으로 모든 경기**를 ID 로 판정.
//        매치 단위보다 레버리지가 커서, 돌수록 이름 규칙에 기댈 일이 줄어든다.
//
//   판정은 orphan-dedup 의 confirmedPairs — 양팀 이름 일치 + 킥오프 ±120분 + 1:1 일 때만.
//   영구 저장이라 표시용 dedup(한쪽 팀만 맞아도 숨김)보다 엄격하게 간다.
//
//   실행: npx tsx --env-file=.env.local src/jobs/link-club-friendly-af.ts [--days 4] [--dry]
import "@/lib/env";
import { prisma } from "@/lib/db";
import { fetchSoccerByDate } from "@/lib/sports/live-scores";
import { buildOrphanDedup } from "@/lib/sports/orphan-dedup";

const LEAGUE = "CLUB_FRIENDLY";

function kstDate(offsetDays: number): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400_000);
  return kst.toISOString().slice(0, 10);
}

export async function runLinkClubFriendlyAf(opts?: { days?: number; dry?: boolean }) {
  // 어제 ~ +N일 — 지난 경기도 한 칸 보는 이유는 킥오프가 밀려 어제로 넘어간 매치 회수.
  const days = opts?.days ?? 4;
  const dry = opts?.dry ?? false;
  let fixtureLinked = 0;
  let teamsMapped = 0;
  let pairs = 0;

  for (let i = -1; i < days; i++) {
    const date = kstDate(i);
    const dated = (await fetchSoccerByDate(date)).filter((d) => d.league === LEAGUE);
    if (!dated.length) continue;

    const matches = await prisma.match.findMany({
      where: {
        league: LEAGUE,
        startTime: {
          gte: new Date(`${date}T00:00:00+09:00`),
          lt: new Date(`${date}T24:00:00+09:00`),
        },
      },
      include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
    });
    if (!matches.length) continue;

    const dedup = buildOrphanDedup(
      matches.map((m) => ({
        id: m.id,
        league: m.league,
        startTime: m.startTime,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeName: m.homeTeam.name,
        awayName: m.awayTeam.name,
        apiFixtureId: m.apiFixtureId,
      })),
      dated,
      new Map(), // 팀 ID 맵은 여기선 불필요 — confirmedPairs 는 이름·시각만 본다
    );

    const confirmed = dedup.confirmedPairs();
    pairs += confirmed.length;

    for (const { dated: dm, db, swapped } of confirmed) {
      const fid = Number(/^af-(\d+)$/.exec(dm.id)?.[1]);
      if (!Number.isFinite(fid) || db.id == null) continue;

      if (db.apiFixtureId !== fid) {
        console.log(
          `  link #${db.id} ${db.homeName} vs ${db.awayName} → af ${fid}` +
            `${swapped ? " (홈원정 반대)" : ""}`,
        );
        if (!dry) {
          await prisma.match.update({ where: { id: db.id }, data: { apiFixtureId: fid } });
        }
        fixtureLinked++;
      }

      // 팀 매핑 — af 홈은 swapped 면 DB 원정에 대응한다.
      const teamPairs: Array<[string | undefined, number]> = [
        [dm.homeTeamExtId, swapped ? db.awayTeamId : db.homeTeamId],
        [dm.awayTeamExtId, swapped ? db.homeTeamId : db.awayTeamId],
      ];
      for (const [extId, teamId] of teamPairs) {
        if (!extId) continue;
        const existing = await prisma.teamSourceId.findUnique({
          where: {
            league_source_externalId: {
              league: LEAGUE,
              source: "api-football",
              externalId: extId,
            },
          },
          select: { teamId: true },
        });
        if (existing?.teamId === teamId) continue;
        // 이미 다른 팀에 물려 있으면 건드리지 않는다 — 잘못된 덮어쓰기가 더 위험하다.
        if (existing) {
          console.warn(
            `  ! af팀 ${extId} 는 이미 teamId=${existing.teamId} 에 매핑됨 (신규 ${teamId}) — 건너뜀`,
          );
          continue;
        }
        if (!dry) {
          await prisma.teamSourceId.create({
            data: { league: LEAGUE, source: "api-football", externalId: extId, teamId },
          });
        }
        teamsMapped++;
      }
    }
  }

  const tally = { pairs, fixtureLinked, teamsMapped, dry };
  console.log(`[link-club-friendly-af] ${JSON.stringify(tally)}`);
  return tally;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--days");
  runLinkClubFriendlyAf({
    days: i >= 0 ? parseInt(args[i + 1]) : undefined,
    dry: args.includes("--dry"),
  })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
