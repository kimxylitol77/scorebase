// TheStatsAPI 시즌 히트맵(가중 좌표) → 개요 탭 시즌 활동 카드 데이터 (data/player-heatmap-analysis.json)
// 선수당 1콜. 좌표를 10x10 셀로 집계하고 3선/좌우 분포 요약을 계산해 PlayerHeatmapData 스키마로 저장.
// 경기수/출전분은 우리 data/player-season-stats.json 에서 가져온다 (없으면 0).
//   실행: THESTATSAPI_KEY=... npx tsx scripts/build-player-season-heatmaps.ts [--refresh]
//   기본은 미수집 선수만 (--refresh 면 전원 재수집).
import { readFileSync, writeFileSync, existsSync } from "fs";

const KEY = process.env.THESTATSAPI_KEY;
if (!KEY) { console.error("THESTATSAPI_KEY 필요"); process.exit(1); }
const BASE = "https://api.thestatsapi.com/api";
const MAP_PATH = new URL("../data/thestatsapi-player-map.json", import.meta.url).pathname;
const OUT = new URL("../data/player-heatmap-analysis.json", import.meta.url).pathname;
const SEASON_STATS = new URL("../data/player-season-stats.json", import.meta.url).pathname;
const REFRESH = process.argv.includes("--refresh");

async function api(path: string): Promise<unknown | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    // 네트워크 오류(EHOSTUNREACH 등)도 재시도한다 — 감싸지 않으면 fetch 의 throw 가 이 루프를
    // 뚫고 나가 스크립트가 통째로 죽는다 (2026-08-15 맥미니 IPv6 경로 끊김으로 발굴 321건 소실).
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, {
        headers: { Authorization: `Bearer ${KEY}` },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 5_000 * (attempt + 1)));
      continue;
    }
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 20_000 * (attempt + 1))); continue; }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${res.status} ${path}`);
    return res.json();
  }
  throw new Error(`429 지속 ${path}`);
}

async function main() {
  const map = JSON.parse(readFileSync(MAP_PATH, "utf8")) as Record<
    string,
    { statsId: string; competitionId: string; seasonId: string; seasonLabel: string; name: string }
  >;
  const seasonStats = existsSync(SEASON_STATS)
    ? (JSON.parse(readFileSync(SEASON_STATS, "utf8")) as Record<string, { matches: number | null; minutes: number | null }>)
    : {};
  const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};

  for (const [ourId, m] of Object.entries(map)) {
    // 이미 수집된 선수는 헛콜 방지 (--refresh 로 재수집).
    // 단 매핑 시즌이 바뀌었으면 다시 받는다 — 시즌만 비교 안 하면 26/27 로 갈아탄 뒤에도
    // 25/26 카드가 그대로 남아 "매핑은 새 시즌, 카드는 지난 시즌"으로 어긋난다.
    if (out[ourId]?.seasonId === m.seasonId && !REFRESH) continue;
    const res = (await api(
      `/football/players/${m.statsId}/competitions/${m.competitionId}/seasons/${m.seasonId}/heatmap`,
    )) as { data: { points: Array<{ x: number; y: number; count: number }> } } | null;
    await new Promise((r) => setTimeout(r, 6000)); // trial 분당 12회
    const points = res?.data?.points ?? [];
    if (points.length === 0) { console.log(`  ✗ ${m.name} — 시즌 데이터 없음`); continue; }

    const cellMap = new Map<string, number>();
    let total = 0, sx = 0, sy = 0, def = 0, mid = 0, att = 0, left = 0, center = 0, right = 0;
    for (const p of points) {
      const w = p.count;
      total += w; sx += p.x * w; sy += p.y * w;
      if (p.x < 100 / 3) def += w; else if (p.x < 200 / 3) mid += w; else att += w;
      if (p.y < 100 / 3) left += w; else if (p.y < 200 / 3) center += w; else right += w;
      const key = `${Math.min(9, Math.floor(p.x / 10)) * 10},${Math.min(9, Math.floor(p.y / 10)) * 10}`;
      cellMap.set(key, (cellMap.get(key) ?? 0) + w);
    }
    const cells = [...cellMap.entries()].map(([k, count]) => {
      const [x, y] = k.split(",").map(Number);
      return { x, y, count };
    });
    const st = seasonStats[ourId];
    out[ourId] = {
      source: "TheStatsAPI",
      sourcePlayerId: m.statsId,
      competitionId: m.competitionId,
      seasonId: m.seasonId,
      seasonLabel: m.seasonLabel,
      matches: st?.matches ?? 0,
      minutes: st?.minutes ?? 0,
      summary: {
        weightedPoints: total,
        averageX: sx / total,
        averageY: sy / total,
        defensiveThirdPct: (def / total) * 100,
        middleThirdPct: (mid / total) * 100,
        attackingThirdPct: (att / total) * 100,
        leftPct: (left / total) * 100,
        centerPct: (center / total) * 100,
        rightPct: (right / total) * 100,
      },
      cells,
    };
    writeFileSync(OUT, JSON.stringify(out)); // 선수 단위 저장
    console.log(`  ✓ ${m.name} — ${points.length}포인트, 가중 ${total}`);
  }
  console.log(`저장: ${OUT} (${Object.keys(out).length}명)`);
}
main();
