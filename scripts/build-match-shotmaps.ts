// TheStatsAPI 매치 샷맵(슛 좌표·xG·골문 도착 좌표) 수집 → data/match-shotmaps-epl-2526.json
// 시즌 전 경기를 경기당 1콜로 수집. 이미 수집된 경기는 건너뜀(멱등). 표시용 필드만 추려 저장.
// key = TheStatsAPI 매치 id — 우리 Match 와의 연결은 date+팀명으로 통합 시점에 매핑.
//   실행: THESTATSAPI_KEY=... npx tsx scripts/build-match-shotmaps.ts
import { readFileSync, writeFileSync, existsSync } from "fs";

const KEY = process.env.THESTATSAPI_KEY;
if (!KEY) { console.error("THESTATSAPI_KEY 필요"); process.exit(1); }
const BASE = "https://api.thestatsapi.com/api";
const OUT = new URL("../data/match-shotmaps-epl-2526.json", import.meta.url).pathname;
const COMP = "comp_3039"; // EPL
const SEASON = "sn_6125938"; // 2025-26

async function api(path: string): Promise<unknown | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${KEY}` } });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 20_000 * (attempt + 1))); continue; }
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
      `/football/matches?competition_id=${COMP}&season_id=${SEASON}&per_page=50&page=${page}`,
    )) as { data: ApiMatch[] } | null;
    await new Promise((r) => setTimeout(r, 6000));
    if (!res) break;
    matches.push(...res.data);
    if (res.data.length < 50) break;
  }
  const finished = matches.filter((m) => m.status === "finished");
  console.log(`EPL 25/26 종료 경기 ${finished.length}, 기수집 ${Object.keys(out).length}`);

  let added = 0, empty = 0, done = 0;
  for (const m of finished) {
    done++;
    if (out[m.id]) continue;
    const res = (await api(`/football/matches/${m.id}/shotmap`)) as { data: ApiShot[] } | null;
    await new Promise((r) => setTimeout(r, 6000)); // trial 분당 12회
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
    if (added % 20 === 0) {
      writeFileSync(OUT, JSON.stringify(out));
      console.log(`  진행 ${done}/${finished.length} (신규 ${added}, 무데이터 ${empty})`);
    }
  }
  writeFileSync(OUT, JSON.stringify(out));
  console.log(`완료 — 신규 ${added}, 무데이터 ${empty}, 총 ${Object.keys(out).length}경기 → ${OUT}`);
}
main();
