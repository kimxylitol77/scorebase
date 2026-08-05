// 이미 수집된 축구 매치의 venueId 를 raw 에서 채운다 — 외부 API 호출 없음.
//
//   npm run backfill:match-venue                # dry-run (기본)
//   npm run backfill:match-venue -- --write     # DB 기록
//   npm run backfill:match-venue -- --days 120  # 최근 N 일만 (기본 전체)
//
// 왜 raw 로 되는가.
//   TheSports football match/diary 응답에는 경기별 venue_id 가 들어 있고, collect 가 응답
//   전체를 raw 에 그대로 저장해 왔다. 즉 데이터는 처음부터 있었고 컬럼에만 안 옮겨졌다.
//
// 왜 필요한가.
//   지금까지는 홈팀 기본 구장으로 추정했다. 중립 경기장(UCL 결승·제재 경기)에서는 구장도,
//   구장 도시로 조회하는 날씨도 틀린 값이 나온다. 경기별 venue 가 있으면 그 문제가 사라지고,
//   팀-구장 매핑이 아예 없는 리그도 함께 채워진다.
//
// 건드리지 않는 것.
//   - venueId 가 이미 있는 매치
//   - raw 가 없거나 venue_id 가 비어 있는 매치 (ts 외 소스 수집분)

import { prisma } from "../src/lib/db";
import { SOCCER_LEAGUES } from "../src/lib/sports/sport-leagues";

const has = (n: string) => process.argv.includes(`--${n}`);
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : undefined;
}

/** raw JSON 문자열에서 venue_id 추출. 형태가 다르면 null. */
function venueIdFromRaw(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { venue_id?: unknown };
    const v = parsed?.venue_id;
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

async function main() {
  const write = has("write");
  const days = Number(arg("days") ?? 0);

  const matches = await prisma.match.findMany({
    where: {
      league: { in: [...SOCCER_LEAGUES] },
      venueId: null,
      externalId: { startsWith: "ts-" },
      ...(days > 0
        ? { startTime: { gte: new Date(Date.now() - days * 86400_000) } }
        : {}),
    },
    select: { id: true, league: true, raw: true },
  });

  const updates: { id: number; venueId: string; league: string }[] = [];
  let noVenueInRaw = 0;
  for (const m of matches) {
    const venueId = venueIdFromRaw(m.raw);
    if (!venueId) {
      noVenueInRaw++;
      continue;
    }
    updates.push({ id: m.id, venueId, league: m.league });
  }

  const byLeague = new Map<string, number>();
  for (const u of updates) byLeague.set(u.league, (byLeague.get(u.league) ?? 0) + 1);

  console.log(`venueId 없는 ts 축구 매치 ${matches.length}건 스캔 · 채울 수 있는 것 ${updates.length}건`);
  console.log(`raw 에 venue_id 없음: ${noVenueInRaw}건`);
  for (const [lg, n] of [...byLeague.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${lg.padEnd(22)} ${n}`);
  }

  if (updates.length === 0) return;
  if (!write) {
    console.log(`\nDRY-RUN 이라 DB 를 건드리지 않았다. 기록하려면 --write.`);
    return;
  }

  // venue 별로 묶어 updateMany — 매치 수만큼 UPDATE 를 날리지 않는다.
  const idsByVenue = new Map<string, number[]>();
  for (const u of updates) {
    if (!idsByVenue.has(u.venueId)) idsByVenue.set(u.venueId, []);
    idsByVenue.get(u.venueId)!.push(u.id);
  }
  let done = 0;
  for (const [venueId, ids] of idsByVenue) {
    const res = await prisma.match.updateMany({ where: { id: { in: ids } }, data: { venueId } });
    done += res.count;
  }
  console.log(`\n${done}건 갱신 완료 (구장 ${idsByVenue.size}종)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
