// 83개 운영 축구 리그의 ts season_id 수집.
// diary 14일 sweep + match/recent/list 결합으로 competition_id → season_id 추출.
// 결과: src/lib/sports/thesports/league-id-mapping.json 에 tsSeasonId 필드 추가.

import { readFileSync, writeFileSync } from "fs";
import path from "path";

const TS_BASE = "https://api.thesports.com";

// .env.local 수동 파싱
const env: Record<string, string> = {};
for (const line of readFileSync("/Users/kimss/scorebase/.env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const user = env.THESPORTS_USER;
const secret = env.THESPORTS_SECRET;
if (!user || !secret) throw new Error("THESPORTS env missing");

interface LeagueMapping {
  code: string;
  ourLabel?: string;
  tsId: string;
  tsEn?: string;
  tsKo?: string;
  /** 신규 v4: 현 시즌 season_id (standings 조회용) */
  tsSeasonId?: string;
}

interface FootballMatch {
  id: string;
  competition_id: string;
  season_id: string;
  match_time: number;
}

async function tsGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(TS_BASE + path);
  url.searchParams.set("user", user);
  url.searchParams.set("secret", secret);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function main() {
  const mapFile = path.join(process.cwd(), "src/lib/sports/thesports/league-id-mapping.json");
  const leagues: LeagueMapping[] = JSON.parse(readFileSync(mapFile, "utf-8"));
  console.log(`총 league 수: ${leagues.length}`);

  const competitionToSeason = new Map<string, string>();

  // 1. match/recent/list — historical 988개 (전체 활성 시즌)
  try {
    const d = await tsGet<{ code: number; results: FootballMatch[] }>("/v1/football/match/recent/list");
    for (const m of d.results ?? []) {
      if (m.competition_id && m.season_id) competitionToSeason.set(m.competition_id, m.season_id);
    }
    console.log(`recent/list 에서 ${competitionToSeason.size} competitions 수집`);
  } catch (e) {
    console.warn(`recent/list 실패: ${(e as Error).message}`);
  }

  // 2. diary 21일 sweep (앞 14 + 뒤 7) — 활성 매치 없는 리그도 보강
  const now = Math.floor(Date.now() / 1000);
  const DAY = 86400;
  for (let offset = -14; offset <= 7; offset++) {
    const tsp = now + offset * DAY;
    try {
      const d = await tsGet<{ code: number; results: FootballMatch[] }>("/v1/football/match/diary", { tsp });
      const before = competitionToSeason.size;
      for (const m of d.results ?? []) {
        if (m.competition_id && m.season_id && !competitionToSeason.has(m.competition_id)) {
          competitionToSeason.set(m.competition_id, m.season_id);
        }
      }
      const added = competitionToSeason.size - before;
      if (added > 0) console.log(`  diary offset=${offset} → +${added} (total ${competitionToSeason.size})`);
    } catch (e) {
      console.warn(`  diary offset=${offset} 실패: ${(e as Error).message}`);
    }
    // rate limit 보호 200ms
    await new Promise((r) => setTimeout(r, 200));
  }

  // 3. league-id-mapping.json 업데이트
  let updated = 0;
  let unresolved: string[] = [];
  for (const l of leagues) {
    const sid = competitionToSeason.get(l.tsId);
    if (sid) {
      if (l.tsSeasonId !== sid) {
        l.tsSeasonId = sid;
        updated++;
      }
    } else if (!l.tsSeasonId) {
      unresolved.push(`${l.code} (${l.tsEn ?? "?"})`);
    }
  }

  console.log(`\n=== 결과 ===`);
  console.log(`업데이트: ${updated}`);
  console.log(`resolved 총: ${leagues.filter((l) => l.tsSeasonId).length} / ${leagues.length}`);
  console.log(`미해결 (오프시즌·휴면 가능): ${unresolved.length}`);
  for (const u of unresolved.slice(0, 30)) console.log(`  - ${u}`);

  writeFileSync(mapFile, JSON.stringify(leagues, null, 2));
  console.log(`\n저장: ${mapFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
