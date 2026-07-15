// TheStatsAPI 매치 샷맵(슛 좌표·xG·골문 도착 좌표) 수집 → data/match-shotmaps-{league}-2526.json
// 시즌 전 경기를 경기당 1콜로 수집. 이미 수집된 경기는 건너뜀(멱등). 표시용 필드만 추려 저장.
// key = TheStatsAPI 매치 id — 우리 Match 와의 연결은 date+팀명으로 통합 시점에 매핑.
//   실행: THESTATSAPI_KEY=... npx tsx scripts/build-match-shotmaps.ts [EPL|LALIGA|SERIE_A|BUNDESLIGA|LIGUE_1]
import { readFileSync, writeFileSync, existsSync } from "fs";

const KEY = process.env.THESTATSAPI_KEY;
if (!KEY) { console.error("THESTATSAPI_KEY 필요"); process.exit(1); }
const BASE = "https://api.thestatsapi.com/api";
const LEAGUES = {
  EPL: { competitionId: "comp_3039", seasonId: "sn_6125938", file: "epl" },
  LALIGA: { competitionId: "comp_8814", seasonId: "sn_7246390", file: "laliga" },
  SERIE_A: { competitionId: "comp_5840", seasonId: "sn_3061436", file: "serie-a" },
  BUNDESLIGA: { competitionId: "comp_4643", seasonId: "sn_5789634", file: "bundesliga" },
  LIGUE_1: { competitionId: "comp_0256", seasonId: "sn_6120181", file: "ligue-1" },
} as const;

type LeagueCode = keyof typeof LEAGUES;
const league = (process.argv[2] || "EPL").toUpperCase() as LeagueCode;
const cfg = LEAGUES[league];
if (!cfg) {
  console.error(`지원 리그: ${Object.keys(LEAGUES).join(", ")}`);
  process.exit(1);
}
const OUT = new URL(`../data/match-shotmaps-${cfg.file}-2526.json`, import.meta.url).pathname;
const REQUEST_DELAY_MS = Math.max(250, Number(process.env.THESTATSAPI_DELAY_MS ?? 6000));
const MATCH_LIMIT = Math.max(0, Number(process.env.THESTATSAPI_MATCH_LIMIT ?? 0));

async function api(path: string): Promise<unknown | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${KEY}` } });
    if (res.status === 429) {
      const resetAt = Number(res.headers.get("x-ratelimit-reset")) * 1000;
      const headerWait = Number.isFinite(resetAt) ? resetAt - Date.now() + 1500 : 0;
      const wait = Math.max(6_000, Math.min(65_000, headerWait || 20_000 * (attempt + 1)));
      console.log(`  429 — ${Math.ceil(wait / 1000)}초 후 재시도`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${res.status} ${path}`);
    return res.json();
  }
  throw new Error(`429 지속 ${path}`);
}

interface ApiShot {
  player_id: string; player_name: string; team_id: string; x: number; y: number; minute: number;
  result: string; expected_goals: number | null; situation: string | null; body_part: string | null;
  goal_mouth_location: string | null; goal_mouth_coordinates: { x: number; y: number; z: number } | null;
}

async function main() {
  const out: Record<string, unknown> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};

  type ApiMatch = {
    id: string; utc_date: string; status: string;
    home_team: { id: string; name: string }; away_team: { id: string; name: string };
    score: { home: number | null; away: number | null };
  };
  const matches: ApiMatch[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = (await api(
      `/football/matches?competition_id=${cfg.competitionId}&season_id=${cfg.seasonId}&per_page=50&page=${page}`,
    )) as { data: ApiMatch[] } | null;
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    if (!res) break;
    matches.push(...res.data);
    if (MATCH_LIMIT > 0 && matches.filter((match) => match.status === "finished").length >= MATCH_LIMIT) break;
    if (res.data.length < 50) break;
  }
  const allFinished = matches.filter((m) => m.status === "finished");
  const finished = MATCH_LIMIT > 0 ? allFinished.slice(0, MATCH_LIMIT) : allFinished;
  console.log(`${league} 25/26 종료 경기 ${allFinished.length}, 이번 실행 ${finished.length}, 기수집 ${Object.keys(out).length}`);

  let added = 0, empty = 0, done = 0;
  for (const m of finished) {
    done++;
    if (out[m.id]) continue;
    const res = (await api(`/football/matches/${m.id}/shotmap`)) as { data: ApiShot[] } | null;
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    const shots = res?.data ?? [];
    if (shots.length === 0) { empty++; continue; }
    out[m.id] = {
      date: m.utc_date.slice(0, 10),
      home: { id: m.home_team.id, name: m.home_team.name, score: m.score.home },
      away: { id: m.away_team.id, name: m.away_team.name, score: m.score.away },
      shots: shots.map((s) => ({
        pid: s.player_id, name: s.player_name, team: s.team_id,
        x: s.x, y: s.y, min: s.minute, result: s.result,
        xg: s.expected_goals, sit: s.situation, part: s.body_part,
        mouth: s.goal_mouth_location, mouthXyz: s.goal_mouth_coordinates,
      })),
    };
    added++;
    writeFileSync(OUT, JSON.stringify(out));
    if (added % 20 === 0) console.log(`  진행 ${done}/${finished.length} (신규 ${added}, 무데이터 ${empty})`);
  }
  writeFileSync(OUT, JSON.stringify(out));
  console.log(`완료 — 신규 ${added}, 무데이터 ${empty}, 총 ${Object.keys(out).length}경기 → ${OUT}`);
}
main();
