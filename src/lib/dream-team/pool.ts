// 드림팀 선수 풀 로더 — data/dream-pool.json 읽기·조회 (서버 전용, 캐싱)
import { readFileSync } from "fs";
import path from "path";

export interface DreamPlayer {
  id: string;
  name: string;
  pos: "GK" | "DF" | "MF" | "FW";
  rawPos: string;
  ovr: number;
  potential: number;
  value: number; // €M
  age: number | null;
  team: string;
  league: string;
  photo: string | null;
  radar: { axis: string; value: number; raw: string }[];
  saves: number;
  cleanSheets: number | null;
  matches: number;
}

type PoolEntry = Omit<DreamPlayer, "id">;

let cached: Record<string, PoolEntry> | null = null;
function load(): Record<string, PoolEntry> {
  if (cached) return cached;
  cached = JSON.parse(readFileSync(path.join(process.cwd(), "data/dream-pool.json"), "utf-8"));
  return cached!;
}

export function getDreamPlayers(ids: string[]): DreamPlayer[] {
  const pool = load();
  const out: DreamPlayer[] = [];
  for (const id of ids) {
    const p = pool[id];
    if (p) out.push({ id, ...p });
  }
  return out;
}

// 전체 풀을 배열로 (빌더 클라이언트 전달용)
export function allDreamPlayers(): DreamPlayer[] {
  const pool = load();
  return Object.entries(pool).map(([id, p]) => ({ id, ...p }));
}
