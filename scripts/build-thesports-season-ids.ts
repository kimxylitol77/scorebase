// 83개 운영 축구 리그의 ts season_id 수집.
// diary 14일 sweep + match/recent/list 결합으로 competition_id → season_id 추출.
// 결과: src/lib/sports/thesports/league-id-mapping.json 에 tsSeasonId 필드 추가.

import { readFileSync, writeFileSync } from "fs";
import path from "path";

const TS_BASE = "https://api.thesports.com";

// env — repo 루트 .env.local 이 있으면 파싱, 없으면(서버 자동 실행) process.env 사용.
// 절대경로 하드코딩이던 것을 제거 — Vultr 주간 자동 실행(season-id-refresh)에서도 돌게.
const env: Record<string, string> = { ...(process.env as Record<string, string>) };
try {
  for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* .env.local 없음 — process.env 만 사용 */
}
const user = env.THESPORTS_USER;
const secret = env.THESPORTS_SECRET;
if ((!user || !secret) && !env.THESPORTS_PROXY_URL) throw new Error("THESPORTS env missing");

// 시즌 id 를 절대 채우지 않는 리그 — 자동 실행이 사람 결정을 되돌리지 못하게 스크립트에 박음.
// J2_LEAGUE: tsSeasonId 가 붙으면 TS_COVERED 로 af 수집이 꺼짐(2026-08-08 결정, af 가 매치 소스).
// CLUB_FRIENDLY: 친선은 시즌·순위 개념이 없음.
const NO_SEASON_ID = new Set(["J2_LEAGUE", "CLUB_FRIENDLY"]);

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
  // 비화이트리스트 망에서도 실행 가능하게 — ts-proxy(Vultr) 경유 지원 (client.ts 와 같은 규약)
  const proxy = env.THESPORTS_PROXY_URL;
  const base = proxy || TS_BASE;
  const url = new URL(base + path);
  if (!proxy) {
    url.searchParams.set("user", user);
    url.searchParams.set("secret", secret);
  }
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), {
    headers: proxy ? { "x-ts-proxy-token": env.THESPORTS_PROXY_TOKEN ?? "" } : undefined,
  });
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
  const unresolved: string[] = [];
  for (const l of leagues) {
    if (NO_SEASON_ID.has(l.code)) {
      // 자동 채움 금지 리그 — 남아 있던 값도 제거해 상태를 강제
      if (l.tsSeasonId) {
        delete l.tsSeasonId;
        updated++;
      }
      continue;
    }
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
