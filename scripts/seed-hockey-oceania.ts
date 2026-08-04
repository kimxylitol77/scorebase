// 오세아니아 하키(AIHL·NZIHL) 팀 시드 + 과거 매치 백필 — 1회성, 멱등.
//   npx tsx --env-file=.env.local scripts/seed-hockey-oceania.ts <scan.json>
//
// 왜 백필이 필요한가. ice-hockey-match-collector 는 ±5일만 sweep 하고, TheSports 하키는
//   season/table 구독 권한이 없으며 diary 도 최근 ~30일까지만 열린다(그 이전은 code=405).
//   즉 워커 배포만으로는 이미 치른 경기가 영영 안 들어온다.
//
// 입력 = scan-oceania-hockey 산출 json ({ teams, matches }).
// 규칙은 워커 수신부(src/app/api/internal/thesports-matches/route.ts)와 같아야 한다 —
//   externalId = "ts-"+tsMatchId, status = mapIceHockeyStatus. 어기면 워커가 같은 경기를
//   다른 키로 다시 만든다.
import { readFileSync, writeFileSync } from "fs";
import axios from "axios";
import { prisma } from "@/lib/db";
import { mapIceHockeyStatus } from "@/lib/sports/thesports/status-codes";

const INPUT = process.argv[2] || "/tmp/oceania-hockey.json";
const MAPPING_FILES = [
  "src/lib/sports/thesports/ice-hockey-team-id-mapping.json",
  "lightsail-worker/ice-hockey-team-id-mapping.json",
];

interface ScanTeam {
  tsId: string;
  name: string;
  leagues: string[];
}
interface ScanMatch {
  tsMatchId: string;
  league: string;
  homeTsId: string;
  awayTsId: string;
  matchTime: number;
  statusId: number;
  homeScore: number | null;
  awayScore: number | null;
}
interface MappingRow {
  ourId: number;
  ourName: string;
  ourLeague: string;
  ourExternalId?: string;
  tsId: string;
  tsName: string;
  matchType: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 팀 로고 — diary 에는 없어서 team/list?uuid= 로 한 팀씩 받는다(15팀뿐이라 감당 가능) */
async function fetchLogo(tsId: string): Promise<string | null> {
  try {
    const { data } = await axios.get("https://api.thesports.com/v1/ice_hockey/team/list", {
      params: { user: process.env.THESPORTS_USER, secret: process.env.THESPORTS_SECRET, uuid: tsId },
      timeout: 20_000,
    });
    return data?.results?.[0]?.logo ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const scan = JSON.parse(readFileSync(INPUT, "utf-8")) as { teams: ScanTeam[]; matches: ScanMatch[] };
  const teams = scan.teams.filter((t) => t.leagues.length && t.name);

  // ── 1) 팀 ──
  const idByTs = new Map<string, number>();
  const rows: MappingRow[] = [];
  let created = 0;
  let updated = 0;

  for (const t of teams) {
    const league = t.leagues[0]; // 오세아니아 팀은 리그를 겸하지 않는다
    const logo = await fetchLogo(t.tsId);
    await sleep(700);

    const existing = await prisma.team.findFirst({ where: { league, externalId: t.tsId } });
    let ourId: number;
    if (existing) {
      await prisma.team.update({
        where: { id: existing.id },
        data: { name: t.name, ...(logo ? { logoUrl: logo } : {}) },
      });
      ourId = existing.id;
      updated++;
    } else {
      const row = await prisma.team.create({
        data: { league, externalId: t.tsId, name: t.name, logoUrl: logo },
      });
      ourId = row.id;
      created++;
    }
    await prisma.teamSourceId.upsert({
      where: { league_source_externalId: { league, source: "thesports", externalId: t.tsId } },
      create: { league, source: "thesports", externalId: t.tsId, teamId: ourId },
      update: { teamId: ourId },
    });
    idByTs.set(t.tsId, ourId);
    rows.push({
      ourId,
      ourName: t.name,
      ourLeague: league,
      ourExternalId: t.tsId,
      tsId: t.tsId,
      tsName: t.name,
      matchType: "diary",
    });
    console.log(`  ${league} ${t.name}${logo ? "" : " (로고 없음)"}`);
  }

  // ── 2) 매핑 json 2개 사본 — 자동 동기화가 없어 둘 다 써야 한다 ──
  for (const file of MAPPING_FILES) {
    let prev: MappingRow[] = [];
    try {
      prev = JSON.parse(readFileSync(file, "utf-8")) as MappingRow[];
    } catch {
      /* 최초 */
    }
    const merged = [...prev.filter((p) => !rows.some((r) => r.tsId === p.tsId)), ...rows];
    merged.sort((a, b) => a.ourLeague.localeCompare(b.ourLeague) || a.ourName.localeCompare(b.ourName));
    writeFileSync(file, JSON.stringify(merged, null, 2));
    console.log(`  매핑 ${file} — ${prev.length} → ${merged.length}`);
  }

  // ── 3) 매치 백필 ──
  let mUp = 0;
  let mSkip = 0;
  let mHidden = 0;
  for (const m of scan.matches) {
    // 워커(ice-hockey-match-collector.js:118-121)와 같은 가드.
    // status_id=0 = ABNORMAL(Suggest Hiding) — TheSports 가 같은 경기를 두 id 로 주고 한쪽을
    // 숨김 권장한다. 99 = TBD(시간 미정). 둘 다 넣으면 중복·유령 row 가 생긴다.
    if (m.statusId === 0 || m.statusId === 99) {
      mHidden++;
      continue;
    }
    const homeId = idByTs.get(m.homeTsId);
    const awayId = idByTs.get(m.awayTsId);
    if (!homeId || !awayId) {
      mSkip++;
      continue;
    }
    const status = mapIceHockeyStatus(m.statusId);
    const externalId = `ts-${m.tsMatchId}`;
    const scored = status === "FINISHED" && m.homeScore != null && m.awayScore != null;
    await prisma.match.upsert({
      where: { league_externalId: { league: m.league, externalId } },
      update: {
        status,
        startTime: new Date(m.matchTime * 1000),
        ...(scored ? { homeScore: m.homeScore, awayScore: m.awayScore } : {}),
      },
      create: {
        league: m.league,
        externalId,
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeScore: scored ? m.homeScore : null,
        awayScore: scored ? m.awayScore : null,
        status,
        startTime: new Date(m.matchTime * 1000),
      },
    });
    mUp++;
  }

  console.log(`\n팀 생성 ${created} · 갱신 ${updated} / 매치 upsert ${mUp} · 숨김·TBD 제외 ${mHidden} · 팀 미매핑 skip ${mSkip}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
