// NBA 영문 → 한국어 선수명 사전 (네이버 스포츠 source).
// MLB 와 동일 패턴 — 단 NBA 는 batOrder 대신 starter 순서로 매칭.
//
// 실행: tsx scripts/build-nba-player-names-naver.ts 30

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { toKoreanTeamName } from "../src/lib/team-names";

const DAYS = parseInt(process.argv[2] ?? "30", 10);
const UA = "Mozilla/5.0";
const OUT = "src/lib/sports/nba-player-names-naver.ts";

interface NaverGame {
  gameId: string;
  homeTeamName: string;
  awayTeamName: string;
  categoryId?: string;
}
interface NaverNbaPlayer {
  lastName?: string;
  firstName?: string;
  pos?: string;
  jersey?: string;
  gs?: number;
}
interface NaverNbaRecord {
  result?: {
    recordData?: {
      homePlayerStats?: NaverNbaPlayer[];
      awayPlayerStats?: NaverNbaPlayer[];
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
        athletes?: Array<{
          athlete?: { displayName?: string };
          starter?: boolean;
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
  const url = `https://api-gw.sports.naver.com/schedule/games?fields=basic,schedule&upperCategoryId=wbasketball&fromDate=${date}&toDate=${date}&size=500`;
  const data = await fetchJson<{ result?: { games?: NaverGame[] } }>(url);
  return (data?.result?.games ?? []).filter((g) => g.categoryId === "nba");
}

async function naverRecord(gameId: string) {
  const data = await fetchJson<NaverNbaRecord>(
    `https://api-gw.sports.naver.com/schedule/games/${gameId}/record`,
  );
  return data?.result?.recordData ?? null;
}

async function espnSummary(gameId: string): Promise<EspnSummary | null> {
  return await fetchJson<EspnSummary>(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`,
  );
}

function espnStarters(s: EspnSummary): { home: string[]; away: string[] } {
  const out = { home: [] as string[], away: [] as string[] };
  const comp = s.header?.competitions?.[0]?.competitors ?? [];
  const homeAbbr = comp.find((c) => c.homeAway === "home")?.team?.abbreviation;
  const awayAbbr = comp.find((c) => c.homeAway === "away")?.team?.abbreviation;
  for (const team of s.boxscore?.players ?? []) {
    const abbr = team.team?.abbreviation;
    const side: "home" | "away" | null =
      abbr && abbr === homeAbbr ? "home" : abbr && abbr === awayAbbr ? "away" : null;
    if (!side) continue;
    const grp = team.statistics?.[0];
    if (!grp) continue;
    for (const a of grp.athletes ?? []) {
      if (a.starter !== true) continue;
      const name = a.athlete?.displayName?.trim();
      if (name) out[side].push(name);
    }
  }
  return out;
}

function naverStarters(r: NonNullable<Awaited<ReturnType<typeof naverRecord>>>) {
  const pick = (list: NaverNbaPlayer[] | undefined) => {
    if (!list) return [] as string[];
    return list
      .filter((p) => p.gs === 1 && (p.lastName || p.firstName))
      .map((p) => {
        const last = p.lastName?.trim() ?? "";
        const first = p.firstName?.trim() ?? "";
        return first && last ? `${first} ${last}` : last || first;
      });
  };
  return {
    home: pick(r.homePlayerStats),
    away: pick(r.awayPlayerStats),
  };
}

function teamMatches(espnName: string, naverShortName: string): boolean {
  const ko = toKoreanTeamName(espnName);
  if (!ko) return false;
  const first = ko.split(/\s+/)[0];
  if (first && naverShortName.includes(first)) return true;
  if (ko.includes(naverShortName)) return true;
  return false;
}

async function main() {
  const prisma = new PrismaClient();
  const since = new Date(Date.now() - DAYS * 86400 * 1000);
  const matches = await prisma.match.findMany({
    where: { league: "NBA", startTime: { gte: since } },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "desc" },
  });
  console.log(`▶ NBA 매치 ${matches.length}건 (최근 ${DAYS}일)`);

  const naverByDate = new Map<string, NaverGame[]>();
  const dict = new Map<string, string>();
  let pairOk = 0;
  let pairMiss = 0;

  for (const m of matches) {
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

    // home/away 양쪽 starter 순서 매칭 (5명 가정, ESPN/네이버 동일 순서)
    const minH = Math.min(espn.home.length, naver.home.length);
    for (let i = 0; i < minH; i++) dict.set(espn.home[i], naver.home[i]);
    const minA = Math.min(espn.away.length, naver.away.length);
    for (let i = 0; i < minA; i++) dict.set(espn.away[i], naver.away[i]);
    process.stdout.write(".");
  }
  console.log(
    `\n매치 매핑: ${pairOk}/${matches.length} ok, ${pairMiss} miss · 선수 dict: ${dict.size}`,
  );

  const outPath = resolve(OUT);
  let existing: Record<string, string> = {};
  if (existsSync(outPath)) {
    const m = readFileSync(outPath, "utf8").matchAll(/"([^"]+)":\s*"([^"]+)"/g);
    for (const x of m) existing[x[1]] = x[2];
  }
  const merged: Record<string, string> = { ...existing };
  let added = 0;
  for (const [en, ko] of dict) {
    if (!(en in merged)) added++;
    merged[en] = ko;
  }
  const sorted = Object.entries(merged).sort((a, b) => a[0].localeCompare(b[0]));
  const body = sorted
    .map(([en, ko]) => `  "${en.replace(/"/g, '\\"')}": "${ko.replace(/"/g, '\\"')}",`)
    .join("\n");
  const file = `// NBA 선수 영문 → 한국어 사전 (네이버 스포츠 source).
// 자동 생성: scripts/build-nba-player-names-naver.ts

export const NBA_PLAYER_NAMES_NAVER_KO: Record<string, string> = {
${body}
};
`;
  writeFileSync(outPath, file);
  console.log(`✓ wrote ${OUT} — total ${sorted.length} entries (+${added})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
