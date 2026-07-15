// TheStatsAPI 경기별 player-stats 를 집계 → 선수 시즌 xG/xA/터치/빅찬스. data/player-advanced-thestats.json
//   EPL·세리에A 만(TheStatsAPI 커버리지). xG 는 시즌 엔드포인트에 없어 경기 레벨을 합산.
//   매치 목록 = player-match-heatmaps.json 의 union(추적 선수가 뛴 경기). 경기당 1콜로 전 선수.
//   실행: THESTATSAPI_KEY=... npx tsx scripts/build-player-advanced-thestats.ts
import { readFileSync, writeFileSync } from "fs";

const KEY = process.env.THESTATSAPI_KEY;
if (!KEY) { console.error("THESTATSAPI_KEY 필요"); process.exit(1); }
const BASE = "https://api.thestatsapi.com/api";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(path: string): Promise<unknown | null> {
  for (let i = 0; ; i++) {
    const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${KEY}` } });
    if (res.status === 429 && i < 5) { await sleep(2000 * (i + 1)); continue; }
    if (!res.ok) return null;
    return res.json();
  }
}

interface MapEntry { statsId: string }
interface PStat { player_id: string; played?: boolean; shooting?: { expected_goals?: number; expected_assists?: number; big_chances_created?: number }; general?: { touches?: number } }

(async () => {
  const map = JSON.parse(readFileSync("data/thestatsapi-player-map.json", "utf-8")) as Record<string, MapEntry>;
  const statsIdToTs: Record<string, string> = {};
  for (const [tsId, e] of Object.entries(map)) if (e.statsId) statsIdToTs[e.statsId] = tsId;

  const heatmaps = JSON.parse(readFileSync("data/player-match-heatmaps.json", "utf-8")) as Record<string, { matches?: { id: string }[] }>;
  const matchIds = new Set<string>();
  for (const d of Object.values(heatmaps)) for (const m of d.matches ?? []) if (m.id) matchIds.add(m.id);
  console.log(`매치 ${matchIds.size}개 · 추적 선수 ${Object.keys(statsIdToTs).length}명`);

  const agg: Record<string, { xg: number; xa: number; touches: number; bigChances: number; apps: number }> = {};
  let done = 0;
  for (const mid of matchIds) {
    const r = await api(`/football/matches/${mid}/player-stats`);
    await sleep(5500); // TheStatsAPI 레이트리밋 — 호출 간격 5.5초
    done++;
    const arr = (r as { data?: PStat[] })?.data ?? (r as PStat[]);
    if (Array.isArray(arr)) {
      for (const p of arr) {
        const tsId = statsIdToTs[p.player_id];
        if (!tsId || !p.played) continue;
        const a = (agg[tsId] ??= { xg: 0, xa: 0, touches: 0, bigChances: 0, apps: 0 });
        a.xg += p.shooting?.expected_goals ?? 0;
        a.xa += p.shooting?.expected_assists ?? 0;
        a.touches += p.general?.touches ?? 0;
        a.bigChances += p.shooting?.big_chances_created ?? 0;
        a.apps += 1;
      }
    }
    if (done % 50 === 0) console.log(`  ${done}/${matchIds.size}`);
  }

  const out: Record<string, { xg: number; xa: number; touches: number; bigChances: number; apps: number }> = {};
  for (const [tsId, a] of Object.entries(agg)) {
    if (a.apps < 1) continue;
    out[tsId] = { xg: Math.round(a.xg * 10) / 10, xa: Math.round(a.xa * 10) / 10, touches: a.touches, bigChances: a.bigChances, apps: a.apps };
  }
  writeFileSync("data/player-advanced-thestats.json", JSON.stringify(out));
  console.log(`완료: ${Object.keys(out).length}명 저장`);
})().catch((e) => { console.error("ERR", e); process.exit(1); });
