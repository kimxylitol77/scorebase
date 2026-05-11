// 시드 JSON 의 축구 선수에 api-football ID 를 매칭한다.
// /players?search={name}&season={year} 호출 → team_hint 와 매칭되는 ID 선택.
//
// 사용:
//   npm run players:match

import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = "https://v3.football.api-sports.io";
const SEED_PATH = path.join(process.cwd(), "data/players-seed.json");
const OUT_PATH = path.join(process.cwd(), "data/players-seed-matched.json");

interface SeedPlayer {
  _group?: string;
  name_en: string;
  name_ko: string;
  name_ko_alt?: string[];
  sport: "soccer" | "basketball" | "baseball" | "hockey";
  source_league: string;
  team_hint: string;
  nationality?: string;
}

interface MatchedPlayer extends SeedPlayer {
  api_football_id: number | null;
  match_confidence: "exact" | "fuzzy" | "none";
  match_note?: string;
}

function currentSeasonYear(league: string): number {
  // 유럽 축구 시즌은 8월 기준 (현재가 7월 이전이면 작년)
  const now = new Date();
  const m = now.getUTCMonth() + 1;
  const y = now.getUTCFullYear();
  if (league === "MLS") return y;
  return m < 7 ? y - 1 : y;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface ApiFootballPlayer {
  player: { id: number; name: string; firstname: string; lastname: string };
  statistics: Array<{ team: { id: number; name: string }; league: { name: string } }>;
}

async function searchPlayers(name: string): Promise<ApiFootballPlayer[]> {
  const url = new URL(`${BASE_URL}/players/profiles`);
  url.searchParams.set("search", name);
  const res = await fetch(url.toString(), {
    headers: { "x-apisports-key": API_KEY! },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { response?: ApiFootballPlayer[] };
  return json.response ?? [];
}

async function searchWithTeam(
  name: string,
  season: number,
): Promise<ApiFootballPlayer[]> {
  const url = new URL(`${BASE_URL}/players`);
  url.searchParams.set("search", name);
  url.searchParams.set("season", String(season));
  const res = await fetch(url.toString(), {
    headers: { "x-apisports-key": API_KEY! },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { response?: ApiFootballPlayer[] };
  return json.response ?? [];
}

function pickByTeam(
  candidates: ApiFootballPlayer[],
  teamHint: string,
): { player: ApiFootballPlayer; confidence: "exact" } | null {
  const t = normalize(teamHint);
  for (const c of candidates) {
    for (const stat of c.statistics ?? []) {
      const team = normalize(stat.team?.name ?? "");
      if (team.includes(t) || t.includes(team)) {
        return { player: c, confidence: "exact" };
      }
    }
  }
  return null;
}

async function matchOne(seed: SeedPlayer): Promise<MatchedPlayer> {
  if (seed.sport !== "soccer") {
    return {
      ...seed,
      api_football_id: null,
      match_confidence: "none",
      match_note: "non-soccer sport (별도 API 매칭 필요)",
    };
  }

  const season = currentSeasonYear(seed.source_league);
  let candidates: ApiFootballPlayer[] = [];
  try {
    candidates = await searchWithTeam(seed.name_en, season);
    if (candidates.length === 0) {
      candidates = await searchPlayers(seed.name_en);
    }
  } catch (e) {
    return {
      ...seed,
      api_football_id: null,
      match_confidence: "none",
      match_note: `API 호출 실패: ${(e as Error).message}`,
    };
  }

  if (candidates.length === 0) {
    return {
      ...seed,
      api_football_id: null,
      match_confidence: "none",
      match_note: "후보 0건",
    };
  }

  // team_hint exact match
  const teamMatch = pickByTeam(candidates, seed.team_hint);
  if (teamMatch) {
    return {
      ...seed,
      api_football_id: teamMatch.player.player.id,
      match_confidence: "exact",
      match_note: `${candidates.length}건 중 team 매칭`,
    };
  }

  // 후보 1명만 → fuzzy
  if (candidates.length === 1) {
    return {
      ...seed,
      api_football_id: candidates[0].player.id,
      match_confidence: "fuzzy",
      match_note: "1건 후보, team mismatch 지만 자동 채택",
    };
  }

  // 다수 후보 + team mismatch
  return {
    ...seed,
    api_football_id: null,
    match_confidence: "none",
    match_note: `${candidates.length}건 후보, team_hint 매칭 실패`,
  };
}

async function main() {
  if (!API_KEY) {
    console.error("[match] API_FOOTBALL_KEY 환경변수 필요");
    process.exit(1);
  }

  const raw = await fs.readFile(SEED_PATH, "utf-8");
  const seed = JSON.parse(raw) as { players: SeedPlayer[] };
  console.log(`[match] 시드 ${seed.players.length}명 로드`);

  const matched: MatchedPlayer[] = [];
  let exact = 0;
  let fuzzy = 0;
  let failed = 0;
  let skipped = 0;
  for (let i = 0; i < seed.players.length; i++) {
    const p = seed.players[i];
    const result = await matchOne(p);
    matched.push(result);

    if (result.match_confidence === "exact") exact++;
    else if (result.match_confidence === "fuzzy") fuzzy++;
    else if (p.sport !== "soccer") skipped++;
    else failed++;

    const status =
      result.match_confidence === "exact"
        ? "✅"
        : result.match_confidence === "fuzzy"
          ? "⚠️"
          : p.sport !== "soccer"
            ? "⏭"
            : "❌";
    console.log(
      `${status} [${i + 1}/${seed.players.length}] ${p.name_en} (${p.team_hint}) — ${result.match_confidence}${
        result.api_football_id ? ` id=${result.api_football_id}` : ""
      }${result.match_note ? ` · ${result.match_note}` : ""}`,
    );
    if (p.sport === "soccer") await sleep(300);
  }

  const out = {
    version: 1,
    matched_at: new Date().toISOString(),
    summary: { total: matched.length, exact, fuzzy, failed, skipped_non_soccer: skipped },
    matched,
  };
  await fs.writeFile(OUT_PATH, JSON.stringify(out, null, 2), "utf-8");
  console.log(
    `\n[match] 완료 — exact ${exact} · fuzzy ${fuzzy} · failed ${failed} · skipped ${skipped}`,
  );
  console.log(`[match] 결과 저장: ${path.relative(process.cwd(), OUT_PATH)}`);

  if (failed > 0 || fuzzy > 0) {
    console.log("\n⚠ 검수 필요:");
    for (const m of matched) {
      if (m.match_confidence === "fuzzy") {
        console.log(`  ⚠️ ${m.name_en} → id=${m.api_football_id} (fuzzy)`);
      }
      if (m.match_confidence === "none" && m.sport === "soccer") {
        console.log(`  ❌ ${m.name_en}: ${m.match_note}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
