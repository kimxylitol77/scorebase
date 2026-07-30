// MLB 영문 → 한국어 선수명 사전 (네이버 스포츠 source).
// 흐름:
//   1) 우리 DB MLB Match (최근 N일) 조회 — 양팀명/일자/ESPN ID
//   2) 같은 일자 네이버 schedule API → games[] (gameId + 한글 팀명)
//   3) 양팀 한글명 매칭 → ESPN ↔ 네이버 gameId pair
//   4) 네이버 /record → home/away batter+pitcher 한글 (batOrder, pos)
//   5) ESPN summary → boxscore.players 영문 (batterRotation, starter)
//   6) batOrder 매칭 → 영문 ↔ 한글 dictionary
//   7) src/lib/sports/mlb-player-names-naver.ts 출력
//
// 실행: tsx scripts/build-mlb-player-names-naver.ts 7

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { toKoreanTeamName } from "../src/lib/team-names";

const DAYS = parseInt(process.argv[2] ?? "7", 10);
const UA = "Mozilla/5.0";
const OUT = "src/lib/sports/mlb-player-names-naver.ts";

interface NaverGame {
  gameId: string;
  homeTeamCode: string;
  homeTeamName: string;
  awayTeamCode: string;
  awayTeamName: string;
  gameDate: string;
}
interface NaverPlayer {
  name: string;
  batOrder?: string;
  pos?: string;
  posChange?: string;
}
interface NaverRecord {
  result?: {
    recordData?: {
      homeBatter?: NaverPlayer[];
      awayBatter?: NaverPlayer[];
      homePitcher?: NaverPlayer[];
      awayPitcher?: NaverPlayer[];
    };
  };
}
interface EspnSummary {
  header?: {
    competitions?: Array<{
      competitors?: Array<{
        homeAway?: "home" | "away";
        team?: { abbreviation?: string };
      }>;
    }>;
  };
  boxscore?: {
    players?: Array<{
      team?: { abbreviation?: string };
      statistics?: Array<{
        type?: string;
        athletes?: Array<{
          athlete?: { displayName?: string };
          starter?: boolean;
          batOrder?: number | string;
        }>;
      }>;
    }>;
  };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

async function naverSchedule(date: string): Promise<NaverGame[]> {
  const url = `https://api-gw.sports.naver.com/schedule/games?fields=basic,schedule,baseball&upperCategoryId=wbaseball&fromDate=${date}&toDate=${date}&size=500`;
  const data = await fetchJson<{ result?: { games?: NaverGame[] } }>(url);
  return (data?.result?.games ?? []).filter(
    (g: NaverGame & { categoryId?: string }) =>
      (g as { categoryId?: string }).categoryId === "mlb",
  );
}

type NaverRecordData = NonNullable<NonNullable<NaverRecord["result"]>["recordData"]>;

async function naverRecord(gameId: string): Promise<NaverRecordData | null> {
  const data = await fetchJson<NaverRecord>(
    `https://api-gw.sports.naver.com/schedule/games/${gameId}/record`,
  );
  return data?.result?.recordData ?? null;
}

async function espnSummary(gameId: string): Promise<EspnSummary | null> {
  return await fetchJson<EspnSummary>(
    `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${gameId}`,
  );
}

/** ESPN boxscore → home/away starter list (batOrder 순). team.abbreviation 으로 side 매핑. */
function espnStarters(s: EspnSummary): {
  home: Array<{ order: number; name: string }>;
  away: Array<{ order: number; name: string }>;
  homePitcher: string | null;
  awayPitcher: string | null;
} {
  const out = {
    home: [] as { order: number; name: string }[],
    away: [] as { order: number; name: string }[],
    homePitcher: null as string | null,
    awayPitcher: null as string | null,
  };
  const comp = s.header?.competitions?.[0]?.competitors ?? [];
  const homeAbbr = comp.find((c) => c.homeAway === "home")?.team?.abbreviation;
  const awayAbbr = comp.find((c) => c.homeAway === "away")?.team?.abbreviation;
  for (const team of s.boxscore?.players ?? []) {
    const abbr = team.team?.abbreviation;
    const side: "home" | "away" | null =
      abbr && abbr === homeAbbr ? "home" : abbr && abbr === awayAbbr ? "away" : null;
    if (!side) continue;
    for (const grp of team.statistics ?? []) {
      if (grp.type === "batting") {
        for (const a of grp.athletes ?? []) {
          if (a.starter === false) continue;
          const name = a.athlete?.displayName?.trim();
          const order = typeof a.batOrder === "string" ? parseInt(a.batOrder, 10) : a.batOrder;
          if (name && typeof order === "number" && order >= 1 && order <= 9) {
            out[side].push({ order, name });
          }
        }
      } else if (grp.type === "pitching") {
        const first = grp.athletes?.find((a) => a.starter !== false);
        const name = first?.athlete?.displayName?.trim();
        if (name) {
          if (side === "home") out.homePitcher = name;
          else out.awayPitcher = name;
        }
      }
    }
  }
  const dedupe = (arr: { order: number; name: string }[]) => {
    const seen = new Set<number>();
    return arr.filter((x) => (seen.has(x.order) ? false : (seen.add(x.order), true)));
  };
  out.home = dedupe(out.home).sort((a, b) => a.order - b.order);
  out.away = dedupe(out.away).sort((a, b) => a.order - b.order);
  return out;
}

/** 네이버 record → home/away starter list (batOrder 1~9) */
function naverStarters(r: NaverRecordData) {
  const pick = (list: NaverPlayer[] | undefined) => {
    if (!list) return [] as { order: number; name: string }[];
    const seen = new Set<number>();
    const out: { order: number; name: string }[] = [];
    for (const p of list) {
      const ord = parseInt(p.batOrder ?? "", 10);
      if (Number.isFinite(ord) && ord >= 1 && ord <= 9 && !seen.has(ord) && p.name) {
        seen.add(ord);
        out.push({ order: ord, name: p.name.trim() });
      }
    }
    return out.sort((a, b) => a.order - b.order);
  };
  return {
    home: pick(r.homeBatter),
    away: pick(r.awayBatter),
    homePitcher: r.homePitcher?.[0]?.name?.trim() ?? null,
    awayPitcher: r.awayPitcher?.[0]?.name?.trim() ?? null,
  };
}

/** "Atlanta Braves" → 네이버 "애틀랜타" (toKoreanTeamName 결과 첫 단어 + 매핑) */
function teamMatches(espnName: string, naverShortName: string): boolean {
  const ko = toKoreanTeamName(espnName);
  if (!ko) return false;
  // 네이버 short 가 우리 풀네임의 일부 포함하는지
  const koTokens = ko.split(/\s+/);
  const first = koTokens[0];
  if (first && naverShortName.includes(first)) return true;
  // 또는 우리 ko 가 네이버 short 포함
  if (ko.includes(naverShortName)) return true;
  // 일부 특수 케이스
  const SPECIAL: Record<string, string[]> = {
    "LA에인절스": ["LA 에인절스", "LA에인절스", "로스앤젤레스 에인절스", "에인절스"],
    "뉴욕메츠": ["뉴욕 메츠", "메츠"],
    "뉴욕양키스": ["뉴욕 양키스", "양키스"],
    "애슬레틱스": ["오클랜드 애슬레틱스", "오클랜드"],
    "마이애미": ["마이애미 말린스", "말린스"],
  };
  for (const [naver, ours] of Object.entries(SPECIAL)) {
    if (naverShortName === naver && ours.some((o) => ko.includes(o) || o.includes(ko))) return true;
  }
  return false;
}

async function main() {
  const prisma = new PrismaClient();
  const since = new Date(Date.now() - DAYS * 86400 * 1000);
  const matches = await prisma.match.findMany({
    where: { league: "MLB", startTime: { gte: since } },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "desc" },
  });
  console.log(`▶ MLB 매치 ${matches.length}건 (최근 ${DAYS}일)`);

  // 일자별 네이버 schedule 캐시
  const naverByDate = new Map<string, NaverGame[]>();
  const dict = new Map<string, string>();
  let pairOk = 0;
  let pairMiss = 0;

  for (const m of matches) {
    // 네이버는 KST 기준. 우리 startTime UTC → KST 일자.
    const kstDate = new Date(m.startTime.getTime() + 9 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    if (!naverByDate.has(kstDate)) naverByDate.set(kstDate, await naverSchedule(kstDate));
    const list = naverByDate.get(kstDate)!;
    const naverGame = list.find(
      (g) =>
        teamMatches(m.homeTeam.name, g.homeTeamName) &&
        teamMatches(m.awayTeam.name, g.awayTeamName),
    );
    if (!naverGame) {
      pairMiss++;
      continue;
    }
    pairOk++;

    const [rec, sum] = await Promise.all([
      naverRecord(naverGame.gameId),
      espnSummary(m.externalId),
    ]);
    if (!rec || !sum) continue;

    const espn = espnStarters(sum);
    const naver = naverStarters(rec);

    // home batters batOrder 매칭
    for (const e of espn.home) {
      const n = naver.home.find((x) => x.order === e.order);
      if (n) dict.set(e.name, n.name);
    }
    for (const e of espn.away) {
      const n = naver.away.find((x) => x.order === e.order);
      if (n) dict.set(e.name, n.name);
    }
    if (espn.homePitcher && naver.homePitcher) dict.set(espn.homePitcher, naver.homePitcher);
    if (espn.awayPitcher && naver.awayPitcher) dict.set(espn.awayPitcher, naver.awayPitcher);
    process.stdout.write(".");
  }
  console.log(
    `\n매치 매핑: ${pairOk}/${matches.length} ok, ${pairMiss} miss · 선수 dict: ${dict.size}`,
  );

  // 기존 사전 read + merge (우리가 우선)
  const outPath = resolve(OUT);
  const existing: Record<string, string> = {};
  if (existsSync(outPath)) {
    const m = readFileSync(outPath, "utf8").matchAll(/"([^"]+)":\s*"([^"]+)"/g);
    for (const x of m) existing[x[1]] = x[2];
  }
  const merged: Record<string, string> = { ...existing };
  let added = 0;
  let updated = 0;
  for (const [en, ko] of dict) {
    if (!(en in merged)) added++;
    else if (merged[en] !== ko) updated++;
    merged[en] = ko;
  }

  const sorted = Object.entries(merged).sort((a, b) => a[0].localeCompare(b[0]));
  const body = sorted
    .map(([en, ko]) => `  "${en.replace(/"/g, '\\"')}": "${ko.replace(/"/g, '\\"')}",`)
    .join("\n");
  const file = `// MLB 선수 영문 → 한국어 사전 (네이버 스포츠 source).
// 자동 생성: scripts/build-mlb-player-names-naver.ts
// Source: api-gw.sports.naver.com /record + ESPN boxscore.players batOrder 매칭

export const MLB_PLAYER_NAMES_NAVER_KO: Record<string, string> = {
${body}
};
`;
  writeFileSync(outPath, file);
  console.log(`✓ wrote ${OUT} — total ${sorted.length} entries (+${added}, updated ${updated})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
